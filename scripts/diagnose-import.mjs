#!/usr/bin/env node
// Диагностика импорта из гугл-таблицы: ТОЛЬКО чтение таблицы и локальный
// анализ, ничего не пишет ни в какую базу. Запускать из корня репозитория:
// node scripts/diagnose-import.mjs
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchSheetValues } from "./lib/google-sheets.mjs";
import { parseSheet, toNum } from "./lib/parse-sheet.mjs";

function loadEnv() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function norm(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function colLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function main() {
  loadEnv();
  const sheetId = process.env.SHEET_ID;
  const sheetTab = process.env.SHEET_TAB || "Платные";
  const saJsonFile = process.env.GOOGLE_SA_JSON_FILE;
  const saJson = saJsonFile ? readFileSync(saJsonFile, "utf8") : process.env.GOOGLE_SA_JSON;
  if (!sheetId || !saJson) {
    console.error("Нет SHEET_ID и/или GOOGLE_SA_JSON(_FILE) в .env — диагностика невозможна.");
    process.exit(1);
  }

  const lines = [];
  const log = (s = "") => {
    console.log(s);
    lines.push(s);
  };

  log("Читаю лист из гугл-таблицы...");
  const values = await fetchSheetValues(saJson, sheetId, sheetTab);
  log(`Получено строк: ${values.length}\n`);

  // --- находим header row и колонки (та же логика, что в parse-sheet.mjs) ---
  let headerRow = -1;
  for (let i = 0; i < Math.min(values.length, 20); i++) {
    const row = (values[i] || []).map((x) => norm(x));
    if (row.includes("Клиент") && row.includes("ЮрЛицо")) {
      headerRow = i;
      break;
    }
  }
  const header = values[headerRow].map((x) => norm(x));
  const colClient = header.findIndex((h) => h === "Клиент");
  const colContractNum = header.findIndex((h) => h.toLowerCase().includes("контракт"));
  const colJur = header.findIndex((h) => h === "ЮрЛицо");

  const normLabel = (v) => norm(v).toLowerCase().replace("ё", "е");
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
      if (
        normLabel(header[j]) === "сумма" &&
        j1 === j + 1 &&
        normLabel(header[j1]) === "счет" &&
        j2 === j + 2 &&
        normLabel(header[j2]) === "оплачен"
      ) {
        triples.push({ sumCol: j, invoiceCol: j1, paidCol: j2 });
        i += 3;
      } else {
        i += 1;
      }
    }
  }

  // --- полный разбор через тот же parseSheet, что использует реальный импорт ---
  const parsed = parseSheet(values);

  log("=".repeat(70));
  log("1) ПРОПУЩЕННЫЕ СТРОКИ («нет номера контракта») — детальный разбор");
  log("=".repeat(70));

  const noContractRows = parsed.issues.skippedRows
    .filter((s) => s.reason === "нет номера контракта")
    .map((s) => s.row);

  const suspicious = [];
  const empty = [];
  for (const rowNum of noContractRows) {
    const row = values[rowNum - 1] || [];
    const clientName = norm(row[colClient]);
    let anySum = false;
    let sumExamples = [];
    for (const t of triples) {
      const raw = row[t.sumCol];
      if (norm(raw) !== "") {
        anySum = true;
        if (sumExamples.length < 3) sumExamples.push(`${colLetter(t.sumCol)}=${JSON.stringify(raw)}`);
      }
    }
    const entry = { rowNum, clientName, anySum, sumExamples };
    if (clientName || anySum) suspicious.push(entry);
    else empty.push(entry);
  }

  log(`\nВсего пропущенных «нет номера контракта»: ${noContractRows.length}`);
  log(`  (А) ПОДОЗРИТЕЛЬНЫЕ (есть имя клиента и/или есть сумма): ${suspicious.length}`);
  log(`  (Б) ПУСТЫЕ (ни имени, ни сумм): ${empty.length}\n`);

  if (suspicious.length) {
    log("--- (А) ПОДОЗРИТЕЛЬНЫЕ — полный список ---");
    for (const s of suspicious) {
      log(
        `  строка ${s.rowNum}: клиент=${JSON.stringify(s.clientName) || '""'}, ` +
          `есть сумма=${s.anySum ? "да" : "нет"}` +
          (s.sumExamples.length ? `, примеры: ${s.sumExamples.join(", ")}` : ""),
      );
    }
  } else {
    log("--- (А) ПОДОЗРИТЕЛЬНЫЕ: пусто ---");
  }

  log(`\n--- (Б) ПУСТЫЕ: ${empty.length} строк (без перечисления, это норма) ---`);
  if (empty.length) {
    log(`  диапазон строк: ${Math.min(...empty.map((e) => e.rowNum))}–${Math.max(...empty.map((e) => e.rowNum))}`);
  }

  log(`\n${"=".repeat(70)}`);
  log("2) ГРАНИЦА СПЛОШНОГО БЛОКА ПРОПУСКОВ");
  log("=".repeat(70));

  // ищем начало самого длинного НЕПРЕРЫВНОГО блока подряд идущих пропущенных строк
  const sortedSkips = [...noContractRows].sort((a, b) => a - b);
  let blockStart = null,
    blockEnd = null,
    bestLen = 0,
    curStart = null,
    prev = null;
  for (const r of sortedSkips) {
    if (prev !== null && r === prev + 1) {
      // продолжение блока
    } else {
      curStart = r;
    }
    const curLen = r - curStart + 1;
    if (curLen > bestLen) {
      bestLen = curLen;
      blockStart = curStart;
      blockEnd = r;
    }
    prev = r;
  }
  log(`\nСамый длинный сплошной блок пропущенных строк: ${blockStart}–${blockEnd} (${bestLen} строк подряд)`);

  log(`\nСодержимое строк ${blockStart - 1}, ${blockStart}, ${blockStart + 1}, ${blockStart + 2} по ВСЕМ колонкам:`);
  for (const rn of [blockStart - 1, blockStart, blockStart + 1, blockStart + 2]) {
    const row = values[rn - 1] || [];
    const nonEmpty = row
      .map((v, j) => ({ j, v }))
      .filter((x) => norm(x.v) !== "");
    log(`\n  строка ${rn}:`);
    if (!nonEmpty.length) {
      log("    (полностью пустая по всем колонкам)");
    } else {
      for (const { j, v } of nonEmpty) {
        log(`    ${colLetter(j)} (${header[j] || "?"}) = ${JSON.stringify(v)}`);
      }
    }
  }

  log(`\n${"=".repeat(70)}`);
  log("3) НЕПОЛНЫЕ/НЕПОНЯТНЫЕ ПЕРИОДНЫЕ ТРОЙКИ");
  log("=".repeat(70));
  log(`\nВсего троек Сумма/Счёт/Оплачен, распознанных по заголовку: ${triples.length}`);
  log(`Неполных/непонятных (по мнению парсера): ${parsed.issues.incompleteTriples.length}`);
  if (parsed.issues.incompleteTriples.length) {
    for (const t of parsed.issues.incompleteTriples) {
      log(`  колонка ${t.startColLetter ?? colLetter(t.startCol)}: ${JSON.stringify(t)}`);
    }
  } else {
    log("  (нет — все обнаруженные тройки полные и однозначные)");
  }

  log(`\n${"=".repeat(70)}`);
  log('4) ПРОВЕРКА СТОЛБЦА "СЧЁТ" — сырое содержимое (не искажает ли парсер)');
  log("=".repeat(70));

  const checkContracts = ["07.6769-12.24", "07.3007-03.24", "07.4287-07.24"];
  for (const cn of checkContracts) {
    let foundRow = -1;
    for (let i = headerRow + 1; i < values.length; i++) {
      if (norm((values[i] || [])[colContractNum]) === cn) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow < 0) {
      log(`\nКонтракт ${cn}: не найден`);
      continue;
    }
    const row = values[foundRow - 1] || [];
    log(`\nКонтракт ${cn} (клиент: ${norm(row[colClient])}), строка ${foundRow} — первые 4 периода:`);
    for (const t of triples.slice(0, 4)) {
      const sumRaw = row[t.sumCol];
      const invRaw = row[t.invoiceCol];
      const paidRaw = row[t.paidCol];
      log(
        `  ${colLetter(t.sumCol)}(Сумма)=${JSON.stringify(sumRaw)}  ` +
          `${colLetter(t.invoiceCol)}(Счёт)=${JSON.stringify(invRaw)} [тип: ${typeof invRaw}]  ` +
          `${colLetter(t.paidCol)}(Оплачен)=${JSON.stringify(paidRaw)}`,
      );
    }
  }

  log(`\n${"=".repeat(70)}`);
  log("Готово. База НЕ изменялась, remote и git не трогались.");

  const outPath = fileURLToPath(new URL("../diagnostic-report.txt", import.meta.url));
  writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`\nОтчёт сохранён в ${outPath}`);
}

main().catch((err) => {
  console.error("Ошибка:", err.message || err);
  process.exit(1);
});
