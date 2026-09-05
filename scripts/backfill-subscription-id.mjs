#!/usr/bin/env node
// Шаг 1.3b — заполняет subscription_id в invoices/tariffs мостом
// contract_id -> contracts.contract_num -> subscriptions.contract_num
// (subscriptions уникальны по contract_num, см. 0005/шаг 1.2). Пишет
// ТОЛЬКО в колонку subscription_id этих двух таблиц — ни одну другую
// ячейку/таблицу не трогает. Идемпотентно: UPDATE безусловно пересчитывает
// один и тот же детерминированный подзапрос при каждом запуске, повторный
// прогон просто присваивает те же значения — без WHERE-условий, которые
// зависели бы от того, успешно ли отработал предыдущий запуск.
// ЛОКАЛЬНАЯ D1 only. Запуск из корня репозитория:
// node scripts/backfill-subscription-id.mjs
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DB_NAME = "prm-finance-db";
const TMP_PREFIX = "scripts/.tmp-backfill-"; // покрыто .gitignore: scripts/.tmp-*.sql

const isRemote = process.argv.includes("--remote");
const target = isRemote ? "--remote" : "--local";

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, target, "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 },
  );
  return JSON.parse(out)[0].results;
}

function execSqlFile(sql, label) {
  const file = `${TMP_PREFIX}${label}.sql`;
  writeFileSync(file, sql, "utf8");
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, target, "--file", file], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  } finally {
    unlinkSync(file);
  }
}

const BRIDGE_SUBQUERY = (table) => `(
  SELECT s.id FROM subscriptions s
  JOIN contracts c ON c.contract_num = s.contract_num
  WHERE c.id = ${table}.contract_id
)`;

function main() {
  console.log("TARGET:", target);
  const lines = [];
  const log = (s = "") => {
    console.log(s);
    lines.push(s);
  };

  log("Заполняю invoices.subscription_id (contract_id -> contract_num -> subscriptions)...");
  execSqlFile(`UPDATE invoices SET subscription_id = ${BRIDGE_SUBQUERY("invoices")};`, "invoices");

  log("Заполняю tariffs.subscription_id...");
  execSqlFile(`UPDATE tariffs SET subscription_id = ${BRIDGE_SUBQUERY("tariffs")};`, "tariffs");

  log("\n=== ПРОВЕРКИ ===");

  const [{ invNull, tarNull }] = queryLocalD1(`
    SELECT
      (SELECT COUNT(*) FROM invoices WHERE subscription_id IS NULL) as invNull,
      (SELECT COUNT(*) FROM tariffs WHERE subscription_id IS NULL) as tarNull;
  `);
  log(`invoices.subscription_id IS NULL: ${invNull} — ${invNull === 0 ? "✅" : "❌"}`);
  log(`tariffs.subscription_id IS NULL: ${tarNull} — ${tarNull === 0 ? "✅" : "❌"}`);

  const [{ invCount, tarCount }] = queryLocalD1(`
    SELECT (SELECT COUNT(*) FROM invoices) as invCount, (SELECT COUNT(*) FROM tariffs) as tarCount;
  `);
  log(`invoices: ${invCount} (ожидание 3198) — ${invCount === 3198 ? "✅" : "❌"}`);
  log(`tariffs: ${tarCount} (ожидание 376) — ${tarCount === 376 ? "✅" : "❌"}`);

  log("\nГлавная проверка моста (новый путь ведёт к тому же контракту, что старый):");
  const [{ invMismatch }] = queryLocalD1(`
    SELECT COUNT(*) as invMismatch
    FROM invoices i
    JOIN subscriptions s ON s.id = i.subscription_id
    JOIN contracts c ON c.id = i.contract_id
    WHERE s.contract_num <> c.contract_num;
  `);
  log(`invoices: несовпадений моста = ${invMismatch} — ${invMismatch === 0 ? "✅" : "❌"}`);

  const [{ tarMismatch }] = queryLocalD1(`
    SELECT COUNT(*) as tarMismatch
    FROM tariffs t
    JOIN subscriptions s ON s.id = t.subscription_id
    JOIN contracts c ON c.id = t.contract_id
    WHERE s.contract_num <> c.contract_num;
  `);
  log(`tariffs: несовпадений моста = ${tarMismatch} — ${tarMismatch === 0 ? "✅" : "❌"}`);

  log("\nСироты (subscription_id, которого нет в subscriptions):");
  const [{ invOrphans }] = queryLocalD1(`
    SELECT COUNT(*) as invOrphans FROM invoices i
    WHERE i.subscription_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = i.subscription_id);
  `);
  log(`invoices: ${invOrphans} — ${invOrphans === 0 ? "✅" : "❌"}`);

  const [{ tarOrphans }] = queryLocalD1(`
    SELECT COUNT(*) as tarOrphans FROM tariffs t
    WHERE t.subscription_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = t.subscription_id);
  `);
  log(`tariffs: ${tarOrphans} — ${tarOrphans === 0 ? "✅" : "❌"}`);

  const [{ distinctSubs }] = queryLocalD1(`SELECT COUNT(DISTINCT subscription_id) as distinctSubs FROM invoices;`);
  log(`\n(для справки) distinct subscription_id в invoices: ${distinctSubs} — подписок реально имеют счета`);

  mkdirSync("baseline", { recursive: true });
  writeFileSync("baseline/backfill-report.txt", lines.join("\n") + "\n");
  console.log("\nОтчёт сохранён: baseline/backfill-report.txt");
}

main();
