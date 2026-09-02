#!/usr/bin/env node
// Диагностика: найти ВСЕХ реальных клиентов, потерянных при импорте —
// строки БЕЗ номера контракта, НЕ пустые и НЕ статуса "Блок" (значит статус
// "Активен" или иной, не "Блок"). Только чтение таблицы, ничего не пишет
// ни в базу, ни в git. Запускать из корня репозитория:
// node scripts/diagnose-missing-active.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchSheetValues } from "./lib/google-sheets.mjs";
import { toNum } from "./lib/parse-sheet.mjs";

function loadEnv() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function norm(v) {
  return String(v ?? "").trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function serialToYM(serial) {
  const d = new Date(EXCEL_EPOCH + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
function periodStartOf(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

async function main() {
  loadEnv();
  const sheetId = process.env.SHEET_ID;
  const sheetTab = process.env.SHEET_TAB || "Платные";
  const saJsonFile = process.env.GOOGLE_SA_JSON_FILE;
  const saJson = saJsonFile ? readFileSync(saJsonFile, "utf8") : process.env.GOOGLE_SA_JSON;

  const lines = [];
  const log = (s = "") => {
    console.log(s);
    lines.push(s);
  };

  log("Читаю лист из гугл-таблицы (только чтение)...");
  const values = await fetchSheetValues(saJson, sheetId, sheetTab);
  log(`Получено строк: ${values.length}\n`);

  let headerRow = -1;
  for (let i = 0; i < values.length; i++) {
    const row = (values[i] || []).map(norm);
    if (row.includes("Клиент") && row.includes("ЮрЛицо")) {
      headerRow = i;
      break;
    }
  }
  const header = (values[headerRow] || []).map(norm);
  const colClient = header.findIndex((h) => h === "Клиент");
  const colContractNum = header.findIndex((h) => h.toLowerCase().includes("контракт"));
  const colJur = header.findIndex((h) => h === "ЮрЛицо");
  const colManager = header.findIndex((h) => h.toLowerCase().startsWith("менеджер"));
  const colStatus = colJur + 1;

  const normLabel = (v) => norm(v).toLowerCase().replace(/ё/g, "е");
  const periodLabelCols = [];
  header.forEach((h, j) => {
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
      if (normLabel(header[j]) === "сумма" && j1 === j + 1 && normLabel(header[j1]) === "счет" && j2 === j + 2 && normLabel(header[j2]) === "оплачен") {
        triples.push({ sumCol: j, invoiceCol: j1, paidCol: j2 });
        i += 3;
      } else i += 1;
    }
  }
  // Месяц каждой тройки (как в parse-sheet.mjs), с carry-forward по row0
  const monthRow = values[0] || [];
  const maxCol = Math.max(0, ...triples.map((t) => t.paidCol));
  const carried = [];
  {
    let last = null;
    for (let j = 0; j <= maxCol; j++) {
      const cell = monthRow[j];
      let ym = null;
      if (typeof cell === "number") ym = serialToYM(cell);
      else {
        const s = norm(cell).match(/^(\d{4,6})/);
        if (s) ym = serialToYM(Number(s[1]));
      }
      if (ym) last = ym;
      carried[j] = last;
    }
  }
  const periodsInfo = triples.map((t) => {
    const ym = carried[t.sumCol];
    return { ...t, periodStart: ym ? periodStartOf(ym.year, ym.month) : null };
  });

  // --- 1. Собираем кандидатов: без номера, не пустые, статус != "Блок" ---
  const candidates = [];
  for (let i = headerRow + 1; i < values.length; i++) {
    const row = values[i] || [];
    const rowNum = i + 1;
    const contractNum = norm(row[colContractNum]);
    if (contractNum) continue; // есть номер — не наш случай

    const clientName = norm(row[colClient]);
    const status = norm(row[colStatus]);
    const hasAnySum = periodsInfo.some((p) => p.periodStart && norm(row[p.sumCol]) !== "");
    if (!clientName && !hasAnySum) continue; // полностью пустая строка — не считаем
    if (status === "Блок") continue; // это заблокированные, их уже разбирали отдельно

    const payments = []; // {periodStart, amount, paid}
    for (const p of periodsInfo) {
      if (!p.periodStart) continue;
      const sumRaw = row[p.sumCol];
      if (norm(sumRaw) === "") continue;
      const amount = toNum(sumRaw);
      const paid = norm(row[p.paidCol]);
      payments.push({ periodStart: p.periodStart, amount, paid });
    }
    const paidPayments = payments.filter((p) => p.paid === "Да");
    const lastPaidPeriod = paidPayments.length ? paidPayments.map((p) => p.periodStart).sort().at(-1) : null;

    candidates.push({
      row: rowNum,
      clientName,
      legalEntity: norm(row[colJur]) || null,
      status: status || "(пусто)",
      manager: colManager >= 0 ? norm(row[colManager]) || null : null,
      payments,
      paidPayments,
      lastPaidPeriod,
    });
  }

  // --- сортировка: сначала у кого есть свежие оплаты (по дате последней оплаты, новее — выше) ---
  candidates.sort((a, b) => {
    if (a.lastPaidPeriod && b.lastPaidPeriod) return b.lastPaidPeriod.localeCompare(a.lastPaidPeriod);
    if (a.lastPaidPeriod) return -1;
    if (b.lastPaidPeriod) return 1;
    return a.row - b.row;
  });

  log("=".repeat(78));
  log("1-2) РЕАЛЬНЫЕ КЛИЕНТЫ БЕЗ НОМЕРА КОНТРАКТА (не пустые, статус != «Блок»)");
  log("=".repeat(78));
  log(`\nВсего найдено: ${candidates.length}\n`);

  const recentMonths = ["2026-06-01", "2026-07-01", "2026-08-01"];
  for (const c of candidates) {
    const recent = c.payments
      .filter((p) => recentMonths.includes(p.periodStart))
      .map((p) => `${p.periodStart.slice(0, 7)}: ${p.amount}₽/"${p.paid}"`)
      .join(", ");
    const paidMonthsAll = c.paidPayments.map((p) => p.periodStart.slice(0, 7)).join(", ");
    log(`строка ${c.row}: клиент="${c.clientName}", юрлицо="${c.legalEntity || "—"}", статус="${c.status}", менеджер="${c.manager || "—"}"`);
    log(`  оплаты "Да" всего: ${c.paidPayments.length}${c.paidPayments.length ? ` (месяцы: ${paidMonthsAll})` : ""}`);
    log(`  06-08/2026: ${recent || "(нет данных за эти месяцы)"}`);
    log("");
  }

  // --- 3. Счётчики ---
  const countActive = candidates.filter((c) => c.status === "Активен").length;
  const countPaid2026 = candidates.filter((c) => c.paidPayments.some((p) => p.periodStart.startsWith("2026"))).length;

  log("=".repeat(78));
  log("3) СЧЁТЧИКИ");
  log("=".repeat(78));
  log(`\nВсего таких строк: ${candidates.length}`);
  log(`  со статусом «Активен»: ${countActive}`);
  log(`  со статусами, отличными от «Активен» и «Блок»: ${candidates.length - countActive}`);
  log(`  есть хотя бы одна оплата «Да» в 2026 году: ${countPaid2026}`);

  // --- 4. Строка 74 отдельно ---
  log(`\n${"=".repeat(78)}`);
  log("4) СТРОКА 74 (ООО «РЕКЛАМНЫЙ СТИЛЬ») — детально по 2026-05..08");
  log("=".repeat(78));
  const row74 = values[73] || [];
  for (const p of periodsInfo) {
    if (!p.periodStart || !["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"].includes(p.periodStart)) continue;
    const sumRaw = row74[p.sumCol];
    const paidRaw = row74[p.paidCol];
    log(`  ${p.periodStart.slice(0, 7)}: сумма=${JSON.stringify(sumRaw)} (тип ${typeof sumRaw}), paid_status="${norm(paidRaw)}"`);
  }

  // --- 5. Дубли имён среди кандидатов ---
  log(`\n${"=".repeat(78)}`);
  log("5) ДУБЛИ ИМЁН СРЕДИ ЭТИХ КАНДИДАТОВ");
  log("=".repeat(78));
  const byName = new Map();
  for (const c of candidates) {
    const key = c.clientName.trim().replace(/\s+/g, " ");
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(c);
  }
  const dupNames = [...byName.entries()].filter(([, list]) => list.length > 1);
  if (dupNames.length === 0) {
    log("\n(нет — все имена в этом наборе уникальны)");
  } else {
    for (const [name, list] of dupNames) {
      log(`\n  "${name}" — ${list.length} строк:`);
      for (const c of list) log(`    строка ${c.row}: юрлицо="${c.legalEntity || "—"}", статус="${c.status}"`);
    }
  }

  const outPath = fileURLToPath(new URL("../missing-active-report.txt", import.meta.url));
  writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`\nОтчёт сохранён в ${outPath}`);
  console.log("Ничего не импортировано и не изменено — только чтение.");
}

main().catch((err) => {
  console.error("Ошибка:", err.message || err);
  process.exit(1);
});
