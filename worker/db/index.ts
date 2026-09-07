import { drizzle } from "drizzle-orm/d1";
import { eq, inArray } from "drizzle-orm";
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
      note: schema.contracts.note,
      updatedAt: schema.contracts.updatedAt,
    })
    .from(schema.contracts)
    .all();
}

// Форма строк — ровно InvoiceRow, которую ожидает worker/core/mrr.mjs
// (periodStart/invoiceAmount/paidStatus), чтобы маршрут мог передать
// результат прямо в ядро без дополнительного маппинга. contractNum ядру
// не нужен, но читаем через invoices+subscriptions+periods — тот же путь,
// что и у getArpuInvoices/getTariffs (шаг 1.4 рефакторинга модели), для
// единообразия. Join many-to-one (subscriptions.id — PK), строки не множатся.
export async function getMonthlyInvoices(env: DbEnv) {
  return client(env)
    .select({
      periodStart: schema.periods.periodStart,
      invoiceAmount: schema.invoices.invoiceAmount,
      paidStatus: schema.invoices.paidStatus,
    })
    .from(schema.invoices)
    .innerJoin(schema.periods, eq(schema.invoices.periodId, schema.periods.id))
    .innerJoin(schema.subscriptions, eq(schema.invoices.subscriptionId, schema.subscriptions.id))
    .all();
}

// Форма строк — ровно InvoiceRow, которую ожидает worker/core/arpu.mjs
// (contractNum/periodStart/paidStatus вместо invoiceAmount у MRR) —
// та же форма, что использовалась в golden-тесте ARPU (scripts/test-golden-arpu.mjs).
// invoiceAmount добавлен поверх этой формы для /api/metrics/movement (тариф
// на дату при обогащении контрактов) и /api/metrics/month-contracts —
// сама ARPU/движение его не читают, лишнее поле им не мешает.
// contractNum читается через invoices.subscriptionId -> subscriptions
// (шаг 1.4 рефакторинга модели) — subscriptions.contractNum 1:1 совпадает
// со старым contracts.contractNum (мост проверен, mismatch=0 в шаге 1.3b).
export async function getArpuInvoices(env: DbEnv) {
  return client(env)
    .select({
      contractNum: schema.subscriptions.contractNum,
      periodStart: schema.periods.periodStart,
      paidStatus: schema.invoices.paidStatus,
      invoiceAmount: schema.invoices.invoiceAmount,
    })
    .from(schema.invoices)
    .innerJoin(schema.subscriptions, eq(schema.invoices.subscriptionId, schema.subscriptions.id))
    .innerJoin(schema.periods, eq(schema.invoices.periodId, schema.periods.id))
    .all();
}

// Форма строк — ровно TariffRow, которую ожидает worker/core/arpu.mjs.
// contractNum — через tariffs.subscriptionId -> subscriptions (шаг 1.4),
// тем же приёмом, что и в getArpuInvoices.
export async function getTariffs(env: DbEnv) {
  return client(env)
    .select({
      contractNum: schema.subscriptions.contractNum,
      tariff: schema.tariffs.tariff,
      effectiveFrom: schema.tariffs.effectiveFrom,
    })
    .from(schema.tariffs)
    .innerJoin(schema.subscriptions, eq(schema.tariffs.subscriptionId, schema.subscriptions.id))
    .all();
}

// Тот же контракт, что и у getMonthlyInvoices (InvoiceRow для worker/core/mrr.mjs),
// плюс менеджер контракта — историю смены менеджера не храним, берём текущее
// значение contracts.manager как есть. Пустой/NULL менеджер — строкой
// NO_MANAGER_LABEL, а не отбрасывается, чтобы такие строки не терялись при
// разбивке MRR по менеджерам (см. /api/metrics/mrr-by-manager).
export const NO_MANAGER_LABEL = "Без менеджера";

export async function getInvoicesByManager(env: DbEnv) {
  const rows = await client(env)
    .select({
      periodStart: schema.periods.periodStart,
      invoiceAmount: schema.invoices.invoiceAmount,
      paidStatus: schema.invoices.paidStatus,
      manager: schema.contracts.manager,
    })
    .from(schema.invoices)
    .innerJoin(schema.contracts, eq(schema.invoices.contractId, schema.contracts.id))
    .innerJoin(schema.periods, eq(schema.invoices.periodId, schema.periods.id))
    .all();

  return rows.map((row) => ({
    periodStart: row.periodStart,
    invoiceAmount: row.invoiceAmount,
    paidStatus: row.paidStatus,
    manager: row.manager && row.manager.trim() !== "" ? row.manager : NO_MANAGER_LABEL,
  }));
}

// Окно "последние 3 месяца" для списка подписок (шаг 2.1) — от СЕРВЕРНОЙ даты
// (текущий месяц + 2 предыдущих), НЕ от максимума period_start в данных: там
// есть авансовые периоды за годы вперёд (единичные предоплаты), которые увели
// бы окно от реального "сейчас". Через месяц окно сдвигается само собой, т.к.
// считается от now(). UTC — Workers исполняются в UTC, без завязки на локаль.
export function computeCurrentWindow(now: Date = new Date()): string[] {
  const periods: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    periods.push(`${d.getUTCFullYear()}-${month}-01`);
  }
  return periods;
}

