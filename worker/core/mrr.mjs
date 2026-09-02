// Чистое ядро базовых метрик MRR — без базы данных, без Cloudflare.
// На входе — обычный массив invoices (contractNum, periodStart,
// invoiceAmount, paidStatus), на выходе — числа. Можно вызывать и из
// Worker'а (worker/db/index.ts достаёт invoices, эта функция их считает),
// и из обычного Node-скрипта (golden-тесты сверяют с таблицей).
//
// ВАЖНО: метрики НЕ фильтруются по текущему статусу контракта (активен/блок).
// Заблокированный контракт всё равно попадает в MRR тех прошлых месяцев,
// когда по нему стоит paid_status="Да" — статус влияет только на то, платит
// ли клиент СЕЙЧАС, а не на то, что он платил раньше.

/**
 * @typedef {Object} InvoiceRow
 * @property {string} periodStart - "YYYY-MM-01"
 * @property {number} invoiceAmount
 * @property {string|null} paidStatus
 */

/**
 * Метрики одного периода по уже отфильтрованному под этот период списку invoices.
 * @param {InvoiceRow[]} invoicesForPeriod
 */
function reduceMetrics(invoicesForPeriod) {
  let mrr = 0;
  let issuedCount = 0;
  let paidCount = 0;
  let issuedAmount = 0;
  for (const inv of invoicesForPeriod) {
    issuedCount += 1;
    issuedAmount += inv.invoiceAmount;
    if (inv.paidStatus === "Да") {
      mrr += inv.invoiceAmount;
      paidCount += 1;
    }
  }
  return { mrr, issuedCount, paidCount, issuedAmount };
}

/**
 * Метрики по КОНКРЕТНОМУ периоду (например, для одного месяца на дашборде).
 * @param {InvoiceRow[]} invoices - весь список, любых периодов
 * @param {string} periodStart - "YYYY-MM-01"
 */
export function computeMetricsForPeriod(invoices, periodStart) {
  const filtered = invoices.filter((inv) => inv.periodStart === periodStart);
  return { periodStart, ...reduceMetrics(filtered) };
}

/**
 * Метрики СРАЗУ по всем периодам, встречающимся в invoices (один проход).
 * @param {InvoiceRow[]} invoices
 * @returns {Map<string, {periodStart: string, mrr: number, issuedCount: number, paidCount: number, issuedAmount: number}>}
 */
export function computeMonthlyMetrics(invoices) {
  const byPeriod = new Map();
  for (const inv of invoices) {
    if (!byPeriod.has(inv.periodStart)) byPeriod.set(inv.periodStart, []);
    byPeriod.get(inv.periodStart).push(inv);
  }
  const result = new Map();
  for (const [periodStart, rows] of byPeriod.entries()) {
    result.set(periodStart, { periodStart, ...reduceMetrics(rows) });
  }
  return result;
}
