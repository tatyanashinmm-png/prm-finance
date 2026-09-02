// Форматирование чисел/дат для витрины — переиспользуется всеми вкладками.

const MONTHS_RU_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** "2026-08-01" -> "авг 26" */
export function formatMonthShort(periodStart: string): string {
  const [year, month] = periodStart.split('-')
  const idx = Number(month) - 1
  const label = MONTHS_RU_SHORT[idx] ?? month
  return `${label} ${year.slice(2)}`
}

/** 1936140 -> "1 936 140 ₽" (или с копейками, если decimals: true и есть дробная часть) */
export function formatRub(value: number, opts?: { decimals?: boolean }): string {
  const useDecimals = Boolean(opts?.decimals) && !Number.isInteger(value)
  const formatted = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: useDecimals ? 2 : 0,
    minimumFractionDigits: useDecimals ? 2 : 0,
  }).format(value)
  return `${formatted} ₽`
}
