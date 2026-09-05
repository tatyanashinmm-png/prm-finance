#!/usr/bin/env node
// Шаг 1.2b — реальная (идемпотентная) запись clients/subscriptions в
// ЛОКАЛЬНУЮ D1, из логики группировки уже проверенной сухим прогоном
// (scripts/build-clients-dryrun.mjs / scripts/lib/client-grouping.mjs).
//
// Пишет ТОЛЬКО в clients и subscriptions. contracts/periods/invoices/
// tariffs/users/sessions не трогает ни одной строкой. Ни одного DELETE.
// Повторный запуск идемпотентен — см. приёмы ниже.
// Запуск из корня репозитория: node scripts/build-clients.mjs
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pickRepresentative, pickClientDisplayName, groupByNameKey } from "./lib/client-grouping.mjs";

const DB_NAME = "prm-finance-db";
const BATCH_SIZE = 300; // операторов на один вызов wrangler d1 execute — как в import-sheet.mjs
const TMP_PREFIX = "scripts/.tmp-build-clients-"; // покрыто .gitignore: scripts/.tmp-*.sql

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--local", "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 },
  );
  return JSON.parse(out)[0].results;
}

function execSqlBatch(sqlStatements, label) {
  if (sqlStatements.length === 0) return;
  for (let i = 0; i < sqlStatements.length; i += BATCH_SIZE) {
    const chunk = sqlStatements.slice(i, i + BATCH_SIZE);
    const file = `${TMP_PREFIX}${label}-${i}.sql`;
    writeFileSync(file, chunk.join("\n"), "utf8");
    try {
      execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, "--local", "--file", file], {
        stdio: ["ignore", "ignore", "inherit"],
      });
    } finally {
      unlinkSync(file);
    }
  }
}

