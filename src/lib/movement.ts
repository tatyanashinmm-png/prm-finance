// Форма ответа GET /api/metrics/movement — движение MRR (New/Churn) месяц-к-месяцу.
import { isCurrentMonth, isFutureMonth } from './metrics'

export interface MovementContract {
  contract_num: string
  client_name: string
  manager: string
  tariff: number | null
}

export interface MovementMonth {
  period_start: string
  new_count: number
  churn_count: number
  net_count: number
  new_mrr: number
  churn_mrr: number
  net_mrr: number
  new_contracts: MovementContract[]
  churn_contracts: MovementContract[]
}

/** Последний ЗАКРЫТЫЙ месяц (строго до текущего календарного) среди переданных. */
export function lastClosedPeriod(months: { period_start: string }[]): string | null {
  const closed = months.filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
  return closed.length > 0 ? closed[closed.length - 1].period_start : null
}

/**
 * Пересчёт движения на срез одного менеджера: фильтруем new_contracts/
 * churn_contracts по manager на клиенте и пересчитываем штуки и суммы —
 * никакой новой формулы, просто сумма tariff отфильтрованных списков (то же
 * самое, что ядро делает для всех менеджеров сразу). Сохраняет знак
 * churn_mrr (отрицательный) — как в ответе API.
 */
export function filterMovementByManager(month: MovementMonth, manager: string): MovementMonth {
  const newContracts = month.new_contracts.filter((c) => c.manager === manager)
  const churnContracts = month.churn_contracts.filter((c) => c.manager === manager)
  const newMrr = newContracts.reduce((sum, c) => sum + (c.tariff ?? 0), 0)
  const churnMrrAbs = churnContracts.reduce((sum, c) => sum + (c.tariff ?? 0), 0)
  return {
    period_start: month.period_start,
    new_count: newContracts.length,
    churn_count: churnContracts.length,
    net_count: newContracts.length - churnContracts.length,
    new_mrr: newMrr,
    churn_mrr: -churnMrrAbs,
    net_mrr: newMrr - churnMrrAbs,
    new_contracts: newContracts,
    churn_contracts: churnContracts,
  }
}

/** Абсолютная (не %) дельта штук к предыдущему месяцу — по полному ряду. */
function computeMovementDeltasBy(months: MovementMonth[], getValue: (m: MovementMonth) => number): Map<string, number | null> {
  const result = new Map<string, number | null>()
  for (let i = 0; i < months.length; i++) {
    const prev = months[i - 1]
    const curr = months[i]
    result.set(curr.period_start, prev ? getValue(curr) - getValue(prev) : null)
  }
  return result
}

export interface MovementCountDeltas {
  newCountDelta: number | null
  churnCountDelta: number | null
  netCountDelta: number | null
}

/** Дельты штук (New/Churn/Net) для опорного месяца — считаются по полному ряду. */
export function getMovementDeltasAtPeriod(months: MovementMonth[], periodStart: string): MovementCountDeltas {
  return {
    newCountDelta: computeMovementDeltasBy(months, (m) => m.new_count).get(periodStart) ?? null,
    churnCountDelta: computeMovementDeltasBy(months, (m) => m.churn_count).get(periodStart) ?? null,
    netCountDelta: computeMovementDeltasBy(months, (m) => m.net_count).get(periodStart) ?? null,
  }
}
