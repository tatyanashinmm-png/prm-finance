// Форма ответа GET /api/metrics/movement — движение MRR (New/Churn) месяц-к-месяцу.
import { isCurrentMonth, isFutureMonth } from './metrics'

export interface MovementContract {
  contract_num: string
  client_name: string
  manager: string
  tariff: number | null
  /** Причина оттока (contracts.note) — только у контрактов в churn_contracts. */
  reason?: string | null
  /** Статус контракта (contracts.status, «Активен»/«Блок») — только у churn_contracts. */
  status?: string | null
}

/** Есть ли непустая причина оттока (используется и для бейджа, и для фильтра «Только без причины»). */
export function hasReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.trim() !== ''
}

/**
 * Подтверждённый отток = мягкий отток (уже посчитан ядром — это и есть
 * churn_contracts) И статус контракта = «Блок». Всё остальное (в т.ч. любой
 * статус кроме «Блок», сейчас в базе — только «Активен») — «не оплатили,
 * но ещё активны». Так подтверждённый+неоплативший всегда в сумме дают
 * ровно общий отток (инвариант), даже если в данных когда-нибудь появится
 * непредвиденное значение статуса.
 */
export function isConfirmedChurn(contract: MovementContract): boolean {
  return contract.status === 'Блок'
}

export interface ChurnStatusSplit {
  confirmed: MovementContract[]
  unpaidActive: MovementContract[]
}

/** Разбивка контрактов оттока на «подтверждённый (блок)» / «не оплатили (активны)». */
export function splitChurnByStatus(contracts: MovementContract[]): ChurnStatusSplit {
  const confirmed: MovementContract[] = []
  const unpaidActive: MovementContract[] = []
  for (const c of contracts) {
    ;(isConfirmedChurn(c) ? confirmed : unpaidActive).push(c)
  }
  return { confirmed, unpaidActive }
}

/** Сумма тарифов — тот же способ, что везде в этом файле (используется для итогов под фильтрами). */
export function sumTariff(contracts: MovementContract[]): number {
  return contracts.reduce((sum, c) => sum + (c.tariff ?? 0), 0)
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
 * Пересчёт движения на срез по произвольному предикату контракта: фильтруем
 * new_contracts/churn_contracts и пересчитываем штуки и суммы — никакой
 * новой формулы, просто сумма tariff отфильтрованных списков (то же самое,
 * что ядро делает для всех контрактов сразу). Сохраняет знак churn_mrr
 * (отрицательный) — как в ответе API. Общий кусок для фильтра по менеджеру
 * и для поиска по клиенту/номеру контракта.
 */
export function filterMovementByPredicate(month: MovementMonth, predicate: (c: MovementContract) => boolean): MovementMonth {
  const newContracts = month.new_contracts.filter(predicate)
  const churnContracts = month.churn_contracts.filter(predicate)
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

/** Срез движения на одного менеджера — частный случай filterMovementByPredicate. */
export function filterMovementByManager(month: MovementMonth, manager: string): MovementMonth {
  return filterMovementByPredicate(month, (c) => c.manager === manager)
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

export interface ManagerContractGroup {
  manager: string
  contracts: MovementContract[]
  count: number
  sum: number
}

/**
 * Группировка контрактов по менеджеру с подытогами (кол-во + сумма тарифов) —
 * используется и панелью «почему», и drill-through по карточкам движения.
 * Порядок — как в managerOrder (тот же, что цвета/легенда витрины); менеджеры,
 * которых там нет (не должно случаться, но на всякий случай), уходят в конец
 * по алфавиту.
 */
export function groupContractsByManager(contracts: MovementContract[], managerOrder: string[]): ManagerContractGroup[] {
  const byManager = new Map<string, MovementContract[]>()
  for (const c of contracts) {
    if (!byManager.has(c.manager)) byManager.set(c.manager, [])
    byManager.get(c.manager)!.push(c)
  }
  const extra = [...byManager.keys()].filter((m) => !managerOrder.includes(m)).sort((a, b) => a.localeCompare(b, 'ru'))
  const order = [...managerOrder, ...extra]
  return order
    .filter((m) => byManager.has(m))
    .map((manager) => {
      const list = byManager.get(manager)!
      return { manager, contracts: list, count: list.length, sum: list.reduce((s, c) => s + (c.tariff ?? 0), 0) }
    })
}