// Тот же маленький хелпер, что дублирован в create-user.mjs/import-sheet.mjs/
// reset-password.mjs — в этом репо его не выносят в lib, а копируют.
function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function main() {
  const lines = [];
  const log = (s = "") => {
    console.log(s);
    lines.push(s);
  };

  log("Читаю contracts из ЛОКАЛЬНОЙ D1...");
  const rows = queryLocalD1(`
    SELECT contract_num as contractNum, client_name as clientName,
           legal_entity as legalEntity, status, manager, note
    FROM contracts;
  `);
  log(`Прочитано контрактов: ${rows.length}`);

  const latestRows = queryLocalD1(`
    SELECT c.contract_num as contractNum, MAX(p.period_start) as latestPeriod
    FROM contracts c
    LEFT JOIN invoices i ON i.contract_id = c.id
    LEFT JOIN periods p ON p.id = i.period_id
    GROUP BY c.id;
  `);
  const latestPeriodByContract = new Map(latestRows.map((r) => [r.contractNum, r.latestPeriod]));

  const { groups } = groupByNameKey(rows);

  // --- ролап на каждую группу: displayName, manager, status, note ---
  const now = new Date().toISOString();
  const clientRollups = [];
  for (const [key, subs] of groups) {
    const activeSubs = subs.filter((s) => s.status === "Активен");
    const candidates = activeSubs.length > 0 ? activeSubs : subs;
    const representative = pickRepresentative(candidates, latestPeriodByContract);
    const displayName = pickClientDisplayName(subs);
    // note: при ровно одной подписке — переносим её note как есть; при 2+ —
    // оставляем NULL (неочевидно, чью из нескольких заметок наследовать,
    // слепое склеивание текстов разных контрактов может ввести в заблуждение).
    const note = subs.length === 1 ? subs[0].note : null;
    clientRollups.push({
      nameKey: key,
      displayName,
      status: activeSubs.length > 0 ? "Активен" : "Блок",
      manager: representative.manager,
      note,
      subs,
    });
  }

  // --- шаг 1: UPSERT clients (name_key НЕ unique — UPDATE + INSERT-WHERE-NOT-EXISTS) ---
  log(`\nЗаписываю clients (${clientRollups.length} групп)...`);
  const clientSql = [];
  for (const g of clientRollups) {
    clientSql.push(
      `UPDATE clients SET name=${sqlQuote(g.displayName)}, manager=${sqlQuote(g.manager)}, ` +
        `status=${sqlQuote(g.status)}, note=${sqlQuote(g.note)}, updated_at=${sqlQuote(now)} ` +
        `WHERE name_key=${sqlQuote(g.nameKey)};`,
    );
    clientSql.push(
      `INSERT INTO clients (name, name_key, inn, manager, status, note, created_at, updated_at) ` +
        `SELECT ${sqlQuote(g.displayName)}, ${sqlQuote(g.nameKey)}, NULL, ${sqlQuote(g.manager)}, ` +
        `${sqlQuote(g.status)}, ${sqlQuote(g.note)}, ${sqlQuote(now)}, ${sqlQuote(now)} ` +
        `WHERE NOT EXISTS (SELECT 1 FROM clients WHERE name_key = ${sqlQuote(g.nameKey)});`,
    );
  }
  execSqlBatch(clientSql, "clients");

  // --- шаг 2: узнать id клиентов (в т.ч. свежевставленных) ---
  const clientIdRows = queryLocalD1(`SELECT id, name_key as nameKey FROM clients;`);
  const clientIdByNameKey = new Map(clientIdRows.map((r) => [r.nameKey, r.id]));

  // --- шаг 3: UPSERT subscriptions (contract_num UNIQUE — ON CONFLICT DO UPDATE) ---
  log(`Записываю subscriptions (${rows.length} контрактов)...`);
  const { withNames } = groupByNameKey(rows);
  const subSql = [];
  for (const c of withNames) {
    const clientId = clientIdByNameKey.get(c.nameKey);
    if (clientId === undefined) {
      throw new Error(`Не найден client_id для name_key=${c.nameKey} (contract ${c.contractNum}) — прерываю, ничего не пишу дальше.`);
    }
    subSql.push(
      `INSERT INTO subscriptions (client_id, contract_num, legal_entity, status, manager, started_at, ended_at, billing_cycle, created_at, updated_at) ` +
        `VALUES (${clientId}, ${sqlQuote(c.contractNum)}, ${sqlQuote(c.legalEntity)}, ${sqlQuote(c.status)}, ${sqlQuote(c.manager)}, NULL, NULL, NULL, ${sqlQuote(now)}, ${sqlQuote(now)}) ` +
        `ON CONFLICT(contract_num) DO UPDATE SET client_id=excluded.client_id, legal_entity=excluded.legal_entity, ` +
        `status=excluded.status, manager=excluded.manager, updated_at=excluded.updated_at;`,
    );
  }
  execSqlBatch(subSql, "subscriptions");

  // --- постпроверки ---
  log("\n=== ПРОВЕРКИ ===");

  const [{ clientsCount, subsCount }] = queryLocalD1(
    `SELECT (SELECT COUNT(*) FROM clients) as clientsCount, (SELECT COUNT(*) FROM subscriptions) as subsCount;`,
  );
  log(`clients: ${clientsCount} (ожидание 377) — ${clientsCount === 377 ? "✅" : "❌"}`);
  log(`subscriptions: ${subsCount} (ожидание 379) — ${subsCount === 379 ? "✅" : "❌"}`);

  const [{ nullClientId }] = queryLocalD1(`SELECT COUNT(*) as nullClientId FROM subscriptions WHERE client_id IS NULL;`);
  log(`subscriptions с client_id IS NULL: ${nullClientId} — ${nullClientId === 0 ? "✅" : "❌"}`);

  const [{ orphans }] = queryLocalD1(
    `SELECT COUNT(*) as orphans FROM subscriptions s WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = s.client_id);`,
  );
  log(`orphan-подписки (client_id без соответствующего client): ${orphans} — ${orphans === 0 ? "✅" : "❌"}`);

  const [{ contractsCount }] = queryLocalD1(`SELECT COUNT(*) as contractsCount FROM contracts;`);
  log(`subscriptions == contracts: ${subsCount} == ${contractsCount} — ${subsCount === contractsCount ? "✅" : "❌"}`);

  log("\nРазбивка clients по status:");
  const statusRows = queryLocalD1(`SELECT status, COUNT(*) as n FROM clients GROUP BY status ORDER BY status;`);
  for (const r of statusRows) log(`  ${r.status}: ${r.n}`);

  log("\nКлиенты с >1 подпиской:");
  const multiRows = queryLocalD1(`
    SELECT cl.name as name, cl.id as clientId
    FROM clients cl
    WHERE (SELECT COUNT(*) FROM subscriptions s WHERE s.client_id = cl.id) > 1;
  `);
  for (const r of multiRows) {
    const subsOf = queryLocalD1(`SELECT contract_num as contractNum FROM subscriptions WHERE client_id = ${r.clientId};`);
    log(`  [${r.name}]: ${subsOf.map((s) => s.contractNum).join(", ")}`);
  }
  log(`Итого клиентов с >1 подпиской: ${multiRows.length} (ожидание 2)`);

  log("\nПодтверждение, что старые таблицы не менялись:");
  const [{ pc, pp, pi, pt }] = queryLocalD1(`
    SELECT (SELECT COUNT(*) FROM contracts) as pc, (SELECT COUNT(*) FROM periods) as pp,
           (SELECT COUNT(*) FROM invoices) as pi, (SELECT COUNT(*) FROM tariffs) as pt;
  `);
  log(`  contracts=${pc} (379), periods=${pp} (43), invoices=${pi} (3198), tariffs=${pt} (376)`);

  mkdirSync("baseline", { recursive: true });
  writeFileSync("baseline/build-clients-report.txt", lines.join("\n") + "\n");
  console.log("\nОтчёт сохранён: baseline/build-clients-report.txt");
}

main();
