#!/usr/bin/env node
// Golden-тест движения MRR (New/Churn): тянет invoices+tariffs из ЛОКАЛЬНОЙ
// D1, считает через чистое ядро (worker/core/movement.mjs) и сверяет с
// golden-mrr.json (поле movement, из формул таблицы). Ничего не пишет в базу.
// Запускать из корня репозитория: node scripts/test-golden-movement.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeMovement } from "../worker/core/movement.mjs";
import { fetchSheetValues } from "./lib/google-sheets.mjs";
import { parseSheet } from "./lib/parse-sheet.mjs";

const DB_NAME = "prm-finance-db";

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--local", "--command", sql, "--json"],
    { encoding: "utf8" },
  );
  return JSON.parse(out)[0].results;
}

function prevMonth(periodStart) {
  const [y, m] = periodStart.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function main() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  process.loadEnvFile(envPath);

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

  console.log("\n=== Движение MRR: эталон (таблица) vs посчитано (ядро + локальная БД) ===\n");
  const header =
    "Месяц       | newCount эт/факт | churnCount эт/факт | newMRR эт/факт      | churnMRR эт/факт      | monthlyChange эт/факт | статус";
  console.log(header);
  console.log("-".repeat(header.length));

  const results = [];
  for (const g of golden.months) {
    const prev = prevMonth(g.periodStart);
    const computed = computeMovement(invoices, tariffs, prev, g.periodStart);
    const m = g.movement;

    // В таблице churnCount хранится отрицательным (как отображается в
    // ячейке), наше ядро возвращает churnCount положительным (штука —
    // естественно неотрицательное число; netAdds = newCount - churnCount
    // корректен именно с положительным churnCount). Сравниваем по модулю.
    const ok =
      m.newCount === computed.newCount &&
      Math.abs(m.churnCount) === computed.churnCount &&
      m.newMRR === computed.newMRR &&
      m.churnMRR === computed.churnMRR &&
      m.monthlyChange === computed.monthlyChange;

    results.push({ g, prev, computed, ok });

    console.log(
      `${g.periodStart} | ${String(m.newCount).padStart(7)}/${String(computed.newCount).padStart(6)} | ` +
        `${String(m.churnCount).padStart(9)}/${String(computed.churnCount).padStart(7)} | ` +
        `${String(m.newMRR).padStart(9)}/${String(computed.newMRR).padStart(9)} | ` +
        `${String(m.churnMRR).padStart(10)}/${String(computed.churnMRR).padStart(10)} | ` +
        `${String(m.monthlyChange).padStart(10)}/${String(computed.monthlyChange).padStart(10)} | ` +
        `${ok ? "✅ совпало" : "❌ РАСХОЖДЕНИЕ"}`,
    );
  }

  const mismatches = results.filter((r) => !r.ok);
  if (mismatches.length === 0) {
    console.log("\n✅ ВСЕ месяцы совпали точно.");
    return;
  }

  console.log(`\n❌ Расхождения в ${mismatches.length} месяц(ах). Разбираю по контрактам...\n`);

  // Независимая реконструкция прямо из сырых данных таблицы (полные столбцы,
  // как в самой формуле — без ограничения диапазона строк и БЕЗ привязки к
  // номеру контракта), чтобы найти конкретные строки, которые расходятся.
  const sheetId = process.env.SHEET_ID;
  const sheetTab = process.env.SHEET_TAB || "Платные";
  const saJsonFile = process.env.GOOGLE_SA_JSON_FILE;
  const saJson = saJsonFile ? readFileSync(saJsonFile, "utf8") : process.env.GOOGLE_SA_JSON;
  const values = await fetchSheetValues(saJson, sheetId, sheetTab);
  const parsed = parseSheet(values);
  const rowToContractNum = new Map(parsed.contracts.map((c) => [c.row, c.contractNum]));

  const sheetHeader = values[10].map((h) => String(h ?? "").trim());
  const colClient = sheetHeader.findIndex((h) => h === "Клиент");
  const colTariff = sheetHeader.findIndex((h) => h === "АП");
  const normLabel = (v) => String(v ?? "").trim().toLowerCase().replace(/ё/g, "е");
  const periodLabelCols = [];
  sheetHeader.forEach((h, j) => {
    const l = normLabel(h);
    if (l === "сумма" || l === "счет" || l === "оплачен") periodLabelCols.push(j);
  });
  const triples = [];
  {
    let i = 0;
    while (i < periodLabelCols.length) {
      const j = periodLabelCols[i];
      const j1 = periodLabelCols[i + 1];
      const j2 = periodLabelCols[i + 2];
      if (normLabel(sheetHeader[j]) === "сумма" && j1 === j + 1 && normLabel(sheetHeader[j1]) === "счет" && j2 === j + 2 && normLabel(sheetHeader[j2]) === "оплачен") {
        triples.push({ sumCol: j, invoiceCol: j1, paidCol: j2 });
        i += 3;
      } else i += 1;
    }
  }
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  function serialToYM(serial) {
    const d = new Date(EXCEL_EPOCH + serial * 86400000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }
  function tripleForPeriod(periodStart) {
    const [y, mo] = periodStart.split("-").map(Number);
    return triples.find((t) => {
      const s = String(values[0][t.sumCol] ?? "").match(/^(\d{4,6})/);
      if (!s) return false;
      const ym = serialToYM(Number(s[1]));
      return ym.year === y && ym.month === mo;
    });
  }

  for (const { g, prev, computed } of mismatches) {
    console.log(`--- ${g.periodStart} (пред. месяц ${prev}) ---`);
    console.log(
      `  расхождение: newCount ${computed.newCount - g.movement.newCount}, churnCount ${computed.churnCount - Math.abs(g.movement.churnCount)}, ` +
        `newMRR ${computed.newMRR - g.movement.newMRR}₽, churnMRR ${computed.churnMRR - g.movement.churnMRR}₽`,
    );

    const tCur = tripleForPeriod(g.periodStart);
    const tPrev = tripleForPeriod(prev);
    if (!tCur || !tPrev) {
      console.log("  (не нашла колонки одного из периодов в текущем снимке таблицы)\n");
      continue;
    }

    // Сырые "новые"/"отток" по ВСЕМ строкам 12:421, независимо от номера
    // контракта — ровно то же условие, что использует COUNTIFS в таблице.
    const rawNew = [];
    const rawChurn = [];
    for (let r = 11; r <= 420; r++) {
      const rowNum = r + 1;
      const paidCurRaw = String((values[r] || [])[tCur.paidCol] ?? "").trim();
      const paidPrevRaw = String((values[r] || [])[tPrev.paidCol] ?? "").trim();
      const clientName = String((values[r] || [])[colClient] ?? "").trim();
      const cn = rowToContractNum.get(rowNum) || null;
      if (paidCurRaw === "Да" && paidPrevRaw !== "Да") rawNew.push({ rowNum, clientName, contractNum: cn });
      if (paidPrevRaw === "Да" && paidCurRaw !== "Да") rawChurn.push({ rowNum, clientName, contractNum: cn });
    }

    const ourNewSet = new Set(computed.newContracts);
    const ourChurnSet = new Set(computed.churnContracts);

    const newOnlySheet = rawNew.filter((r) => !r.contractNum || !ourNewSet.has(r.contractNum));
    const newOnlyOurs = computed.newContracts.filter((cn) => !rawNew.some((r) => r.contractNum === cn));
    const churnOnlySheet = rawChurn.filter((r) => !r.contractNum || !ourChurnSet.has(r.contractNum));
    const churnOnlyOurs = computed.churnContracts.filter((cn) => !rawChurn.some((r) => r.contractNum === cn));

    if (newOnlySheet.length) {
      console.log(`  "Новые" по сырым данным таблицы, но НЕ в нашем списке (${newOnlySheet.length}):`);
      for (const r of newOnlySheet.slice(0, 10)) {
        console.log(`    строка ${r.rowNum}: "${r.clientName}"${r.contractNum ? " (" + r.contractNum + ")" : " — БЕЗ номера контракта, не импортирован"}`);
      }
    }
    if (newOnlyOurs.length) {
      console.log(`  "Новые" у нас, но НЕ совпадают с сырым сканом (${newOnlyOurs.length}): ${newOnlyOurs.join(", ")}`);
    }
    if (churnOnlySheet.length) {
      console.log(`  "Отток" по сырым данным таблицы, но НЕ в нашем списке (${churnOnlySheet.length}):`);
      for (const r of churnOnlySheet.slice(0, 10)) {
        console.log(`    строка ${r.rowNum}: "${r.clientName}"${r.contractNum ? " (" + r.contractNum + ")" : " — БЕЗ номера контракта, не импортирован"}`);
      }
    }
    if (churnOnlyOurs.length) {
      console.log(`  "Отток" у нас, но НЕ совпадают с сырым сканом (${churnOnlyOurs.length}): ${churnOnlyOurs.join(", ")}`);
    }
    if (computed.newContractsWithoutTariff.length) {
      console.log(`  Новые БЕЗ тарифа (не вошли в newMRR): ${computed.newContractsWithoutTariff.join(", ")}`);
    }
    if (computed.churnContractsWithoutTariff.length) {
      console.log(`  Отток БЕЗ тарифа (не вошли в churnMRR): ${computed.churnContractsWithoutTariff.join(", ")}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error("Ошибка:", err.message || err);
  process.exit(1);
});
