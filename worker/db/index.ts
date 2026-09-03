import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "./schema.ts";

// Единственная точка входа к базе. Остальной код (маршруты API и т.д.)
// не должен импортировать drizzle-orm или обращаться к env.DB напрямую —
// только вызывать функции отсюда. При смене платформы меняется этот файл.
export interface DbEnv {
  DB: D1Database;
}

function client(env: DbEnv) {
  return drizzle(env.DB, { schema });
}

export async function getContracts(env: DbEnv) {
  return client(env)
    .select({
      id: schema.contracts.id,
      contractNum: schema.contracts.contractNum,
      clientName: schema.contracts.clientName,
      legalEntity: schema.contracts.legalEntity,
      status: schema.contracts.status,
      manager: schema.contracts.manager,
      updatedAt: schema.contracts.updatedAt,
    })
    .from(schema.contracts)
    .all();
}

// Форма строк — ровно InvoiceRow, которую ожидает worker/core/mrr.mjs
// (periodStart/invoiceAmount/paidStatus), чтобы маршрут мог передать
// результат прямо в ядро без дополнительного маппинга.
export async function getMonthlyInvoices(env: DbEnv) {
  return client(env)
    .select({
      periodStart: schema.periods.periodStart,
      invoiceAmount: schema.invoices.invoiceAmount,
      paidStatus: schema.invoices.paidStatus,
    })
    .from(schema.invoices)
    .innerJoin(schema.periods, eq(schema.invoices.periodId, schema.periods.id))
    .all();
}

// Форма строк — ровно InvoiceRow, которую ожидает worker/core/arpu.mjs
// (contractNum/periodStart/paidStatus вместо invoiceAmount у MRR) —
// та же форма, что использовалась в golden-тесте ARPU (scripts/test-golden-arpu.mjs).
export async function getArpuInvoices(env: DbEnv) {
  return client(env)
    .select({
      contractNum: schema.contracts.contractNum,
      periodStart: schema.periods.periodStart,
      paidStatus: schema.invoices.paidStatus,
    })
    .from(schema.invoices)
    .innerJoin(schema.contracts, eq(schema.invoices.contractId, schema.contracts.id))
    .innerJoin(schema.periods, eq(schema.invoices.periodId, schema.periods.id))
    .all();
}

// Форма строк — ровно TariffRow, которую ожидает worker/core/arpu.mjs.
export async function getTariffs(env: DbEnv) {
  return client(env)
    .select({
      contractNum: schema.contracts.contractNum,
      tariff: schema.tariffs.tariff,
      effectiveFrom: schema.tariffs.effectiveFrom,
    })
    .from(schema.tariffs)
    .innerJoin(schema.contracts, eq(schema.tariffs.contractId, schema.contracts.id))
    .all();
}

// --- Пользователи и сессии ---

export const LOGIN_LOCK_THRESHOLD = 5;
export const LOGIN_LOCK_MINUTES = 15;

export async function getUserByUsername(env: DbEnv, username: string) {
  const rows = await client(env)
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

export async function getUserById(env: DbEnv, id: number) {
  const rows = await client(env)
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)
    .all();
  return rows[0] ?? null;
}

// Увеличивает счётчик неудачных попыток; при достижении порога временно
// блокирует учётку (locked_until). Вызывается на каждый неверный пароль.
export async function registerFailedLogin(env: DbEnv, userId: number, failedAttempts: number) {
  const attempts = failedAttempts + 1;
  const lockedUntil =
    attempts >= LOGIN_LOCK_THRESHOLD
      ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000).toISOString()
      : null;
  await client(env)
    .update(schema.users)
    .set({ failedAttempts: attempts, lockedUntil, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, userId))
    .run();
}

export async function resetLoginAttempts(env: DbEnv, userId: number) {
  await client(env)
    .update(schema.users)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, userId))
    .run();
}

export async function createSession(
  env: DbEnv,
  params: { userId: number; tokenHash: string; expiresAt: string },
) {
  await client(env)
    .insert(schema.sessions)
    .values({
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export async function deleteSessionByTokenHash(env: DbEnv, tokenHash: string) {
  await client(env).delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).run();
}

// Возвращает пользователя по хешу токена сессии, если сессия существует и не
// истекла (истёкшую запись заодно удаляет). Иначе null.
export async function getUserBySessionTokenHash(env: DbEnv, tokenHash: string) {
  const rows = await client(env)
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.tokenHash, tokenHash))
    .limit(1)
    .all();
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt <= new Date().toISOString()) {
    await deleteSessionByTokenHash(env, tokenHash);
    return null;
  }
  return row.user;
}
