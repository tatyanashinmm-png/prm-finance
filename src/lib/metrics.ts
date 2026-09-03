// Работа с ответом GET /api/metrics/monthly на клиенте: определение текущего
// календарного месяца, дельты к предыдущему месяцу, KPI за последний закрытый
// месяц. Эндпоинт отдаёт данные как есть — вся эта логика чисто клиентская.
// Общая для MRR и ARPU: обе метрики — просто разные числовые поля одного и
// того же месяца, поэтому дельты/KPI считаются одной параметризуемой функцией
// (getValue), без дублирования под каждую метрику отдельно.

export interface MonthlyMetric {
  period_start: string
  issued_amount: number
  issued_count: number
  paid_count: number
  mrr: number
  arpu: number | null
}

/** Первое число текущего календарного месяца, "YYYY-MM-01" (локальная дата). */
export function currentMonthStart(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}-01`
}

export function isCurrentMonth(periodStart: string): boolean {
  return periodStart === currentMonthStart()
}

export function isFutureMonth(periodStart: string): boolean {
  return periodStart > currentMonthStart()
}

export interface MonthDelta {
  periodStart: string
  deltaPct: number | null
}

function computeDeltasBy(
  months: MonthlyMetric[],
  getValue: (m: MonthlyMetric) => number | null,
): Map<string, number | null> {
  const result = new Map<string, number | null>()
  for (let i = 0; i < months.length; i++) {
    const prev = months[i - 1]
    const curr = months[i]
    const prevVal = prev ? getValue(prev) : null
    const currVal = getValue(curr)
    if (prevVal === null || prevVal === 0 || currVal === null) {
      result.set(curr.period_start, null)
      continue
    }
    result.set(curr.period_start, ((currVal - prevVal) / prevVal) * 100)
  }
  return result
}

/**
 * Дельта MRR к предыдущему месяцу (в %) для каждого месяца — считается по
 * полному ряду (months должен быть отсортирован по возрастанию и НЕ обрезан
 * фильтром периода), чтобы первый месяц отображаемого диапазона тоже получил
 * корректную дельту от месяца, который в диапазон не попал.
 */
export function computeDeltas(months: MonthlyMetric[]): Map<string, number | null> {
  return computeDeltasBy(months, (m) => m.mrr)
}

/** То же самое, но для ARPU (используется полоской изменений, если понадобится). */
export function computeArpuDeltas(months: MonthlyMetric[]): Map<string, number | null> {
  return computeDeltasBy(months, (m) => m.arpu)
}

export interface MetricKpi {
  periodStart: string
  value: number
  deltaPct: number | null
}

/**
 * Значение метрики за последний ЗАКРЫТЫЙ месяц (строго до текущего
 * календарного), у которого эта метрика вообще известна — пропускает месяцы
 * с null (например ARPU без ни одного оплаченного контракта с тарифом), + дельта.
 */
function getLastClosedKpiBy(
  months: MonthlyMetric[],
  getValue: (m: MonthlyMetric) => number | null,
): MetricKpi | null {
  const closed = months.filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
  const deltas = computeDeltasBy(months, getValue)
  for (let i = closed.length - 1; i >= 0; i--) {
    const value = getValue(closed[i])
    if (value === null) continue
    return { periodStart: closed[i].period_start, value, deltaPct: deltas.get(closed[i].period_start) ?? null }
  }
  return null
}

export function getLastClosedMrrKpi(months: MonthlyMetric[]): MetricKpi | null {
  return getLastClosedKpiBy(months, (m) => m.mrr)
}

export function getLastClosedArpuKpi(months: MonthlyMetric[]): MetricKpi | null {
  return getLastClosedKpiBy(months, (m) => m.arpu)
}
