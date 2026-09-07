#!/usr/bin/env node
// Route-check (шаг 2.2a) — "золотая защита" для /api/clients и /api/clients/:id,
// по образцу scripts/test-golden-*.mjs. Читает REMOTE D1 напрямую (SELECT only,
// как в prove-equivalence-1_5.mjs/snapshot-metrics.mjs) и РЕПЛИЦИРУЕТ логику
// getSubscriptionsList/getClientCard/computeCurrentWindow из worker/db/index.ts
// один в один — импортировать их напрямую нельзя (модуль использует
// drizzle-orm/d1 с живым D1Database-биндингом, который существует только
// внутри Workers-рантайма, не в обычном Node-процессе — та же причина, по
// которой все существующие diagnostic-скрипты в этом репо читают через
// `wrangler d1 execute --json`, а не импортом). worker/db/index.ts,
// worker/index.ts, ядро, golden, схема, миграции — НЕ трогает и не импортирует.
//
// Ничего не пишет в базу. Запуск из корня репозитория:
//   node scripts/test-client-routes.mjs         (--local по умолчанию)
//   node scripts/test-client-routes.mjs --remote
import { execFileSync } from "node:child_process";

const DB_NAME = "prm-finance-db";
const NO_MANAGER_LABEL = "Без менеджера";

const isRemote = process.argv.includes("--remote");
const target = isRemote ? "--remote" : "--local";

function q(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, target, "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 },
  );
  return JSON.parse(out)[0].results;
}

let allPass = true;
function assert(label, pass, expected, actual) {
  const line = `${pass ? "✅ PASS" : "❌ FAIL"} — ${label}` + (pass ? "" : ` | ожидание: ${JSON.stringify(expected)}, факт: ${JSON.stringify(actual)}`);
  console.log(line);
  if (!pass) allPass = false;
}

// --- computeCurrentWindow, копия логики worker/db/index.ts (не импорт — см. шапку) ---
function computeCurrentWindow(now = new Date()) {
  const periods = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    periods.push(`${d.getUTCFullYear()}-${month}-01`);
  }
  return periods;
}

