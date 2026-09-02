#!/usr/bin/env node
// Golden-тест: берёт invoices из ЛОКАЛЬНОЙ D1, считает метрики через чистое
// ядро (worker/core/mrr.mjs) и сверяет с golden-mrr.json (эталон из формул
// гугл-таблицы). Ничего не пишет в базу. Запускать из корня репозитория:
// node scripts/test-golden-mrr.mjs
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeMonthlyMetrics } from "../worker/core/mrr.mjs";
import { fetchSheetValues } from "./lib/google-sheets.mjs";
import { parseSheet, toNum } from "./lib/parse-sheet.mjs";

const DB_NAME = "prm-finance-db";

function loadEnv() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

const isRemote = process.argv.includes("--remote");
const target = isRemote ? "--remote" : "--local";

function queryLocalD1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, target, "--command", sql, "--json"],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  return parsed[0].results;
}

function roundRub(n) {
  return Math.round(n);
}

async function main() {
  loadEnv();
  const goldenPath = fileURLToPath(new URL("../golden-mrr.json", import.meta.url));
  const golden = JSON.parse(readFileSync(goldenPath, "utf8"));

  console.log(`Читаю invoices из ${isRemote ? "БОЕВОЙ (--remote)" : "ЛОКАЛЬНОЙ"} D1...`);
  const rows = queryLocalD1(`
    SELECT c.contract_num as contractNum, p.period_start as periodStart,
           i.invoice_amount as invoiceAmount, i.paid_status as paidStatus
    FROM invoices i
    JOIN contracts c ON c.id = i.contract_id
    JOIN periods p ON p.id = i.period_id;
  `);
  console.log(`Получено invoices из базы: ${rows.length}`);

  const computed = computeMonthlyMetrics(rows);

  console.log("\n=== Сравнение эталон (гугл-таблица) vs посчитано (ядро + локальная БД) ===\n");
  const header = "Месяц       | issuedAmount эталон/факт        | MRR эталон/факт           | issued эталон/факт | paid эталон/факт | статус";
  console.log(header);
  console.log("-".repeat(header.length));

  const mismatches = [];
  for (const g of golden.months) {
    const c = computed.get(g.periodStart) || { mrr: 0, issuedCount: 0, paidCount: 0, issuedAmount: 0 };

    const amountOk = roundRub(g.issuedAmount) === roundRub(c.issuedAmount);
    const mrrOk = roundRub(g.mrr) === roundRub(c.mrr);
    const issuedOk = g.issuedCount === c.issuedCount;
    const paidOk = g.paidCount === c.paidCount;
    const ok = amountOk && mrrOk && issuedOk && paidOk;
    if (!ok) mismatches.push({ periodStart: g.periodStart, golden: g, computed: c, amountOk, mrrOk, issuedOk, paidOk });

    console.log(
      `${g.periodStart} | ${String(roundRub(g.issuedAmount)).padStart(10)} / ${String(roundRub(c.issuedAmount)).padStart(10)}` +
        ` | ${String(roundRub(g.mrr)).padStart(9)} / ${String(roundRub(c.mrr)).padStart(9)}` +
        ` | ${String(g.issuedCount).padStart(4)} / ${String(c.issuedCount).padStart(4)}` +
        ` | ${String(g.paidCount).padStart(4)} / ${String(c.paidCount).padStart(4)}` +
        ` | ${ok ? "✅ совпало" : "❌ РАСХОЖДЕНИЕ"}`,
    );
  }

  if (mismatches.length === 0) {
    console.log("\n✅ ВСЕ месяцы совпали до рубля и штуки.");
    return;
  }

  console.log(`\n❌ Расхождения в ${mismatches.length} месяц(ах). Разбираю подробно...\n`);

  // ВАЖНО: сравнивать базу с parseSheet() бессмысленно — база и построена
  // через parseSheet(), совпадение гарантировано конструкцией (это не тест).
  // Сравниваем с СЫРЫМИ строками 12:421 напрямую — ровно тем диапазоном,
  // который суммирует формула таблицы, БЕЗ привязки к номеру контракта.
  const sheetId = process.env.SHEET_ID;
  const sheetTab = process.env.SHEET_TAB || "Платные";
  const saJsonFile = process.env.GOOGLE_SA_JSON_FILE;
  const saJson = saJsonFile ? readFileSync(saJsonFile, "utf8") : process.env.GOOGLE_SA_JSON;
  const values = await fetchSheetValues(saJson, sheetId, sheetTab);
  const parsed = parseSheet(values);

  const sheetHeader = values[10].map((h) => String(h ?? "").trim());
  const colClient = sheetHeader.findIndex((h) => h === "Клиент");
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

  const rowToContractNum = new Map(parsed.contracts.map((c) => [c.row, c.contractNum]));

  for (const m of mismatches) {
    console.log(`--- ${m.periodStart} ---`);
    console.log(
      `  величина расхождения: issuedAmount ${roundRub(m.computed.issuedAmount - m.golden.issuedAmount)}₽, ` +
        `MRR ${roundRub(m.computed.mrr - m.golden.mrr)}₽, ` +
        `issuedCount ${m.computed.issuedCount - m.golden.issuedCount}, ` +
        `paidCount ${m.computed.paidCount - m.golden.paidCount}`,
    );

    const t = tripleForPeriod(m.periodStart);
    if (!t) {
      console.log("  (не нашла колонки этого периода в текущем снимке таблицы)\n");
      continue;
    }

    const dbForPeriod = new Map(
      rows.filter((r) => r.periodStart === m.periodStart).map((r) => [r.contractNum, r]),
    );

    const excludedRows = [];
    const driftedRows = [];
    for (let r = 11; r <= 420; r++) {
      const rowNum = r + 1; // 1-based
      const sumRaw = (values[r] || [])[t.sumCol];
      const sumStr = String(sumRaw ?? "").trim();
      if (sumStr === "") continue; // формула тоже это не считает (SUM игнорирует пустое)
      const paidRaw = String((values[r] || [])[t.paidCol] ?? "").trim();
      const clientName = String((values[r] || [])[colClient] ?? "").trim();
      const cn = rowToContractNum.get(rowNum);
      if (!cn) {
        excludedRows.push({ rowNum, clientName, sum: sumRaw, paid: paidRaw });
        continue;
      }
      // строка учтена — сверим, совпадает ли то, что СЕЙЧАС в таблице,
      // с тем, что лежит у нас в базе (могла разойтись, если таблицу
      // правили ПОСЛЕ того, как мы делали импорт — база не живая копия).
      // ВАЖНО: используем toNum() (как в парсере — понимает "12 809" с
      // пробелом), а не голый Number() — иначе текстовые ячейки-числа дают
      // NaN и проверка их молча пропускает.
      const inDb = dbForPeriod.get(cn);
      const sheetAmount = toNum(sumRaw);
      const isTextCell = typeof sumRaw === "string";
      if (!inDb) {
        driftedRows.push({ rowNum, clientName, contractNum: cn, reason: "есть в таблице и должен быть в базе (по номеру строки), но в базе НЕТ invoice за этот период" });
      } else if (sheetAmount !== null && Math.round(inDb.invoiceAmount) !== Math.round(sheetAmount)) {
        driftedRows.push({
          rowNum,
          clientName,
          contractNum: cn,
          reason: `сумма разошлась: в базе ${inDb.invoiceAmount}₽, в таблице СЕЙЧАС ${sheetAmount}₽ (таблицу отредактировали после нашего импорта)`,
        });
      } else if (isTextCell) {
        driftedRows.push({
          rowNum,
          clientName,
          contractNum: cn,
          reason: `Сумма хранится ТЕКСТОМ (${JSON.stringify(sumRaw)}) — наш toNum() читает как ${sheetAmount}₽ (в базе ${inDb.invoiceAmount}₽, совпадает), но родная SUM()/SUMIF() Google Sheets текстовые ячейки игнорирует (считает как 0) — отсюда расхождение с формулой таблицы, это не наша ошибка, а более лояльный парсинг`,
        });
      } else if ((inDb.paidStatus || "") !== paidRaw) {
        driftedRows.push({
          rowNum,
          clientName,
          contractNum: cn,
          reason: `статус оплаты разошёлся: в базе "${inDb.paidStatus}", в таблице СЕЙЧАС "${paidRaw}"`,
        });
      }
    }

    if (excludedRows.length) {
      console.log(`  Строки, которые формула таблицы (SUM/SUMIF по 12:421) учитывает, а наш импорт — НЕТ (${excludedRows.length}):`);
      for (const e of excludedRows.slice(0, 10)) {
        console.log(`    строка ${e.rowNum}: клиент="${e.clientName}", сумма=${JSON.stringify(e.sum)}, оплачен="${e.paid}"`);
      }
      const sumOfExcluded = excludedRows.reduce((s, e) => s + (Number(e.sum) || 0), 0);
      const paidOfExcluded = excludedRows.filter((e) => e.paid === "Да").reduce((s, e) => s + (Number(e.sum) || 0), 0);
      console.log(`  Итого по этим строкам: сумма ${roundRub(sumOfExcluded)}₽, из них оплачено ${roundRub(paidOfExcluded)}₽, строк ${excludedRows.length}`);
    } else {
      console.log("  Нет строк, отсутствующих в базе целиком.");
    }
    if (driftedRows.length) {
      console.log(`  Строки, где таблица СЕЙЧАС расходится с тем, что лежит в базе (${driftedRows.length}) — похоже на правки таблицы после импорта:`);
      for (const d of driftedRows.slice(0, 10)) {
        console.log(`    строка ${d.rowNum} (${d.contractNum}, "${d.clientName}"): ${d.reason}`);
      }
    }
    if (!excludedRows.length && !driftedRows.length) {
      console.log("  Не нашла объяснения этим способом — нужен более глубокий разбор вручную.");
    }
    console.log();
  }
}

main().catch((err) => {
  console.error("Ошибка:", err.message || err);
  process.exit(1);
});
