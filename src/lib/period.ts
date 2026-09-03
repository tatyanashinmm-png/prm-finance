// Пресеты фильтра периода на экране «Обзор» — фильтрация чисто клиентская,
// эндпоинт /api/metrics/monthly всегда отдаёт полный ряд месяцев.
import { currentMonthStart, isFutureMonth, type MonthlyMetric } from './metrics'

export type PeriodPreset = 'last12' | 'last6' | 'ytd' | 'all'

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'last12', label: 'Последние 12 мес' },
  { id: 'last6', label: 'Последние 6 мес' },
  { id: 'ytd', label: 'С начала года' },
  { id: 'all', label: 'Весь период' },
]

/** "YYYY-MM-01" со сдвигом на delta месяцев (может быть отрицательным). */
function shiftMonth(periodStart: string, delta: number): string {
  const [year, month] = periodStart.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function filterByPreset(months: MonthlyMetric[], preset: PeriodPreset): MonthlyMetric[] {
  if (preset === 'all') return months

  const current = currentMonthStart()
  const withoutFuture = months.filter((m) => !isFutureMonth(m.period_start))

  if (preset === 'ytd') {
    const yearStart = `${current.slice(0, 4)}-01-01`
    return withoutFuture.filter((m) => m.period_start >= yearStart)
  }

  const monthsBack = preset === 'last12' ? 11 : 5
  const rangeStart = shiftMonth(current, -monthsBack)
  return withoutFuture.filter((m) => m.period_start >= rangeStart)
}
