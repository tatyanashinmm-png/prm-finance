#!/usr/bin/env node
// Финализация ARPU в golden-mrr.json: табличный ARPU (со сдвигом диапазона
// в AVERAGEIF) помечается как невалидационный, наш расчёт (тариф ТОГО ЖЕ
// контракта, что оплатил) сохраняется как ourArpu — новый эталон на будущее.
// MRR/issuedAmount/issuedCount/paidCount не трогает. Только локальная D1 на
// чтение, ничего не пишет в базу. Запускать из корня репозитория:
// node scripts/finalize-golden-arpu.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeArpuForPeriod } from "../worker/core/arpu.mjs";

const DB_NAME = "prm-finance-db";
const ARPU_BUG_NOTE =
  "source_bug: AVERAGEIF range shift, not used for validation — диапазон условия " +
  "начинается со строки 12, а $H:$H выравнивается от строки 1, из-за чего формула " +
  "берёт тариф соседней строки, а не оплатившего контракта (подтверждено построчной " +
  "сверкой). См. отчёты по шагу 5.2.";

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--local", "--command", sql, "--json"],
    { encoding: "utf8" },
  );
  return JSON.parse(out)[0].results;
}

async function main() {
  const goldenPath = fileURLToPath(new URL("../golden-mrr.json", import.meta.url));
  const golden = JSON.parse(readFileSync(goldenPath, "utf8"));

  console.log("Читаю invoices и tariffs из ЛОКАЛЬНОЙ D1 (только чтение)...");
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

  for (const m of golden.months) {
    const ourArpu = computeArpuForPeriod(invoices, tariffs, m.periodStart);
    m.arpuSheet = m.arpu;
    m.arpuSheetNote = ARPU_BUG_NOTE;
    m.ourArpu = ourArpu;
    delete m.arpu;
    console.log(`${m.periodStart}: arpuSheet(невалидационный)=${m.arpuSheet}, ourArpu(новый эталон)=${ourArpu}`);
  }

  golden._formulas.arpu_meaning +=
    " ОБНОВЛЕНИЕ (шаг 5.2): подтверждена реальная ошибка в этой формуле таблицы " +
    "(сдвиг диапазона AVERAGEIF на 11 строк) — см. поле arpuSheetNote в каждом " +
    "месяце. Для валидации кода используется ourArpu, не arpuSheet.";

  writeFileSync(goldenPath, JSON.stringify(golden, null, 2), "utf8");
  console.log(`\nСохранено в ${goldenPath}`);
}

main().catch((err) => {
  console.error("Ошибка:", err.message || err);
  process.exit(1);
});