// Независимая от computeCurrentWindow реализация той же формулировки
// ("текущий месяц + 2 предыдущих, от серверной даты") — другим кодом,
// не копией цикла, чтобы проверка окна не была тавтологией "функция равна
// самой себе".
function expectedWindowIndependent(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const mk = (yy, mm) => `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
  const twoAgo = m - 2 < 0 ? mk(y - 1, m - 2 + 12) : mk(y, m - 2);
  const oneAgo = m - 1 < 0 ? mk(y - 1, m - 1 + 12) : mk(y, m - 1);
  const current = mk(y, m);
  return [twoAgo, oneAgo, current];
}

function currentTariffAt(tariffsBySub, subId, todayStr) {
  const list = tariffsBySub.get(subId);
  if (!list) return null;
  let result = null;
  for (const t of list) {
    if (t.effectiveFrom <= todayStr) result = t.tariff;
    else break;
  }
  return result;
}

async function main() {
  console.log(`=== Route-check /api/clients + /api/clients/:id (target: ${target}) ===\n`);

  // ---------- окно ----------
  const window = computeCurrentWindow();
  const expectedWindow = expectedWindowIndependent();
  assert("computeCurrentWindow == независимо посчитанное окно (текущий месяц + 2 предыдущих)", JSON.stringify(window) === JSON.stringify(expectedWindow), expectedWindow, window);
  console.log(`   окно: ${JSON.stringify(window)}\n`);

  // ---------- общие данные (переиспользуются и для списка, и для карточек, и для инварианта) ----------
  const baseRows = q(`
    SELECT s.id as subscriptionId, s.contract_num as contractNum, s.status, s.manager, s.client_id as clientId,
           c.name as clientName, ct.note as blockReason
    FROM subscriptions s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN contracts ct ON ct.contract_num = s.contract_num;
  `);

  const tariffRows = q(`SELECT subscription_id as subscriptionId, tariff, effective_from as effectiveFrom FROM tariffs;`);
  const tariffsBySub = new Map();
  for (const t of tariffRows) {
    if (t.subscriptionId === null) continue;
    if (!tariffsBySub.has(t.subscriptionId)) tariffsBySub.set(t.subscriptionId, []);
    tariffsBySub.get(t.subscriptionId).push(t);
  }
  for (const list of tariffsBySub.values()) list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const todayStr = new Date().toISOString().slice(0, 10);

  const allInvoices = q(`
    SELECT i.subscription_id as subscriptionId, i.invoice_amount as invoiceAmount, i.paid_status as paidStatus, p.period_start as periodStart
    FROM invoices i JOIN periods p ON p.id = i.period_id;
  `);
  const invoicesBySub = new Map();
  for (const inv of allInvoices) {
    if (inv.subscriptionId === null) continue;
    if (!invoicesBySub.has(inv.subscriptionId)) invoicesBySub.set(inv.subscriptionId, []);
    invoicesBySub.get(inv.subscriptionId).push(inv);
  }
  for (const list of invoicesBySub.values()) list.sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  const windowSet = new Set(window);

  // Ровно та же форма строки, что отдаёт getSubscriptionsList
  const listRows = baseRows.map((row) => {
    const history = (invoicesBySub.get(row.subscriptionId) ?? []).filter((h) => windowSet.has(h.periodStart));
    const unpaidPeriods = history.filter((h) => h.paidStatus !== "Да").sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    return {
      contractNum: row.contractNum,
      clientName: row.clientName ?? row.contractNum,
      status: row.status,
      manager: row.manager && row.manager.trim() !== "" ? row.manager : NO_MANAGER_LABEL,
      tariff: currentTariffAt(tariffsBySub, row.subscriptionId, todayStr),
      unpaidPeriods,
    };
  });

  // ---------- СПИСОК (/api/clients) ----------
  console.log("--- Список подписок ---");

  const activeCountRaw = baseRows.filter((r) => r.status === "Активен").length;
  const defaultRows = listRows.filter((r) => r.status === "Активен");
  assert("дефолт (только Активен): число строк == число подписок со статусом Активен", defaultRows.length === activeCountRaw, activeCountRaw, defaultRows.length);
  assert("дефолт: нет ни одной строки со статусом Блок", defaultRows.every((r) => r.status !== "Блок") === true, true, defaultRows.some((r) => r.status === "Блок") ? "есть Блок" : "нет Блок");

  assert("status=все: ровно 379 строк", listRows.length === 379, 379, listRows.length);

  const NO_TARIFF_CONTRACTS = ["07.11427-04.26", "BLOCK-STARTER", "BLOCK-ИП Кашапов Марсель Халитович"];
  for (const cn of NO_TARIFF_CONTRACTS) {
    const row = listRows.find((r) => r.contractNum === cn);
    assert(`подписка без тарифа присутствует в списке и tariff=null: ${cn}`, !!row && row.tariff === null, { present: true, tariff: null }, row ? { present: true, tariff: row.tariff } : { present: false });
  }

  const parametrList = listRows.find((r) => r.contractNum === "07.11627-06.26");
  const expectedUnpaid = [
    { period_start: "2026-07-01", invoice_amount: 3910 },
    { period_start: "2026-08-01", invoice_amount: 40410 },
    { period_start: "2026-09-01", invoice_amount: 40410 },
  ];
  const actualUnpaid = (parametrList?.unpaidPeriods ?? []).map((p) => ({ period_start: p.periodStart, invoice_amount: p.invoiceAmount }));
  assert(
    "07.11627-06.26 (Parametr): tariff=40410, unpaid_periods=июль/авг/сент с суммами 3910/40410/40410, все paid_status<>'Да'",
    parametrList?.tariff === 40410 &&
      JSON.stringify(actualUnpaid) === JSON.stringify(expectedUnpaid) &&
      (parametrList?.unpaidPeriods ?? []).every((p) => p.paidStatus !== "Да"),
    { tariff: 40410, unpaid: expectedUnpaid },
    { tariff: parametrList?.tariff, unpaid: actualUnpaid },
  );

  // ---------- КАРТОЧКА (/api/clients/:id) ----------
  console.log("\n--- Карточка клиента ---");

  // legalEntity читаем отдельно (не было в baseRows выше) — добираем точечно для карточки
  const legalEntityBySub = new Map(
    q(`SELECT id as subscriptionId, legal_entity as legalEntity FROM subscriptions;`).map((r) => [r.subscriptionId, r.legalEntity]),
  );
  function buildCardFull(clientId) {
    const subs = baseRows.filter((r) => r.clientId === clientId);
    if (subs.length === 0) return null;
    return subs.map((row) => {
      const history = invoicesBySub.get(row.subscriptionId) ?? [];
      const paidHistory = history.filter((h) => h.paidStatus === "Да");
      const currentMonth = window[window.length - 1];
      return {
        contractNum: row.contractNum,
        legalEntity: legalEntityBySub.get(row.subscriptionId) ?? null,
        summary: {
          issuedCount: history.length,
          paidCount: paidHistory.length,
          unpaidInWindow: history.filter((h) => windowSet.has(h.periodStart) && h.paidStatus !== "Да"),
          paidAheadCount: paidHistory.filter((h) => h.periodStart > currentMonth).length,
        },
        invoices: history,
      };
    });
  }

  const clientIdRows = q(`SELECT id, name FROM clients WHERE name IN ('Донуля 2', 'RecPlace', 'Parametr', 'Автокод (Spectrum Data)');`);
  const idByName = new Map(clientIdRows.map((r) => [r.name, r.id]));

  const donulyaCard = idByName.has("Донуля 2") ? buildCardFull(idByName.get("Донуля 2")) : null;
  assert("«Донуля 2»: ровно 2 подписки", donulyaCard?.length === 2, 2, donulyaCard?.length);
  assert(
    "«Донуля 2»: legal_entity различаются (ИП Плешаков / Юмобайл)",
    donulyaCard && new Set(donulyaCard.map((s) => s.legalEntity)).size === 2,
    "2 разных legal_entity",
    donulyaCard?.map((s) => s.legalEntity),
  );

  const recplaceCard = idByName.has("RecPlace") ? buildCardFull(idByName.get("RecPlace")) : null;
  assert("«RecPlace»: ровно 2 подписки", recplaceCard?.length === 2, 2, recplaceCard?.length);
  assert(
    'RecPlace: legal_entity оба АО "РЕКПЛЕЙС"',
    recplaceCard && recplaceCard.every((s) => s.legalEntity === 'АО "РЕКПЛЕЙС"'),
    'оба АО "РЕКПЛЕЙС"',
    recplaceCard?.map((s) => s.legalEntity),
  );

  const parametrCard = idByName.has("Parametr") ? buildCardFull(idByName.get("Parametr")) : null;
  assert("Parametr: 1 подписка", parametrCard?.length === 1, 1, parametrCard?.length);
  const parametrSub = parametrCard?.[0];
  assert(
    "Parametr: summary.issued_count == длине invoices",
    parametrSub && parametrSub.summary.issuedCount === parametrSub.invoices.length,
    "issued_count == invoices.length",
    parametrSub ? { issued_count: parametrSub.summary.issuedCount, invoices_length: parametrSub.invoices.length } : null,
  );
  assert("Parametr: paid_count == 0", parametrSub?.summary.paidCount === 0, 0, parametrSub?.summary.paidCount);
  assert("Parametr: unpaid_in_window содержит ровно 3 периода окна", parametrSub?.summary.unpaidInWindow.length === 3, 3, parametrSub?.summary.unpaidInWindow.length);

  // Клиент, оплативший вперёд — Автокод (Spectrum Data), если стабильно
  // находится по имени; иначе любой с paid_ahead_count > 0 (SQL-поиск).
  let paidAheadClientId = idByName.get("Автокод (Spectrum Data)");
  let paidAheadLabel = "Автокод (Spectrum Data)";
  if (!paidAheadClientId) {
    const fallback = q(`
      SELECT DISTINCT c.id, c.name FROM invoices i
      JOIN subscriptions s ON s.id = i.subscription_id
      JOIN clients c ON c.id = s.client_id
      JOIN periods p ON p.id = i.period_id
      WHERE i.paid_status = 'Да' AND p.period_start > '${window[window.length - 1]}'
      LIMIT 1;
    `);
    if (fallback[0]) {
      paidAheadClientId = fallback[0].id;
      paidAheadLabel = `${fallback[0].name} (fallback-поиск)`;
    }
  }
  const paidAheadCard = paidAheadClientId ? buildCardFull(paidAheadClientId) : null;
  const paidAheadTotal = paidAheadCard ? paidAheadCard.reduce((s, sub) => s + sub.summary.paidAheadCount, 0) : 0;
  assert(`клиент, оплативший вперёд (${paidAheadLabel}): summary.paid_ahead_count > 0`, paidAheadTotal > 0, "> 0", paidAheadTotal);

  assert("несуществующий client_id (999999): карточка -> null (роут дал бы 404)", buildCardFull(999999) === null, null, buildCardFull(999999));

  // ---------- ИНВАРИАНТ по ВСЕМ клиентам/подпискам (агрегатами, без per-client запросов) ----------
  console.log("\n--- Инвариант issued_count/paid_count по всем подпискам ---");

  // Путь A: JS-группировка уже прочитанных allInvoices (один запрос выше).
  const pathA = new Map();
  for (const [subId, history] of invoicesBySub) {
    pathA.set(subId, { issuedCount: history.length, paidCount: history.filter((h) => h.paidStatus === "Да").length });
  }

  // Путь B: независимый SQL-агрегат (второй запрос) — сверяем оба пути между
  // собой, чтобы проверка не полагалась на то, что "COUNT сам себе равен".
  const aggRows = q(`
    SELECT subscription_id as subscriptionId, COUNT(*) as issuedCount,
           SUM(CASE WHEN paid_status = 'Да' THEN 1 ELSE 0 END) as paidCount
    FROM invoices
    WHERE subscription_id IS NOT NULL
    GROUP BY subscription_id;
  `);

  let mismatches = 0;
  let orderViolations = 0;
  for (const row of aggRows) {
    const a = pathA.get(row.subscriptionId);
    if (!a || a.issuedCount !== row.issuedCount || a.paidCount !== row.paidCount) {
      mismatches++;
      console.log(`   расхождение путей A/B для subscription_id=${row.subscriptionId}: A=${JSON.stringify(a)} B=${JSON.stringify(row)}`);
    }
    if (row.paidCount > row.issuedCount) {
      orderViolations++;
      console.log(`   paid_count > issued_count для subscription_id=${row.subscriptionId}: ${row.paidCount} > ${row.issuedCount}`);
    }
  }
  assert(`инвариант issued_count/paid_count: OK по всем ${aggRows.length} подпискам со счетами (два независимых пути расчёта совпали)`, mismatches === 0 && orderViolations === 0, "0 расхождений, 0 нарушений", { mismatches, orderViolations });

  // ---------- вердикт ----------
  console.log("\n=== ИТОГОВЫЙ ВЕРДИКТ ===");
  console.log(allPass ? "✅ ВСЁ PASS" : "❌ ЕСТЬ FAIL — см. выше");
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
