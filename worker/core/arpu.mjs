// Чистое ядро расчёта ARPU — без базы, без Cloudflare. Повторяет логику
// формулы таблицы =AVERAGEIF(<Оплачен_периода>;"Да";$H:$H): среди контрактов,
// у которых в этом периоде paid_status="Да", берём тариф, ДЕЙСТВОВАВШИЙ на
// дату периода, и считаем среднее. Контракты без тарифа в среднее не входят.
//
// На входе:
//   invoices — [{contractNum, periodStart, paidStatus}, ...]
//   tariffs  — [{contractNum, tariff, effectiveFrom}, ...] (может быть
//              несколько записей на контракт — берём последнюю действующую
//              на дату периода, effectiveFrom <= periodStart)

/**
 * @typedef {Object} TariffRow
 * @property {string} contractNum
 * @property {number} tariff
 * @property {string} effectiveFrom - "YYYY-MM-01"
 */

function buildTariffIndex(tariffs) {
  const byContract = new Map();
  for (const t of tariffs) {
    if (!byContract.has(t.contractNum)) byContract.set(t.contractNum, []);
    byContract.get(t.contractNum).push(t);
  }
  for (const list of byContract.values()) {
    list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
  return byContract;
}

/**
 * Тариф контракта, действовавший на дату periodStart (последняя запись с
 * effectiveFrom <= periodStart), либо null если тарифа на эту дату нет.
 */
function tariffAt(tariffIndex, contractNum, periodStart) {
  const list = tariffIndex.get(contractNum);
  if (!list) return null;
  let result = null;
  for (const t of list) {
    if (t.effectiveFrom <= periodStart) result = t.tariff;
    else break;
  }
  return result;
}

/**
 * ARPU за один период: среднее тарифов среди контрактов с paidStatus="Да"
 * в этом периоде. Возвращает null, если нет ни одного оплаченного контракта
 * с известным тарифом (пустое среднее не считаем нулём).
 * @param {{contractNum: string, periodStart: string, paidStatus: string|null}[]} invoices
 * @param {TariffRow[]} tariffs
 * @param {string} periodStart
 */
export function computeArpuForPeriod(invoices, tariffs, periodStart) {
  const tariffIndex = buildTariffIndex(tariffs);
  let sum = 0;
  let count = 0;
  for (const inv of invoices) {
    if (inv.periodStart !== periodStart || inv.paidStatus !== "Да") continue;
    const tariff = tariffAt(tariffIndex, inv.contractNum, periodStart);
    if (tariff === null || tariff === undefined) continue; // пустой тариф не включаем
    sum += tariff;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

/**
 * ARPU сразу по всем периодам, встречающимся в invoices.
 * @returns {Map<string, number|null>}
 */
export function computeMonthlyArpu(invoices, tariffs) {
  const periods = new Set(invoices.map((inv) => inv.periodStart));
  const result = new Map();
  for (const periodStart of periods) {
    result.set(periodStart, computeArpuForPeriod(invoices, tariffs, periodStart));
  }
  return result;
}
