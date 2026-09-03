// Работа с ответом GET /api/metrics/monthly на клиенте: определение текущего
// календарного месяца, дельты к предыдущему месяцу, KPI за последний закрытый
// месяц. Эндпоинт отдаёт данные как есть — вся эта логика чисто клиентская.

export interface MonthlyMetric {
  period_start: string
  issued_amount: number
  issued_count: number
  paid_count: number
  mrr: number
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

/**
 * Дельта MRR к предыдущему месяцу (в %) для каждого месяца — считается по
 * полному ряду (months должен быть отсортирован по возрастанию и НЕ обрезан
 * фильтром периода), чтобы первый месяц отображаемого диапазона тоже получил
 * корректную дельту от месяца, который в диапазон не попал.
 */
export function computeDeltas(months: MonthlyMetric[]): Map<string, number | null> {
  const result = new Map<string, number | null>()
  for (let i = 0; i < months.length; i++) {
    const prev = months[i - 1]
    const curr = months[i]
    if (!prev || prev.mrr === 0) {
      result.set(curr.period_start, null)
      continue
    }
    result.set(curr.period_start, ((curr.mrr - prev.mrr) / prev.mrr) * 100)
  }
  return result
}

export interface MrrKpi {
  periodStart: string
  mrr: number
  deltaPct: number | null
}

/** MRR за последний закрытый месяц (строго до текущего календарного) + дельта. */
export function getLastClosedKpi(months: MonthlyMetric[]): MrrKpi | null {
  const closed = months.filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
  if (closed.length === 0) return null
  const last = closed[closed.length - 1]
  const deltas = computeDeltas(months)
  return { periodStart: last.period_start, mrr: last.mrr, deltaPct: deltas.get(last.period_start) ?? null }
}
