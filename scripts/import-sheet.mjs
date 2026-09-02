#!/usr/bin/env node
// Импорт листа "Платные" из живой Google Sheets в ЛОКАЛЬНУЮ D1 (prm-finance-db).
// Запускать из корня репозитория: node scripts/import-sheet.mjs
//
// Читает GOOGLE_SA_JSON (или GOOGLE_SA_JSON_FILE), SHEET_ID, SHEET_TAB из .env
// (см. .env.example). Ничего не пишет в remote D1 и ничего не коммитит.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fetchSheetValues } from "./lib/google-sheets.mjs";
import { parseSheet } from "./lib/parse-sheet.mjs";

const DB_NAME = "prm-finance-db";
const TMP_PREFIX = fileURLToPath(new URL("./.tmp-import-", import.meta.url));
const REPORT_FILE = fileURLToPath(new URL("../import-report.txt", import.meta.url));
const BATCH_SIZE = 300; // операторов на один вызов wrangler d1 execute

function loadEnv() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function requireCreds() {
  const sheetId = process.env.SHEET_ID;
  const sheetTab = process.env.SHEET_TAB || "Платные";
  let saJson = process.env.GOOGLE_SA_JSON;
  if (!saJson && process.env.GOOGLE_SA_JSON_FILE) {
    saJson = readFileSync(process.env.GOOGLE_SA_JSON_FILE, "utf8");
  }

  if (saJson && sheetId) return { saJson, sheetId, sheetTab };

  console.error(`
Не хватает данных для доступа к гугл-таблице.

Создайте файл .env в корне репозитория (он в .gitignore, никогда не
попадёт в git) со следующими строками:

  GOOGLE_SA_JSON={"type":"service_account", ... }   # JSON сервисного аккаунта reconcile-bot ОДНОЙ строкой
  SHEET_ID=...                                       # id гугл-таблицы "Статусы платежей и актов"
  SHEET_TAB=Платные                                  # необязательно, по умолчанию "Платные"

Вместо GOOGLE_SA_JSON можно указать путь к файлу:
  GOOGLE_SA_JSON_FILE=/путь/к/service-account.json

Сам JSON-файл сервисного аккаунта никуда коммитить не нужно и не надо —
он используется только локально с вашего компьютера.
`);
  process.exit(1);
}

function execSqlBatch(sqlStatements, label, target) {
  if (sqlStatements.length === 0) return;
  for (let i = 0; i < sqlStatements.length; i += BATCH_SIZE) {
    const chunk = sqlStatements.slice(i, i + BATCH_SIZE);
    const file = `${TMP_PREFIX}${label}-${i}.sql`;
    writeFileSync(file, chunk.join("\n"), "utf8");
    try {
      execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, target, "--file", file], {
        stdio: ["ignore", "ignore", "inherit"],
      });
    } finally {
      unlinkSync(file);
    }
  }
}

function buildContractSql(c) {
  const now = new Date().toISOString();
  return (
    `INSERT INTO contracts (contract_num, client_name, legal_entity, status, manager, note, updated_at) ` +
    `VALUES (${sqlQuote(c.contractNum)}, ${sqlQuote(c.clientName)}, ${sqlQuote(c.legalEntity)}, ${sqlQuote(
      c.status,
    )}, ${sqlQuote(c.manager)}, ${sqlQuote(c.note)}, ${sqlQuote(now)}) ` +
    `ON CONFLICT(contract_num) DO UPDATE SET client_name=excluded.client_name, legal_entity=excluded.legal_entity, ` +
    `status=excluded.status, manager=excluded.manager, note=excluded.note, updated_at=excluded.updated_at;`
  );
}

function buildPeriodSql(periodStart) {
  return `INSERT INTO periods (period_start) VALUES (${sqlQuote(
    periodStart,
  )}) ON CONFLICT(period_start) DO NOTHING;`;
}

function buildInvoiceSql(inv) {
  const now = new Date().toISOString();
  return (
    `INSERT INTO invoices (contract_id, period_id, invoice_amount, paid_status, updated_at) VALUES (` +
    `(SELECT id FROM contracts WHERE contract_num = ${sqlQuote(inv.contractNum)}), ` +
    `(SELECT id FROM periods WHERE period_start = ${sqlQuote(inv.periodStart)}), ` +
    `${inv.invoiceAmount}, ${sqlQuote(inv.paidStatus)}, ${sqlQuote(now)}) ` +
    `ON CONFLICT(contract_id, period_id) DO UPDATE SET invoice_amount=excluded.invoice_amount, ` +
    `paid_status=excluded.paid_status, updated_at=excluded.updated_at;`
  );
}

function buildTariffSql(t) {
  return (
    `INSERT INTO tariffs (contract_id, tariff, effective_from) VALUES (` +
    `(SELECT id FROM contracts WHERE contract_num = ${sqlQuote(t.contractNum)}), ` +
    `${t.tariff}, ${sqlQuote(t.effectiveFrom)}) ` +
    `ON CONFLICT(contract_id, effective_from) DO UPDATE SET tariff=excluded.tariff;`
  );
}

