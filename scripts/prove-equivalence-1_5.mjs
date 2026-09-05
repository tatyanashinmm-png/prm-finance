#!/usr/bin/env node
// Шаг 1.5 — прямое доказательство, что новый SQL (subscriptions/
// subscription_id, введённый шагом 1.4) отдаёт БАЙТ-В-БАЙТ те же строки
// ядру, что старый (contracts/contract_id). Только SELECT на ЛОКАЛЬНОЙ
// D1, никаких записей/миграций/--remote. Старые колонки (contract_id) в
// БД никуда не делись — поэтому оба варианта запроса физически
// исполнимы на ОДНОМ И ТОМ ЖЕ текущем наборе данных, что и даёт чистое
// сравнение (а не сравнение снимков в разное время).
//
// OLD-запросы — подлинный код из git show 215db24:worker/db/index.ts
// (коммит непосредственно ДО шага 1.4), переписанный в сырой SQL 1:1.
// NEW-запросы — как сейчас в worker/db/index.ts.
//
// Одноразовый диагностический скрипт, остаётся в репозитории для истории
// и для повторного прогона на remote-снимке позже.
// Запуск: node scripts/prove-equivalence-1_5.mjs
import { execFileSync } from "node:child_process";
import { computeMonthlyMetrics } from "../worker/core/mrr.mjs";
import { computeMonthlyArpu } from "../worker/core/arpu.mjs";
import { computeMovement } from "../worker/core/movement.mjs";

const DB_NAME = "prm-finance-db";

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--local", "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 },
  );
  return JSON.parse(out)[0].results;
}

const QUERIES = {
  monthlyInvoices: {
    old: `SELECT p.period_start as periodStart, i.invoice_amount as invoiceAmount, i.paid_status as paidStatus
          FROM invoices i JOIN periods p ON p.id = i.period_id;`,
    new: `SELECT p.period_start as periodStart, i.invoice_amount as invoiceAmount, i.paid_status as paidStatus
          FROM invoices i
          JOIN periods p ON p.id = i.period_id
          JOIN subscriptions s ON s.id = i.subscription_id;`,
    fields: ["periodStart", "invoiceAmount", "paidStatus"],
  },
  arpuInvoices: {
    old: `SELECT c.contract_num as contractNum, p.period_start as periodStart, i.paid_status as paidStatus, i.invoice_amount as invoiceAmount
          FROM invoices i
          JOIN contracts c ON c.id = i.contract_id
          JOIN periods p ON p.id = i.period_id;`,
    new: `SELECT s.contract_num as contractNum, p.period_start as periodStart, i.paid_status as paidStatus, i.invoice_amount as invoiceAmount
          FROM invoices i
          JOIN subscriptions s ON s.id = i.subscription_id
          JOIN periods p ON p.id = i.period_id;`,
    fields: ["contractNum", "periodStart", "paidStatus", "invoiceAmount"],
  },
  tariffs: {
    old: `SELECT c.contract_num as contractNum, t.tariff, t.effective_from as effectiveFrom
          FROM tariffs t
          JOIN contracts c ON c.id = t.contract_id;`,
    new: `SELECT s.contract_num as contractNum, t.tariff, t.effective_from as effectiveFrom
          FROM tariffs t
          JOIN subscriptions s ON s.id = t.subscription_id;`,
    fields: ["contractNum", "tariff", "effectiveFrom"],
  },
};

function canonicalRow(row, fields) {
  const obj = {};
  for (const f of fields) obj[f] = row[f];
  return JSON.stringify(obj);
}

// Сравнение как МУЛЬТИМНОЖЕСТВО (с учётом повторов), не как упорядоченный
// список — monthlyInvoices не содержит contractNum, поэтому одинаковые
// кортежи полей у разных контрактов в принципе возможны.
function compareRowSets(oldRows, newRows, fields) {
  const oldCount = new Map();
  for (const r of oldRows) {
    const k = canonicalRow(r, fields);
    oldCount.set(k, (oldCount.get(k) || 0) + 1);
  }
  const newCount = new Map();
  for (const r of newRows) {
    const k = canonicalRow(r, fields);
    newCount.set(k, (newCount.get(k) || 0) + 1);
  }
  const onlyOld = [];
  const onlyNew = [];
  const allKeys = new Set([...oldCount.keys(), ...newCount.keys()]);
  for (const k of allKeys) {
    const oc = oldCount.get(k) || 0;
    const nc = newCount.get(k) || 0;
    if (oc > nc) onlyOld.push({ row: JSON.parse(k), extra: oc - nc });
    if (nc > oc) onlyNew.push({ row: JSON.parse(k), extra: nc - oc });
  }
  return { oldTotal: oldRows.length, newTotal: newRows.length, onlyOld, onlyNew };
}

