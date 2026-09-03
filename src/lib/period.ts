// Пресеты и произвольный диапазон фильтра периода на экране «Обзор» —
// фильтрация чисто клиентская, эндпоинт /api/metrics/monthly всегда отдаёт
// полный ряд месяцев. Будущие (ещё не наступившие) месяцы на графике не
// показываем никогда — ни в одном из пресетов, ни в произвольном диапазоне.
import { currentMonthStart, isFutureMonth } from './metrics'

// Обобщено под любой ряд с полем period_start (не только MonthlyMetric) —
// той же фильтрацией пользуется и разбивка MRR по менеджерам.
interface Dated {
  period_start: string
}

export type PeriodPreset = 'last12' | 'last6' | 'ytd' | 'all'

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'last12', label: 'Последние 12 мес' },
  { id: 'last6', label: 'Последние 6 мес' },
  { id: 'ytd', label: 'С начала года' },
  { id: 'all', label: 'Весь период' },
]

export type PeriodSelection = { kind: 'preset'; preset: PeriodPreset } | { kind: 'custom'; start: string; end: string }

/** "YYYY-MM-01" со сдвигом на delta месяцев (может быть отрицательным). */
export function shiftMonth(periodStart: string, delta: number): string {
  const [year, month] = periodStart.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Диапазон по умолчанию при переключении на «Свой период» — те же 12 мес, что и в пресете. */
export function defaultCustomRange(): { start: string; end: string } {
  const current = currentMonthStart()
  return { start: shiftMonth(current, -11), end: current }
}

export function filterByPreset<T extends Dated>(months: T[], preset: PeriodPreset): T[] {
  const withoutFuture = months.filter((m) => !isFutureMonth(m.period_start))
  if (preset === 'all') return withoutFuture

  const current = currentMonthStart()

  if (preset === 'ytd') {
    const yearStart = `${current.slice(0, 4)}-01-01`
    return withoutFuture.filter((m) => m.period_start >= yearStart)
  }

  const monthsBack = preset === 'last12' ? 11 : 5
  const rangeStart = shiftMonth(current, -monthsBack)
  return withoutFuture.filter((m) => m.period_start >= rangeStart)
}

export function filterByCustomRange<T extends Dated>(months: T[], start: string, end: string): T[] {
  const withoutFuture = months.filter((m) => !isFutureMonth(m.period_start))
  const [from, to] = start <= end ? [start, end] : [end, start]
  return withoutFuture.filter((m) => m.period_start >= from && m.period_start <= to)
}

export function filterMonths<T extends Dated>(months: T[], selection: PeriodSelection): T[] {
  return selection.kind === 'custom'
    ? filterByCustomRange(months, selection.start, selection.end)
    : filterByPreset(months, selection.preset)
}