function buildReport({ contracts, periods, invoiceRows, tariffs, issues }) {
  const lines = [];
  const p = (s = "") => lines.push(s);

  const isBlocked = (c) => c.contractNum.startsWith("BLOCK-");
  const activeContracts = contracts.filter((c) => !isBlocked(c));
  const blockedContracts = contracts.filter(isBlocked);

  const byContract = new Map();
  for (const inv of invoiceRows) {
    if (!byContract.has(inv.contractNum)) byContract.set(inv.contractNum, []);
    byContract.get(inv.contractNum).push(inv);
  }

  p(`=== Отчёт импорта — ${new Date().toISOString()} ===`);
  p("");
  p(`Контрактов всего: ${contracts.length}`);
  p(`  активных (с номером): ${activeContracts.length}`);
  p(`  заблокированных (ключ BLOCK-<имя>): ${blockedContracts.length}`);
  p(`Периодов загружено: ${periods.length}`);
  p(`Invoices загружено: ${invoiceRows.length}`);
  p(`Тарифов (tariffs) загружено: ${tariffs.length} из ${contracts.length} контрактов`);
  p("");
  p(`Поле invoice_number: убрано из схемы и из всего кода импорта/чтения — в выводе ниже его нет.`);
  p("");

  p(`--- Контракты БЕЗ тарифа (колонка "АП" пуста/не число, ${issues.contractsWithoutTariff.length}) ---`);
  if (issues.contractsWithoutTariff.length === 0) p("(нет)");
  for (const t of issues.contractsWithoutTariff) {
    p(`  строка ${t.row}: ${t.contractNum} — ${t.clientName}`);
  }
  p("");

  p(`--- Дубли номеров контракта (активные, ${issues.duplicateContracts.length}) ---`);
  if (issues.duplicateContracts.length === 0) p("(нет)");
  for (const d of issues.duplicateContracts) {
    p(`  ${d.contractNum}: строка ${d.firstRow} и строка ${d.duplicateRow} (взята последняя)`);
  }
  p("");

  p(`--- Дубли имён заблокированных (${issues.duplicateBlockedNames.length}) — НЕ вставлены, разобрать вручную ---`);
  if (issues.duplicateBlockedNames.length === 0) p("(нет)");
  for (const d of issues.duplicateBlockedNames) {
    p(`  ${d.contractNum}: строки ${d.rows.join(", ")} — ни одна версия не импортирована`);
  }
  p("");

  p(`--- Пропущенные строки (${issues.skippedRows.length}) ---`);
  if (issues.skippedRows.length === 0) p("(нет)");
  for (const s of issues.skippedRows) {
    p(`  строка ${s.row}: ${s.reason}`);
  }
  p("");

  p(`--- Неполные/непонятные периодные тройки (${issues.incompleteTriples.length}) ---`);
  if (issues.incompleteTriples.length === 0) p("(нет)");
  for (const t of issues.incompleteTriples) {
    p(`  колонка ${t.startColLetter}: ${t.found || "(пусто)"}`);
  }
  p("");

  if (issues.unresolvedMonths.length > 0) {
    p(`--- Тройки без определённого месяца (${issues.unresolvedMonths.length}) ---`);
    for (const u of issues.unresolvedMonths) {
      p(`  колонка ${u.startColLetter}: нет подписи месяца ни в этой, ни в carry-forward цепочке`);
    }
    p("");
  }

  function printContractHistory(c) {
    p(`\n${c.contractNum} — ${c.clientName} (${c.legalEntity || "—"}), статус: ${c.status || "—"}, менеджер: ${
      c.manager || "—"
    }${c.note ? `, важно: ${c.note}` : ""}`);
    const invs = (byContract.get(c.contractNum) || []).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    if (invs.length === 0) p("    (нет invoices)");
    for (const inv of invs) {
      p(`    ${inv.periodStart}: сумма ${inv.invoiceAmount}, оплачен: "${inv.paidStatus || "—"}"`);
    }
  }

  p(`--- Примеры АКТИВНЫХ контрактов (для сверки глазами) ---`);
  for (const c of activeContracts.slice(0, 10)) printContractHistory(c);

  p(`\n\n--- Примеры ЗАБЛОКИРОВАННЫХ контрактов (для сверки глазами) ---`);
  for (const c of blockedContracts.slice(0, 5)) printContractHistory(c);

  return lines.join("\n");
}

async function main() {
  const isRemote = process.argv.includes("--remote");
  const target = isRemote ? "--remote" : "--local";

  loadEnv();
  const { saJson, sheetId, sheetTab } = requireCreds();

  console.log(`Читаю лист "${sheetTab}" из гугл-таблицы...`);
  const values = await fetchSheetValues(saJson, sheetId, sheetTab);
  console.log(`Получено строк: ${values.length}`);

  console.log("Разбираю структуру...");
  const parsed = parseSheet(values);
  console.log(
    `Разобрано: контрактов ${parsed.contracts.length}, периодов ${parsed.periods.length}, invoices ${parsed.invoiceRows.length}`,
  );

  console.log(`\nЗаписываю в ${isRemote ? "БОЕВУЮ (--remote)" : "ЛОКАЛЬНУЮ (--local)"} D1...`);
  execSqlBatch(parsed.contracts.map(buildContractSql), "contracts", target);
  execSqlBatch(parsed.periods.map(buildPeriodSql), "periods", target);
  execSqlBatch(parsed.invoiceRows.map(buildInvoiceSql), "invoices", target);
  execSqlBatch(parsed.tariffs.map(buildTariffSql), "tariffs", target);
  console.log(isRemote ? "Готово, записано в remote." : "Готово, remote не трогала.");

  const report = buildReport(parsed);
  writeFileSync(REPORT_FILE, report, "utf8");
  console.log("\n" + report);
  console.log(`\nОтчёт сохранён в ${REPORT_FILE}`);
}

main().catch((err) => {
  console.error("\nОшибка:", err.message || err);
  process.exit(1);
});
