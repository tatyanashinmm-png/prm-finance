// Форма ответа GET /api/metrics/mrr-by-manager и общие для неё вещи (список
// менеджеров, стабильные цвета для стека/легенды). Строка "Без менеджера"
// должна ровно совпадать с NO_MANAGER_LABEL на бэкенде (worker/db/index.ts) —
// это граница контракта API, общий модуль между ними не заводили.

export interface ManagerMrrPoint {
  manager: string
  mrr: number
}

export interface ManagerMonthlyMrr {
  period_start: string
  total_mrr: number
  by_manager: ManagerMrrPoint[]
}

export const NO_MANAGER_LABEL = 'Без менеджера'

/** Список менеджеров, встречающихся в данных: по алфавиту, "Без менеджера" — последним. */
export function collectManagers(months: ManagerMonthlyMrr[]): string[] {
  const set = new Set<string>()
  for (const m of months) {
    for (const bm of m.by_manager) set.add(bm.manager)
  }
  const named = [...set].filter((m) => m !== NO_MANAGER_LABEL).sort((a, b) => a.localeCompare(b, 'ru'))
  return set.has(NO_MANAGER_LABEL) ? [...named, NO_MANAGER_LABEL] : named
}

const PALETTE = ['#0C39FF', '#A7AAFC', '#FF9900', '#212243', '#16A34A', '#FF5D5D']
const NO_MANAGER_COLOR = '#9AA0AE'

/** Стабильный цвет на менеджера: по порядку в managers (не зависит от периода/фильтра). */
export function buildManagerColorMap(managers: string[]): Map<string, string> {
  const map = new Map<string, string>()
  const named = managers.filter((m) => m !== NO_MANAGER_LABEL)
  named.forEach((manager, i) => map.set(manager, PALETTE[i % PALETTE.length]))
  if (managers.includes(NO_MANAGER_LABEL)) map.set(NO_MANAGER_LABEL, NO_MANAGER_COLOR)
  return map
}
