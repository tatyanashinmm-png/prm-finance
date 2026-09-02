#!/usr/bin/env node
// Часть A: вытащить эталонные формулы и значения метрик из гугл-таблицы
// для golden-теста. Только чтение, ничего не пишет никуда, кроме
// golden-mrr.json. Запускать из корня репозитория: node scripts/extract-golden.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchSheetValues } from "./lib/google-sheets.mjs";

function loadEnv() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function norm(v) {
  return String(v ?? "").trim();
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

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function serialToYM(serial) {
  const d = new Date(EXCEL_EPOCH + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

async function main() {
  loadEnv();
  const sheetId = process.env.SHEET_ID;
  const sheetTab = process.env.SHEET_TAB || "Платные";
  const saJsonFile = process.env.GOOGLE_SA_JSON_FILE;
  const saJson = saJsonFile ? readFileSync(saJsonFile, "utf8") : process.env.GOOGLE_SA_JSON;

  console.log("Читаю ЗНАЧЕНИЯ (UNFORMATTED_VALUE)...");
  const values = await fetchSheetValues(saJson, sheetId, sheetTab, "A1:ZZ", "UNFORMATTED_VALUE");
  console.log("Читаю ФОРМУЛЫ (FORMULA)...");
  const formulas = await fetchSheetValues(saJson, sheetId, sheetTab, "A1:ZZ", "FORMULA");

  // headerRow — как и в parse-sheet.mjs
  let headerRow = -1;
  for (let i = 0; i < values.length; i++) {
    const row = (values[i] || []).map(norm);
    if (row.includes("Клиент") && row.includes("ЮрЛицо")) {
      headerRow = i;
      break;
    }
  }
  const header = (values[headerRow] || []).map(norm);
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

  // Месяц каждой тройки — из values[0] (формат "45292Сумма" и т.п.)
  function monthOfTriple(t) {
    const cell = values[0][t.sumCol];
    const s = norm(cell);
    const m = s.match(/^(\d{4,6})/);
    if (m) return serialToYM(Number(m[1]));
    if (typeof cell === "number") return serialToYM(cell);
    return null;
  }

  console.log(`\nВсего троек периодов: ${triples.length}`);
  console.log("Строки метрик (индексы 0-based) над заголовком (headerRow=" + headerRow + "):");
  for (let r = 0; r <= headerRow - 1; r++) {
    const labelCell = (values[r] || [])[2] ?? (values[r] || [])[1];
    console.log(`  строка ${r}: подпись(ы) в первых колонках = ${JSON.stringify((values[r] || []).slice(0, 3))}`);
  }

  // Выводим для ПЕРВОЙ тройки полностью: что в каждой из строк 0..headerRow-1
  // по 3 колонкам тройки — и значения, и формулы — чтобы понять структуру.
  const t0 = triples[0];
  console.log(`\n=== Первая тройка: колонки ${colLetter(t0.sumCol)}/${colLetter(t0.invoiceCol)}/${colLetter(t0.paidCol)} ===`);
  for (let r = 0; r < headerRow; r++) {
    for (const [name, col] of [["Сумма-кол", t0.sumCol], ["Счет-кол", t0.invoiceCol], ["Оплачен-кол", t0.paidCol]]) {
      const v = (values[r] || [])[col];
      const f = (formulas[r] || [])[col];
      if (v === "" && f === "") continue;
      console.log(`  строка ${r}, ${colLetter(col)} (${name}): значение=${JSON.stringify(v)}  формула=${JSON.stringify(f)}`);
    }
  }

  // --- целевые месяцы ---
  const targetMonths = [
    { year: 2026, month: 5 },
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
    { year: 2024, month: 6 },
    { year: 2025, month: 3 },
    { year: 2025, month: 11 },
  ];

  const golden = [];
  console.log("\n=== Метрики по целевым месяцам ===");
  for (const tm of targetMonths) {
    const t = triples.find((tt) => {
      const ym = monthOfTriple(tt);
      return ym && ym.year === tm.year && ym.month === tm.month;
    });
    if (!t) {
      console.log(`\n${tm.year}-${String(tm.month).padStart(2, "0")}: тройка не найдена в таблице`);
      continue;
    }
    const periodStart = `${tm.year}-${String(tm.month).padStart(2, "0")}-01`;
    console.log(`\n--- ${periodStart} (колонки ${colLetter(t.sumCol)}/${colLetter(t.invoiceCol)}/${colLetter(t.paidCol)}) ---`);

    const rowLabels = {};
    for (let r = 0; r < headerRow; r++) {
      const label3 = norm((values[r] || [])[t.invoiceCol]); // подпись метрики часто во 2-й колонке тройки
      const v1 = (values[r] || [])[t.sumCol];
      const v2 = (values[r] || [])[t.invoiceCol];
      const v3 = (values[r] || [])[t.paidCol];
      const f1 = (formulas[r] || [])[t.sumCol];
      const f2 = (formulas[r] || [])[t.invoiceCol];
      const f3 = (formulas[r] || [])[t.paidCol];
      if (norm(v1) === "" && norm(v2) === "" && norm(v3) === "") continue;
      console.log(`  строка ${r}: [${JSON.stringify(v1)}, ${JSON.stringify(v2)}, ${JSON.stringify(v3)}]`);
      console.log(`             формулы: [${JSON.stringify(f1)}, ${JSON.stringify(f2)}, ${JSON.stringify(f3)}]`);
    }

    // Строка 9: SUM(...) / "X / Y" / text(SUMIF(...), "#,###"). X считает
    // чекбокс "Счёт"=true — это НЕ то же самое, что наш issued_count (у нас
    // "выставлен" = есть непустая Сумма). Y = COUNTIF(Оплачен="Да") — это и
    // есть наш paid_count, совпадает по определению.
    const row9 = values[9] || [];
    const issuedAmount = row9[t.sumCol];
    const fraction = norm(row9[t.invoiceCol]); // "124 / 120"
    const mrrText = norm(row9[t.paidCol]); // "2 060 986" (текст с пробелами)
    const mrr = Number(mrrText.replace(/\s/g, "").replace(/[^\d.-]/g, ""));
    const fracMatch = fraction.match(/^(\d+)\s*\/\s*(\d+)$/);
    const sheetIssuedCheckboxCount = fracMatch ? Number(fracMatch[1]) : null;
    const sheetPaidCount = fracMatch ? Number(fracMatch[2]) : null;

    // Независимая (не по формуле таблицы, а прямым подсчётом сырых данных)
    // проверка "нашего" issued_count = число строк 12..421 с непустой Суммой
    // в этой тройке колонок, И paid_count = число строк с Оплачен="Да" —
    // это должно ТОЧНО совпасть с тем, что мы импортировали в invoices.
    let issuedCountBySum = 0;
    let paidCountByStatus = 0;
    for (let r = 11; r <= 420; r++) {
      const sumRaw = (values[r] || [])[t.sumCol];
      if (norm(sumRaw) !== "") issuedCountBySum++;
      const paidRaw = norm((values[r] || [])[t.paidCol]);
      if (paidRaw === "Да") paidCountByStatus++;
    }

    // Строка 8: ARPU = AVERAGEIF(<Оплачен>;"Да";$H:$H). Округляем до целого
    // рубля при сверке — в таблице ARPU показывают округлённым.
    const arpuRaw = (values[8] || [])[t.sumCol];
    const arpu = typeof arpuRaw === "number" ? arpuRaw : Number(arpuRaw);

    // Строки 2-7 (интерфейс 3-8): движение MRR месяц-к-месяцу.
    // Новых клиентов / Отток / Чистый приток — штуки; New MRR / Churn MRR /
    // MRR monthly change — деньги по тарифу H. Отток и Churn MRR в таблице
    // уже отрицательные, оставляю знак как есть (как в самой таблице).
    const movement = {
      newCount: (values[2] || [])[t.sumCol],
      churnCount: (values[3] || [])[t.sumCol],
      netAdds: (values[4] || [])[t.sumCol],
      newMRR: (values[5] || [])[t.sumCol],
      churnMRR: (values[6] || [])[t.sumCol],
      monthlyChange: (values[7] || [])[t.sumCol],
    };

    console.log(
      `  ПРОВЕРКА: сумма-выставлено(SUM)=${issuedAmount}, MRR(текст)="${mrrText}"→${mrr}, ARPU=${arpu}, ` +
        `дробь="${fraction}" (Счёт=true:${sheetIssuedCheckboxCount} / Оплачен=Да:${sheetPaidCount}), ` +
        `наш issued_count(строк с Суммой)=${issuedCountBySum}, наш paid_count=${paidCountByStatus}`,
    );
    console.log(`  ДВИЖЕНИЕ: ${JSON.stringify(movement)}`);

    golden.push({
      periodStart,
      issuedAmount,
      mrr,
      arpu: Number.isNaN(arpu) ? null : arpu,
      issuedCount: issuedCountBySum,
      paidCount: paidCountByStatus,
      movement,
      sheetFormulaNote: {
        fraction,
        sheetIssuedCheckboxCount,
        sheetPaidCount,
        comment:
          'Дробь в таблице — это (Счёт=true) / (Оплачен="Да"), НЕ (строк с Суммой) / (Оплачен="Да"). ' +
          "Наши issuedCount/paidCount посчитаны напрямую по сырым данным независимо от этой формулы.",
      },
    });
  }

  const output = {
    _formulas: {
      note: "Дословные формулы из строки метрик (индекс 9, сразу над заголовком). SUM_COL/INV_COL/PAID_COL — три колонки одного периода (Сумма/Счёт/Оплачен), например для 2026-08 это DF/DG/DH.",
      issuedAmount: "=SUM(SUM_COL12:SUM_COL421)",
      fraction_issuedOverPaid: '=COUNTIF(INV_COL12:INV_COL421; true) & " / " & COUNTIF(PAID_COL12:PAID_COL421;"Да")',
      fraction_meaning: 'ВАЖНО: левое число — count(чекбокс "Счёт"=true), НЕ count(строк с непустой Суммой). Правое число — count(Оплачен="Да"), совпадает с нашим paidCount.',
      mrr: '=text(SUMIF(PAID_COL12:PAID_COL421;"Да";SUM_COL12:SUM_COL421);"#,###")',
      mrr_meaning: 'Сумма Сумма-колонки там, где Оплачен="Да" — ровно то же определение, что мы реализуем в core/mrr.mjs.',
      arpu: "=AVERAGEIF(PAID_COL12:PAID_COL421;\"Да\";$H:$H)",
      arpu_meaning: 'ARPU усредняет НЕ Сумму периода, а колонку H ("АП" — фиксированная абонентская плата контракта), отфильтрованную по Оплачен="Да" ЭТОГО периода. ПОДТВЕРЖДЁН БАГ (шаг 5.2): диапазон условия PAID_COL12:PAID_COL421 не совпадает по размеру с $H:$H (весь столбец), из-за чего Sheets выравнивает их от строки 1 — формула на деле берёт тариф строки со сдвигом на 11, не тариф оплатившего контракта. См. arpuSheetNote в каждом месяце. Для валидации используется ourArpu (наш расчёт), не arpuSheet.',
      movement_newCount: '=COUNTIFS(PAID_COL:PAID_COL;"Да";PREV_PAID_COL:PREV_PAID_COL;"<>"&"ДА") — PREV_PAID_COL = колонка Оплачен предыдущего месяца.',
      movement_churnCount: '=-COUNTIFS(PAID_COL:PAID_COL;"<>"&"Да";PREV_PAID_COL:PREV_PAID_COL;"ДА") — уже отрицательное число.',
      movement_netAdds: "= (ячейка Новых клиентов) + (ячейка Отток), простая сумма двух ячеек в той же колонке.",
      movement_newMRR: '=SUMIFS($H:$H;PAID_COL:PAID_COL;"Да";PREV_PAID_COL:PREV_PAID_COL;"<>"&"ДА")',
      movement_churnMRR: '=-sumifs($H:$H;PAID_COL:PAID_COL;"<>"&"Да";PREV_PAID_COL:PREV_PAID_COL;"ДА") — уже отрицательное.',
      movement_monthlyChange: "= (ячейка New MRR) + (ячейка Churn MRR).",
      movement_meaning: 'В отличие от ARPU, здесь ВСЕ три диапазона ($H:$H, PAID_COL:PAID_COL, PREV_PAID_COL:PREV_PAID_COL) — полные столбцы одинакового "размера", поэтому Sheets выравнивает их построчно правильно (H1↔строка1, H2↔строка2 и т.д.) — сдвига на 11 строк здесь НЕТ, в отличие от ARPU. Формулы движения формально багом смещения не страдают.',
      dataRowRange: "Формулы issuedAmount/mrr/arpu считают по строкам 12:421 (1-based, как в интерфейсе Sheets) — это ровно тот же диапазон данных, что парсит наш импорт. Формулы движения (New/Churn MRR, счётчики) используют ПОЛНЫЕ столбцы без ограничения диапазона строк — см. movement_meaning.",
    },
    months: golden,
  };

  const outPath = fileURLToPath(new URL("../golden-mrr.json", import.meta.url));
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`\nЭталон сохранён в ${outPath}`);
}

main().catch((err) => {
  console.error("Ошибка:", err.message || err);
  process.exit(1);
});
