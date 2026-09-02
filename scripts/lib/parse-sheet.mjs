// Разбор листа "Платные" гугл-таблицы "Статусы платежей и актов" в
// нормализованную структуру (контракты / периоды / invoices) для импорта в D1.
// Все спорные и неполные места НЕ угадываются — попадают в issues отчёта.

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function norm(v) {
  return String(v ?? "").trim();
}

function normLabel(v) {
  return norm(v).toLowerCase().replace(/ё/g, "е");
}

// Ключ contract_num для заблокированных без номера: "BLOCK-<имя>", с
// нормализацией — схлопнуть пробелы, заменить символы, которые могут
// сломать использование строки как натурального ключа, на "_".
export function normalizeClientNameForKey(name) {
  let n = norm(name).replace(/\s+/g, " ");
  n = n.replace(/['"`\\/\x00-\x1f]/g, "_");
  return n;
}

export function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[\s ]/g, "").replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

// Excel/Sheets серийная дата -> {year, month} (month 1..12), либо null если
// значение не похоже на серийную дату.
function serialToYearMonth(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  const d = new Date(EXCEL_EPOCH + serial * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

const RU_MONTHS = {
  "январь": 1, "янв": 1, "февраль": 2, "фев": 2, "март": 3, "мар": 3,
  "апрель": 4, "апр": 4, "май": 5, "июнь": 6, "июн": 6, "июль": 7, "июл": 7,
  "август": 8, "авг": 8, "сентябрь": 9, "сен": 9, "октябрь": 10, "окт": 10,
  "ноябрь": 11, "ноя": 11, "декабрь": 12, "дек": 12,
};

// Текстовая подпись месяца ("август 2026", "авг.26", "08.2026" и т.п.) ->
// {year, month}, либо null если не распознали.
function parseMonthText(text) {
  const t = norm(text).toLowerCase().replace(/ё/g, "е");
  if (!t) return null;

  let m = t.match(/^(\d{1,2})[.\-/](\d{4})$/); // 08.2026
  if (m) return { year: Number(m[2]), month: Number(m[1]) };

  m = t.match(/^(\d{4})[.\-/](\d{1,2})$/); // 2026-08
  if (m) return { year: Number(m[1]), month: Number(m[2]) };

  for (const [name, num] of Object.entries(RU_MONTHS)) {
    if (t.startsWith(name)) {
      const yearMatch = t.match(/(\d{4}|\d{2})\s*$/);
      if (yearMatch) {
        let year = Number(yearMatch[1]);
        if (year < 100) year += 2000;
        return { year, month: num };
      }
      return null; // есть месяц, но нет года — не угадываем
    }
  }
  return null;
}

function monthLabelToYearMonth(cell) {
  if (cell === null || cell === undefined || cell === "") return null;
  if (typeof cell === "number") return serialToYearMonth(cell);
  const s = norm(cell);
  // Основной формат в самой первой строке листа: "45292Сумма" / "45292Счет" /
  // "45292Оплачен" — серийная дата и роль колонки склеены в одну строку.
  const m = s.match(/^(\d{4,6})(Сумма|Счет|Счёт|Оплачен)?$/i);
  if (m) return serialToYearMonth(Number(m[1]));
  return parseMonthText(s);
}

function periodStartOf(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * @param {any[][]} values - как из Sheets API (UNFORMATTED_VALUE)
 */
export function parseSheet(values) {
  const issues = {
    incompleteTriples: [],
    skippedRows: [],
    duplicateContracts: [],
    duplicateBlockedNames: [],
    unresolvedMonths: [],
    contractsWithoutTariff: [],
  };

  // 1. Строка-заголовок: первая, где есть и "Клиент", и "ЮрЛицо"
  let headerRow = -1;
  for (let i = 0; i < values.length; i++) {
    const row = (values[i] || []).map(norm);
    if (row.includes("Клиент") && row.includes("ЮрЛицо")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) {
    throw new Error('Не найдена строка заголовка (нет строки с "Клиент" и "ЮрЛицо")');
  }
  const header = (values[headerRow] || []).map(norm);

  const colClient = header.findIndex((h) => h === "Клиент");
  const colContractNum = header.findIndex((h) => normLabel(h).includes("контракт"));
  const colJur = header.findIndex((h) => h === "ЮрЛицо");
  const colManager = header.findIndex((h) => normLabel(h).startsWith("менеджер"));
  const colImportant = header.findIndex((h) => h.startsWith("Важно"));
  const colTariff = header.findIndex((h) => h === "АП"); // месячный тариф ("абонплата")
  if (colClient < 0 || colContractNum < 0 || colJur < 0) {
    throw new Error("Не нашла обязательные колонки (Клиент / Номер контракта / ЮрЛицо)");
  }
  // Контрактный статус — колонка СРАЗУ после "ЮрЛицо" (не по названию: в
  // таблице второй "Статус" встречается ещё раз перед периодами, его игнорируем).
  const colStatus = colJur + 1;

  // 2. Периодные тройки: ищем по подписям Сумма/Счёт/Оплачен в строке
  // заголовка, группируем по СОСЕДНИМ колонкам (не по фиксированному шагу 3).
  const isSumLabel = (l) => l === "сумма";
  const isInvoiceLabel = (l) => l === "счет" || l === "счёт";
  const isPaidLabel = (l) => l === "оплачен";
  const periodLabelCols = [];
  header.forEach((h, j) => {
    const l = normLabel(h);
    if (isSumLabel(l) || isInvoiceLabel(l) || isPaidLabel(l)) periodLabelCols.push(j);
  });

  const triples = []; // {sumCol, invoiceCol, paidCol}
  {
    let i = 0;
    while (i < periodLabelCols.length) {
      const j = periodLabelCols[i];
      const l = normLabel(header[j]);
      const j1 = periodLabelCols[i + 1];
      const j2 = periodLabelCols[i + 2];
      if (
        isSumLabel(l) &&
        j1 === j + 1 &&
        isInvoiceLabel(normLabel(header[j1])) &&
        j2 === j + 2 &&
        isPaidLabel(normLabel(header[j2]))
      ) {
        triples.push({ sumCol: j, invoiceCol: j1, paidCol: j2 });
        i += 3;
      } else {
        issues.incompleteTriples.push({
          startCol: j,
          startColLetter: colLetter(j),
          found: [j, j1, j2]
            .filter((c) => c !== undefined)
            .map((c) => `${colLetter(c)}:"${header[c]}"`)
            .join(", "),
        });
        i += 1;
      }
    }
  }

  // 3. Месяц каждой тройки — из САМОЙ ПЕРВОЙ строки листа (индекс 0, формат
  // "45292Сумма"/"45292Счет"/"45292Оплачен"), с carry-forward на случай, если
  // подпись стоит не над каждым из трёх столбцов. Строка сразу над заголовком
  // — это НЕ месяцы, там сводные метрики (Новых клиентов, Отток, ARPU и т.п.).
  const monthRow = values[0] || [];
  const maxCol = Math.max(0, ...triples.map((t) => t.paidCol));
  const carried = [];
  {
    let last = null;
    for (let j = 0; j <= maxCol; j++) {
      const cell = monthRow[j];
      const ym = monthLabelToYearMonth(cell);
      if (ym) last = ym;
      carried[j] = last;
    }
  }

  const periodsInfo = triples.map((t) => {
    const ym = carried[t.sumCol] || carried[t.invoiceCol] || carried[t.paidCol];
    if (!ym) {
      issues.unresolvedMonths.push({
        startCol: t.sumCol,
        startColLetter: colLetter(t.sumCol),
      });
      return { ...t, periodStart: null };
    }
    return { ...t, periodStart: periodStartOf(ym.year, ym.month) };
  });

  // Извлечь invoice-строки для одного контракта (активного или
  // заблокированного) по уже известным периодам — общая логика для обоих.
  function extractInvoiceRows(row, contractNum, rowNum) {
    const out = [];
    for (const p of periodsInfo) {
      if (!p.periodStart) continue;
      const sumRaw = row[p.sumCol];
      if (norm(sumRaw) === "") continue; // ничего по этому периоду — штатно
      const amount = toNum(sumRaw);
      if (amount === null) {
        // "Счёт" в этой таблице — чекбокс (выставлен/нет), не номер счёта,
        // поле убрано из схемы совсем. Гейт — только по Сумме. Здесь Сумма
        // непустая, но не распознаётся как число — настоящая аномалия.
        issues.skippedRows.push({
          row: rowNum,
          reason: `период ${p.periodStart}: Сумма не распознана как число ("${sumRaw}", контракт ${contractNum})`,
        });
        continue;
      }
      out.push({
        contractNum,
        periodStart: p.periodStart,
        invoiceAmount: amount,
        paidStatus: norm(row[p.paidCol]) || null,
      });
    }
    return out;
  }

  // 4. Строки данных.
  const seenContractNums = new Map(); // contract_num -> первая строка (1-based)
  const contracts = [];
  const invoicesByPeriod = new Map(); // periodStart -> count (период создаём только если есть хотя бы 1 счёт)
  const invoiceRows = [];

  // Заблокированные без номера собираем отдельно — сначала все кандидаты,
  // потом проверяем дубли имён и только после этого решаем, кого вставлять.
  const blockedCandidates = []; // {nameKey, clientName, ..., row, rawRow}

  for (let i = headerRow + 1; i < values.length; i++) {
    const row = values[i] || [];
    const rowNum = i + 1; // 1-based, как в интерфейсе Google Sheets
    const contractNum = norm(row[colContractNum]);

    if (!contractNum) {
      const clientName = norm(row[colClient]);
      const status = norm(row[colStatus]);
      const hasAnySum = periodsInfo.some((p) => p.periodStart && norm(row[p.sumCol]) !== "");

      if (!clientName && !hasAnySum) {
        continue; // полностью пустая строка — не репортим, это норма
      }

      if (status === "Блок") {
        if (!hasAnySum) {
          // Есть имя, но по нему вообще нет истории сумм — переносить
          // нечего, оставляем как пропуск с явной причиной.
          issues.skippedRows.push({
            row: rowNum,
            reason: `заблокированный клиент "${clientName}" без истории сумм по периодам — не переносим`,
          });
          continue;
        }
        blockedCandidates.push({
          nameKey: normalizeClientNameForKey(clientName),
          clientName,
          legalEntity: norm(row[colJur]) || null,
          status,
          manager: colManager >= 0 ? norm(row[colManager]) || null : null,
          note: colImportant >= 0 ? norm(row[colImportant]) || null : null,
          tariff: colTariff >= 0 ? toNum(row[colTariff]) : null,
          row: rowNum,
          rawRow: row,
        });
        continue;
      }

      // Не пустая, не заблокированная-без-номера (например статус "Активен"
      // без номера, или строка-метрика в самом низу листа) — как раньше.
      issues.skippedRows.push({ row: rowNum, reason: "нет номера контракта" });
      continue;
    }

    const rowSums = periodsInfo
      .filter((p) => p.periodStart)
      .map((p) => toNum(row[p.sumCol]))
      .filter((amount) => amount !== null);

    if (rowSums.length === 0) {
      issues.skippedRows.push({
        row: rowNum,
        reason: `нет ни одной суммы по периодам (контракт ${contractNum})`,
      });
      continue;
    }

    if (seenContractNums.has(contractNum)) {
      issues.duplicateContracts.push({
        contractNum,
        firstRow: seenContractNums.get(contractNum),
        duplicateRow: rowNum,
      });
    } else {
      seenContractNums.set(contractNum, rowNum);
    }

    const contract = {
      contractNum,
      clientName: norm(row[colClient]),
      legalEntity: norm(row[colJur]) || null,
      status: norm(row[colStatus]) || null,
      manager: colManager >= 0 ? norm(row[colManager]) || null : null,
      note: colImportant >= 0 ? norm(row[colImportant]) || null : null,
      tariff: colTariff >= 0 ? toNum(row[colTariff]) : null,
      row: rowNum,
    };
    // Более поздняя строка с тем же номером контракта побеждает (последняя
    // в таблице считается актуальной) — как и в остальной системе.
    const existingIdx = contracts.findIndex((c) => c.contractNum === contractNum);
    if (existingIdx >= 0) contracts[existingIdx] = contract;
    else contracts.push(contract);

    for (const inv of extractInvoiceRows(row, contractNum, rowNum)) {
      invoiceRows.push(inv);
      invoicesByPeriod.set(inv.periodStart, (invoicesByPeriod.get(inv.periodStart) || 0) + 1);
    }
  }

  // 5. Заблокированные: ключ по умолчанию — "BLOCK-<имя>". При коллизии имени
  // разводим по юрлицу: "BLOCK-<имя>-<юрлицо>". Если и с юрлицом коллизия не
  // разрешилась (одинаковые имя И юрлицо) — не вставляем ни одну версию,
  // только в отчёт (правило общее, не только для конкретной пары).
  const byNameKey = new Map(); // nameKey -> [candidate, ...]
  for (const cand of blockedCandidates) {
    if (!byNameKey.has(cand.nameKey)) byNameKey.set(cand.nameKey, []);
    byNameKey.get(cand.nameKey).push(cand);
  }

  for (const group of byNameKey.values()) {
    if (group.length === 1) {
      group[0].contractNum = `BLOCK-${group[0].nameKey}`;
      continue;
    }
    // коллизия имени — разводим по юрлицу
    const byLegalKey = new Map();
    for (const cand of group) {
      const legalKey = normalizeClientNameForKey(cand.legalEntity || "");
      cand.contractNum = `BLOCK-${cand.nameKey}-${legalKey}`;
      if (!byLegalKey.has(cand.contractNum)) byLegalKey.set(cand.contractNum, []);
      byLegalKey.get(cand.contractNum).push(cand);
    }
    for (const [finalKey, sub] of byLegalKey.entries()) {
      if (sub.length > 1) {
        issues.duplicateBlockedNames.push({ contractNum: finalKey, rows: sub.map((c) => c.row) });
      }
    }
  }
  const duplicateBlockedKeys = new Set(issues.duplicateBlockedNames.map((d) => d.contractNum));

  for (const cand of blockedCandidates) {
    if (duplicateBlockedKeys.has(cand.contractNum)) continue;
    const { rawRow, row: rowNum, nameKey, ...contract } = cand;
    contracts.push({ ...contract, row: rowNum });
    for (const inv of extractInvoiceRows(rawRow, cand.contractNum, rowNum)) {
      invoiceRows.push(inv);
      invoicesByPeriod.set(inv.periodStart, (invoicesByPeriod.get(inv.periodStart) || 0) + 1);
    }
  }

  // period создаём только если по нему есть хотя бы один счёт
  const periods = [...invoicesByPeriod.keys()].sort();

  // Тариф на контракт (одна запись — effective_from = самый ранний период
  // этого контракта, чтобы тариф покрывал всю его историю). Если "АП" пуст
  // или не число — контракт в tariffs не попадает, только в отчёт.
  const earliestPeriodByContract = new Map();
  for (const inv of invoiceRows) {
    const cur = earliestPeriodByContract.get(inv.contractNum);
    if (!cur || inv.periodStart < cur) earliestPeriodByContract.set(inv.contractNum, inv.periodStart);
  }
  const tariffs = [];
  for (const c of contracts) {
    if (c.tariff === null || c.tariff === undefined) {
      issues.contractsWithoutTariff.push({ contractNum: c.contractNum, clientName: c.clientName, row: c.row });
      continue;
    }
    const effectiveFrom = earliestPeriodByContract.get(c.contractNum);
    if (!effectiveFrom) continue; // теоретически невозможно (у контракта всегда есть ≥1 invoice), на всякий случай
    tariffs.push({ contractNum: c.contractNum, tariff: c.tariff, effectiveFrom });
  }

  return { contracts, periods, invoiceRows, tariffs, issues };
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