// Список подписок для карточки клиента (шаг 2.1) — одна строка на подписку
// (контракт), НЕ на клиента. Читает ВСЕ 379 подписок через LEFT JOIN (не
// INNER) намеренно: тот самый риск с шага 1 (INNER JOIN тихо роняет строки
// без пары) здесь не должен привести к потере подписок без тарифа/счетов —
// им положено остаться в списке с tariff=null / unpaidPeriods=[].
// block_reason — contracts.note через contractNum (натуральный ключ,
// UNIQUE на обеих таблицах, join 1:1 без размножения строк); НЕ clients.note
// (тот обнулён у клиентов с 2+ подписками, шаг 1.2b) и НЕ поле на самой
// subscriptions (там такой колонки нет вообще).
export async function getSubscriptionsList(env: DbEnv, windowPeriods: string[]) {
  const db = client(env);

  const baseRows = await db
    .select({
      subscriptionId: schema.subscriptions.id,
      contractNum: schema.subscriptions.contractNum,
      status: schema.subscriptions.status,
      manager: schema.subscriptions.manager,
      clientName: schema.clients.name,
      blockReason: schema.contracts.note,
    })
    .from(schema.subscriptions)
    .leftJoin(schema.clients, eq(schema.subscriptions.clientId, schema.clients.id))
    .leftJoin(schema.contracts, eq(schema.contracts.contractNum, schema.subscriptions.contractNum))
    .all();

  // Тарифы читаем отдельным запросом (не JOIN на baseRows), чтобы не
  // размножать строки подписок при нескольких записях тарифа — та же
  // причина, по которой buildTariffIndex/tariffAt в worker/index.ts уже
  // работают через отдельный индекс, а не через SQL JOIN.
  const tariffRows = await db
    .select({
      subscriptionId: schema.tariffs.subscriptionId,
      tariff: schema.tariffs.tariff,
      effectiveFrom: schema.tariffs.effectiveFrom,
    })
    .from(schema.tariffs)
    .all();

  const tariffsBySub = new Map<number, { tariff: number; effectiveFrom: string }[]>();
  for (const t of tariffRows) {
    if (t.subscriptionId === null) continue;
    if (!tariffsBySub.has(t.subscriptionId)) tariffsBySub.set(t.subscriptionId, []);
    tariffsBySub.get(t.subscriptionId)!.push({ tariff: t.tariff, effectiveFrom: t.effectiveFrom });
  }
  for (const list of tariffsBySub.values()) list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const todayStr = new Date().toISOString().slice(0, 10);
  function currentTariff(subscriptionId: number): number | null {
    const list = tariffsBySub.get(subscriptionId);
    if (!list) return null;
    let result: number | null = null;
    for (const t of list) {
      if (t.effectiveFrom <= todayStr) result = t.tariff;
      else break;
    }
    return result;
  }

  // Счета только за окно (не все 3198) — периоды окна сначала резолвим в id,
  // затем invoices фильтруем по period_id; если периода ещё нет в periods
  // (не должно случиться для текущего месяца, но на всякий случай) — окно
  // просто даст меньше периодов, без ошибки.
  const periodRows =
    windowPeriods.length === 0
      ? []
      : await db
          .select({ id: schema.periods.id, periodStart: schema.periods.periodStart })
          .from(schema.periods)
          .where(inArray(schema.periods.periodStart, windowPeriods))
          .all();
  const periodStartById = new Map(periodRows.map((p) => [p.id, p.periodStart]));
  const periodIds = periodRows.map((p) => p.id);

  const invoiceRows =
    periodIds.length === 0
      ? []
      : await db
          .select({
            subscriptionId: schema.invoices.subscriptionId,
            periodId: schema.invoices.periodId,
            invoiceAmount: schema.invoices.invoiceAmount,
            paidStatus: schema.invoices.paidStatus,
          })
          .from(schema.invoices)
          .where(inArray(schema.invoices.periodId, periodIds))
          .all();

  // Неоплачен = есть invoice в окне с непустой суммой (invoice_amount у нас
  // NOT NULL по схеме — сам факт строки уже значит "счёт выставлен") И
  // paid_status <> "Да" (пусто и "Нет" оба считаются неоплатой). ТЕКУЩИЙ
  // месяц не исключается — это сознательное решение владельца, не баг.
  const unpaidBySub = new Map<number, { periodStart: string; invoiceAmount: number; paidStatus: string | null }[]>();
  for (const inv of invoiceRows) {
    if (inv.subscriptionId === null) continue;
    if (inv.paidStatus === "Да") continue;
    const periodStart = periodStartById.get(inv.periodId);
    if (!periodStart) continue;
    if (!unpaidBySub.has(inv.subscriptionId)) unpaidBySub.set(inv.subscriptionId, []);
    unpaidBySub.get(inv.subscriptionId)!.push({
      periodStart,
      invoiceAmount: inv.invoiceAmount,
      paidStatus: inv.paidStatus,
    });
  }
  for (const list of unpaidBySub.values()) list.sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  return baseRows.map((row) => ({
    contractNum: row.contractNum,
    clientName: row.clientName ?? row.contractNum,
    status: row.status,
    manager: row.manager && row.manager.trim() !== "" ? row.manager : NO_MANAGER_LABEL,
    tariff: currentTariff(row.subscriptionId),
    blockReason: row.blockReason && row.blockReason.trim() !== "" ? row.blockReason : null,
    unpaidPeriods: unpaidBySub.get(row.subscriptionId) ?? [],
  }));
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
