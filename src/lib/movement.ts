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

/** Последний ЗАКРЫТЫЙ месяц (строго до текущего календарного), для которого есть движение. */
export function getLastClosedMovement(months: MovementMonth[]): MovementMonth | null {
  const closed = months.filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
  return closed.length > 0 ? closed[closed.length - 1] : null
}
