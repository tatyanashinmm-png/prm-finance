import { Hono, type Context, type Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  getContracts,
  getMonthlyInvoices,
  getUserByUsername,
  getUserBySessionTokenHash,
  registerFailedLogin,
  resetLoginAttempts,
  createSession,
  deleteSessionByTokenHash,
} from "./db/index.ts";
import type { UserRole } from "./db/schema.ts";
import { computeMonthlyMetrics } from "./core/mrr.mjs";
import { verifyPassword, DUMMY_HASH } from "./auth/password.ts";
import {
  generateSessionToken,
  hashSessionToken,
  newExpiry,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./auth/session.ts";

interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

type AppEnv = { Bindings: Env; Variables: { user: AuthUser } };

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true, service: "prm-finance" }));

// --- auth ---

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return c.json({ error: "username и пароль обязательны" }, 400);
  }

  const user = await getUserByUsername(c.env, username);

  if (!user) {
    // Тратим время как при реальной проверке пароля, чтобы по времени ответа
    // нельзя было понять, существует ли такой username.
    await verifyPassword(password, DUMMY_HASH);
    return c.json({ error: "неверный логин или пароль" }, 401);
  }

  if (user.lockedUntil && user.lockedUntil > new Date().toISOString()) {
    return c.json({ error: "слишком много неудачных попыток, попробуйте позже" }, 429);
  }

  if (!user.isActive) {
    return c.json({ error: "учётная запись отключена" }, 403);
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    await registerFailedLogin(c.env, user.id, user.failedAttempts);
    return c.json({ error: "неверный логин или пароль" }, 401);
  }

  await resetLoginAttempts(c.env, user.id);

  const token = generateSessionToken();
  const tokenHash = await hashSessionToken(token);
  await createSession(c.env, { userId: user.id, tokenHash, expiresAt: newExpiry() });

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return c.json({ username: user.username, role: user.role });
});

app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await deleteSessionByTokenHash(c.env, await hashSessionToken(token));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await getUserBySessionTokenHash(c.env, await hashSessionToken(token)) : null;
  if (!user || !user.isActive) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", { id: user.id, username: user.username, role: user.role as UserRole });
  await next();
}

// Заготовка для будущей проверки ролей на конкретных маршрутах.
// Пока нигде не подключена — все аутентифицированные роли видят одно и то же.
export function requireRole(...roles: UserRole[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}

app.get("/api/auth/me", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({ username: user.username, role: user.role });
});

app.get("/api/contracts", requireAuth, async (c) => {
  const contracts = await getContracts(c.env);
  return c.json({ contracts });
});

app.get("/api/metrics/monthly", requireAuth, async (c) => {
  const invoices = await getMonthlyInvoices(c.env);
  const byPeriod = computeMonthlyMetrics(invoices);
  const months = [...byPeriod.values()]
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((m) => ({
      period_start: m.periodStart,
      issued_amount: m.issuedAmount,
      issued_count: m.issuedCount,
      paid_count: m.paidCount,
      mrr: m.mrr,
    }));
  return c.json({ months });
});

// --- страница приложения: без валидной сессии редиректим на /login ---

const ASSET_FILE_RE = /\.[a-zA-Z0-9]+$/;

app.get("*", async (c) => {
  const path = new URL(c.req.url).pathname;

  // Файлы статики (js/css/svg/иконки и т.д.) отдаём всегда — иначе даже
  // страница входа не сможет загрузить свой собственный код. В dev-режиме
  // Vite также подгружает служебные модули без расширения в пути
  // (например /@vite/client, /@react-refresh) — их регэксп по расширению
  // не ловит, поэтому дополнительно смотрим на Sec-Fetch-Mode: браузер
  // ставит "navigate" только для прямого перехода по адресу, а не для
  // подгрузки скриптов/стилей/шрифтов внутри уже открытой страницы.
  const fetchMode = c.req.header("Sec-Fetch-Mode");
  const isSubResource =
    (path !== "/" && ASSET_FILE_RE.test(path)) || (fetchMode !== undefined && fetchMode !== "navigate");
  if (isSubResource) {
    return c.env.ASSETS.fetch(c.req.raw);
  }

  if (path === "/login") {
    return c.env.ASSETS.fetch(c.req.raw);
  }

  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await getUserBySessionTokenHash(c.env, await hashSessionToken(token)) : null;
  if (!user || !user.isActive) {
    return c.redirect("/login");
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