function main() {
  let allPass = true;
  const results = {};

  console.log("=== ЧАСТЬ 1: построчное сравнение OLD vs NEW (три функции) ===\n");

  for (const [name, q] of Object.entries(QUERIES)) {
    const oldRows = queryLocalD1(q.old);
    const newRows = queryLocalD1(q.new);
    const cmp = compareRowSets(oldRows, newRows, q.fields);
    results[name] = { oldRows, newRows, cmp };
    const pass = cmp.oldTotal === cmp.newTotal && cmp.onlyOld.length === 0 && cmp.onlyNew.length === 0;
    if (!pass) allPass = false;

    console.log(`--- ${name} ---`);
    console.log(`OLD строк: ${cmp.oldTotal}, NEW строк: ${cmp.newTotal}`);
    console.log(`только в OLD: ${cmp.onlyOld.length} различных кортежей, только в NEW: ${cmp.onlyNew.length} различных кортежей`);
    console.log(pass ? "✅ PASS — множества строк идентичны" : "❌ FAIL");
    if (!pass) {
      for (const x of cmp.onlyOld.slice(0, 5)) console.log("  только в OLD:", JSON.stringify(x.row), `x${x.extra}`);
      for (const x of cmp.onlyNew.slice(0, 5)) console.log("  только в NEW:", JSON.stringify(x.row), `x${x.extra}`);
    }
    console.log();
  }

  console.log("=== ЧАСТЬ 2: сквозная проверка через ядро (сами числа) ===\n");

  // --- MRR ---
  const oldMrr = computeMonthlyMetrics(results.monthlyInvoices.oldRows);
  const newMrr = computeMonthlyMetrics(results.monthlyInvoices.newRows);
  const mrrPeriods = [...new Set([...oldMrr.keys(), ...newMrr.keys()])].sort();
  console.log("--- computeMonthlyMetrics (MRR) ---");
  console.log("период      | mrr old|new | issuedCount o|n | paidCount o|n | issuedAmount o|n");
  let mrrPass = true;
  for (const p of mrrPeriods) {
    const o = oldMrr.get(p);
    const n = newMrr.get(p);
    const same = JSON.stringify(o) === JSON.stringify(n);
    if (!same) mrrPass = false;
    console.log(
      `${p} | ${o?.mrr} | ${n?.mrr} | ${o?.issuedCount} | ${n?.issuedCount} | ${o?.paidCount} | ${n?.paidCount} | ${o?.issuedAmount} | ${n?.issuedAmount} ${same ? "" : "❌"}`,
    );
  }
  console.log(mrrPass ? "✅ PASS\n" : "❌ FAIL\n");
  if (!mrrPass) allPass = false;

  // --- ARPU ---
  const oldArpu = computeMonthlyArpu(results.arpuInvoices.oldRows, results.tariffs.oldRows);
  const newArpu = computeMonthlyArpu(results.arpuInvoices.newRows, results.tariffs.newRows);
  const arpuPeriods = [...new Set([...oldArpu.keys(), ...newArpu.keys()])].sort();
  console.log("--- computeMonthlyArpu ---");
  console.log("период      | arpu old | arpu new");
  let arpuPass = true;
  for (const p of arpuPeriods) {
    const o = oldArpu.get(p) ?? null;
    const n = newArpu.get(p) ?? null;
    const same = o === n;
    if (!same) arpuPass = false;
    console.log(`${p} | ${o} | ${n} ${same ? "" : "❌"}`);
  }
  console.log(arpuPass ? "✅ PASS\n" : "❌ FAIL\n");
  if (!arpuPass) allPass = false;

  // --- Movement ---
  console.log("--- computeMovement (май→июнь, июнь→июль, июль→авг 2026) ---");
  const pairs = [
    ["2026-05-01", "2026-06-01"],
    ["2026-06-01", "2026-07-01"],
    ["2026-07-01", "2026-08-01"],
  ];
  const numFields = ["newCount", "churnCount", "netAdds", "newMRR", "churnMRR", "monthlyChange"];
  const arrFields = ["newContracts", "churnContracts", "newContractsWithoutTariff", "churnContractsWithoutTariff"];
  let movementPass = true;
  for (const [prev, cur] of pairs) {
    const o = computeMovement(results.arpuInvoices.oldRows, results.tariffs.oldRows, prev, cur);
    const n = computeMovement(results.arpuInvoices.newRows, results.tariffs.newRows, prev, cur);
    let same = true;
    const diffs = [];
    for (const f of numFields) {
      if (o[f] !== n[f]) {
        same = false;
        diffs.push(`${f}: ${o[f]} vs ${n[f]}`);
      }
    }
    // Массивы контрактов сравниваю КАК МНОЖЕСТВА (сортировка) — разный
    // физический путь JOIN у SQLite может отдать invoices в другом
    // порядке, что дало бы ложный "разошлось" при позиционном сравнении.
    for (const f of arrFields) {
      const os = [...o[f]].sort().join(",");
      const ns = [...n[f]].sort().join(",");
      if (os !== ns) {
        same = false;
        diffs.push(`${f}: [${os}] vs [${ns}]`);
      }
    }
    if (!same) movementPass = false;
    console.log(
      `${prev} -> ${cur}: newCount ${o.newCount}|${n.newCount}, churnCount ${o.churnCount}|${n.churnCount}, ` +
        `newMRR ${o.newMRR}|${n.newMRR}, churnMRR ${o.churnMRR}|${n.churnMRR}, monthlyChange ${o.monthlyChange}|${n.monthlyChange} ${same ? "✅" : "❌"}`,
    );
    if (!same) for (const d of diffs) console.log("   ", d);
  }
  console.log(movementPass ? "✅ PASS\n" : "❌ FAIL\n");
  if (!movementPass) allPass = false;

  console.log("=== ИТОГОВЫЙ ВЕРДИКТ ===");
  for (const name of Object.keys(QUERIES)) {
    const r = results[name];
    const pass = r.cmp.oldTotal === r.cmp.newTotal && r.cmp.onlyOld.length === 0 && r.cmp.onlyNew.length === 0;
    console.log(`${name}: ${pass ? "PASS" : "FAIL"}`);
  }
  console.log(`ядро MRR: ${mrrPass ? "PASS" : "FAIL"}`);
  console.log(`ядро ARPU: ${arpuPass ? "PASS" : "FAIL"}`);
  console.log(`ядро Movement: ${movementPass ? "PASS" : "FAIL"}`);
  console.log(`\nИТОГО: ${allPass ? "✅ ВСЁ PASS — SQL-эквивалентность доказана" : "❌ ЕСТЬ РАСХОЖДЕНИЯ — СМ. ВЫШЕ"}`);

  if (!allPass) process.exit(1);
}

main();
