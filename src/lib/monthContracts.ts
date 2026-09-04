// Форма ответа GET /api/metrics/month-contracts?month=YYYY-MM-01 — контракты,
// из которых складывается MRR/ARPU одного месяца (drill-through по этим карточкам).

export interface MonthContract {
  contract_num: string
  client_name: string
  manager: string
  status: string | null
  invoice_amount: number
  tariff: number | null
}

/** Есть ли у контракта тариф — используется и для бейджа «тариф не задан», и для фильтрации среднего ARPU. */
export function hasTariff(tariff: number | null | undefined): boolean {
  return typeof tariff === 'number'
}

export interface ManagerMrrGroup {
  manager: string
  contracts: MonthContract[]
  count: number
  sum: number
}

/** Группировка для MRR: подытог — сумма invoice_amount (не tariff, в отличие от groupContractsByManager из movement.ts). */
export function groupMrrByManager(contracts: MonthContract[], managerOrder: string[]): ManagerMrrGroup[] {
  const byManager = new Map<string, MonthContract[]>()
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
      return { manager, contracts: list, count: list.length, sum: list.reduce((s, c) => s + c.invoice_amount, 0) }
    })
}

export interface ManagerArpuGroup {
  manager: string
  /** Все контракты менеджера (в т.ч. без тарифа — для списка). */
  contracts: MonthContract[]
  count: number
  /** Среднее ТОЛЬКО по контрактам этого менеджера с непустым тарифом — независимая цифра,
   * не слагаемое общего ARPU (среднее целого ≠ среднему/сумме частей). null, если ни одного. */
  avgTariff: number | null
}

/** Группировка для ARPU: у каждого менеджера — своё среднее по его непустым тарифам. */
export function groupArpuByManager(contracts: MonthContract[], managerOrder: string[]): ManagerArpuGroup[] {
  const byManager = new Map<string, MonthContract[]>()
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
      const withTariff = list.filter((c) => hasTariff(c.tariff))
      const avgTariff = withTariff.length > 0 ? withTariff.reduce((s, c) => s + (c.tariff as number), 0) / withTariff.length : null
      return { manager, contracts: list, count: list.length, avgTariff }
    })
}
