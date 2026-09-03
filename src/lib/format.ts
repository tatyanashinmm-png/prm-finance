// Форматирование чисел/дат для витрины — переиспользуется всеми вкладками.

const MONTHS_RU_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_RU_FULL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

/** "2026-08-01" -> "авг 26" */
export function formatMonthShort(periodStart: string): string {
  const [year, month] = periodStart.split('-')
  const idx = Number(month) - 1
  const label = MONTHS_RU_SHORT[idx] ?? month
  return `${label} ${year.slice(2)}`
}

/** "2026-08-01" -> "Август 2026" (для заголовка панели «почему MRR изменился») */
export function formatMonthFull(periodStart: string): string {
  const [year, month] = periodStart.split('-')
  const idx = Number(month) - 1
  const label = MONTHS_RU_FULL[idx] ?? month
  return `${label} ${year}`
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

/** Компактная запись для подписей на графике: 1936140 -> "1,94 млн", 373219 -> "373 тыс" */
export function formatCompactRub(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value / 1_000_000)} млн`
  }
  if (abs >= 1_000) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value / 1_000)} тыс`
  }
  return formatRub(value)
}

/** 12.345 -> "+12,3%", -4 -> "-4%" */
export function formatPercent(value: number): string {
  const formatted = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(Math.abs(value))
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${formatted}%`
}

/** 91234 -> "+91 234 ₽", -60000 -> "-60 000 ₽" (движение MRR: New/Churn/чистое) */
export function formatSignedRub(value: number): string {
  return value > 0 ? `+${formatRub(value)}` : formatRub(value)
}
