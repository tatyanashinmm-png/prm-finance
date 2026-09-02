#!/usr/bin/env node
// Golden-тест ARPU: тянет invoices + tariffs из ЛОКАЛЬНОЙ D1, считает через
// чистое ядро (worker/core/arpu.mjs) и сверяет с golden-mrr.json.
//
// ВАЖНО: эталон таблицы (поле arpuSheet) содержит подтверждённый баг сдвига
// диапазона в AVERAGEIF (см. arpuSheetNote) и для валидации НЕ используется —
// сверяем с полем ourArpu (наш же расчёт, зафиксированный как эталон на
// будущее, после решения владельца данных). Ничего не пишет в базу.
// Запускать из корня репозитория: node scripts/test-golden-arpu.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeMonthlyArpu } from "../worker/core/arpu.mjs";

const DB_NAME = "prm-finance-db";

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--local", "--command", sql, "--json"],
    { encoding: "utf8" },
  );
  return JSON.parse(out)[0].results;
}

function round(n) {
  return n === null || n === undefined ? null : Math.round(n);
}

async function main() {
  const goldenPath = fileURLToPath(new URL("../golden-mrr.json", import.meta.url));
  const golden = JSON.parse(readFileSync(goldenPath, "utf8"));

  console.log("Читаю invoices и tariffs из ЛОКАЛЬНОЙ D1...");
  const invoices = queryLocalD1(`
    SELECT c.contract_num as contractNum, p.period_start as periodStart, i.paid_status as paidStatus
    FROM invoices i
    JOIN contracts c ON c.id = i.contract_id
    JOIN periods p ON p.id = i.period_id;
  `);
  const tariffs = queryLocalD1(`
    SELECT c.contract_num as contractNum, t.tariff, t.effective_from as effectiveFrom
    FROM tariffs t
    JOIN contracts c ON c.id = t.contract_id;
  `);
  console.log(`invoices: ${invoices.length}, tariffs: ${tariffs.length}`);

  const computed = computeMonthlyArpu(invoices, tariffs);

  console.log("\n=== ARPU: эталон (ourArpu, наш расчёт) vs посчитано сейчас (ядро + локальная БД) ===\n");
  console.log("(для справки в скобках — табличный ARPU, НЕ используется для валидации из-за бага сдвига диапазона)\n");
  const header = "Месяц       | ourArpu эталон | посчитано сейчас | (справочно: табличный) | статус";
  console.log(header);
  console.log("-".repeat(header.length));

  const mismatches = [];
  for (const g of golden.months) {
    const c = computed.get(g.periodStart) ?? null;
    const ok = round(g.ourArpu) === round(c);
    if (!ok) mismatches.push(g);
    console.log(
      `${g.periodStart} | ${String(round(g.ourArpu)).padStart(14)} | ${String(round(c)).padStart(17)} | ${String(round(g.arpuSheet)).padStart(23)} | ${ok ? "✅ совпало" : "❌ РАСХОЖДЕНИЕ"}`,
    );
  }

  if (mismatches.length === 0) {
    console.log("\n✅ ВСЕ месяцы совпали с нашим эталоном (округление до рубля).");
    return;
  }

  console.log(`\n❌ Расхождения в ${mismatches.length} месяц(ах). Разбираю по контрактам...\n`);

  const tariffByContract = new Map();
  for (const t of tariffs) {
    if (!tariffByContract.has(t.contractNum)) tariffByContract.set(t.contractNum, []);
    tariffByContract.get(t.contractNum).push(t);
  }
  for (const list of tariffByContract.values()) list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  function tariffAt(contractNum, periodStart) {
    const list = tariffByContract.get(contractNum);
    if (!list) return null;
    let result = null;
    for (const t of list) {
      if (t.effectiveFrom <= periodStart) result = t.tariff;
      else break;
    }
    return result;
  }

  for (const g of mismatches) {
    console.log(`--- ${g.periodStart} ---`);
    const paidThisPeriod = invoices.filter((i) => i.periodStart === g.periodStart && i.paidStatus === "Да");
    const withoutTariff = paidThisPeriod.filter((i) => tariffAt(i.contractNum, g.periodStart) === null);
    console.log(`  оплаченных контрактов в периоде: ${paidThisPeriod.length}, из них без тарифа на эту дату: ${withoutTariff.length}`);
    for (const w of withoutTariff.slice(0, 15)) {
      console.log(`    ${w.contractNum}: тарифа нет`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error("Ошибка:", err.message || err);
  process.exit(1);
});
