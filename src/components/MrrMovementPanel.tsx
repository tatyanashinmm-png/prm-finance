import { useState } from 'react'
import { formatMonthFull, formatRub, formatSignedRub } from '../lib/format'
import type { MovementContract, MovementMonth } from '../lib/movement'

function ContractRow({ contract, sign }: { contract: MovementContract; sign: 'pos' | 'neg' }) {
  return (
    <li className="movement-list__item">
      <div className="movement-list__main">
        <span className="contract-num">{contract.contract_num}</span>
        {contract.client_name}
      </div>
      <span className={`movement-list__amount movement-list__amount--${sign}`}>
        {contract.tariff === null ? '—' : sign === 'pos' ? `+${formatRub(contract.tariff)}` : `−${formatRub(contract.tariff)}`}
      </span>
    </li>
  )
}

interface ManagerGroup {
  manager: string
  contracts: MovementContract[]
  count: number
  sum: number
}

/** Группы в том же порядке, что и остальная витрина (managers/colorMap) —
 * менеджеры, отсутствующие в этом списке (не должно случаться, но на
 * всякий случай), уходят в конец по алфавиту. */
function groupByManager(contracts: MovementContract[], managerOrder: string[]): ManagerGroup[] {
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

function ColumnContent({
  contracts,
  sign,
  grouped,
  managers,
  colorMap,
}: {
  contracts: MovementContract[]
  sign: 'pos' | 'neg'
  grouped: boolean
  managers: string[]
  colorMap: Map<string, string>
}) {
  if (contracts.length === 0) return <p className="state-msg">Нет</p>

  if (!grouped) {
    return (
      <ul className="movement-list">
        {contracts.map((c) => (
          <ContractRow key={c.contract_num} contract={c} sign={sign} />
        ))}
      </ul>
    )
  }

  const groups = groupByManager(contracts, managers)
  return (
    <div className="movement-groups">
      {groups.map((g) => (
        <div key={g.manager} className="movement-group">
          <div className="movement-group__header">
            <span className="chart-legend__swatch" style={{ background: colorMap.get(g.manager) }} />
            <span className="movement-group__manager">{g.manager}</span>
            <span className="movement-group__subtotal">
              {g.count} · {sign === 'pos' ? `+${formatRub(g.sum)}` : `−${formatRub(g.sum)}`}
            </span>
          </div>
          <ul className="movement-list">
            {g.contracts.map((c) => (
              <ContractRow key={c.contract_num} contract={c} sign={sign} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface MrrMovementPanelProps {
  movement: MovementMonth | null
  isCurrent: boolean
  /** Переключатель «Список / По менеджерам» имеет смысл только при «Все менеджеры». */
  showGroupToggle: boolean
  managers: string[]
  colorMap: Map<string, string>
}

export function MrrMovementPanel({ movement, isCurrent, showGroupToggle, managers, colorMap }: MrrMovementPanelProps) {
  const [grouped, setGrouped] = useState(false)

  if (!movement) {
    return (
      <div className="card">
        <div className="card__title">Почему MRR изменился</div>
        <p className="state-msg">Нет данных о движении за опорный месяц</p>
      </div>
    )
  }

  const direction = movement.net_mrr >= 0 ? 'вырос' : 'упал'
  const effectiveGrouped = showGroupToggle && grouped

  return (
    <div className="card">
      <div className="movement-panel__header">
        <div className="movement-panel__title">
          {formatMonthFull(movement.period_start)} · MRR {direction} на {formatRub(Math.abs(movement.net_mrr))}
        </div>
        <div className="movement-panel__header-controls">
          {showGroupToggle && (
            <div className="period-filter">
              <button
                type="button"
                className={`period-filter__btn${!grouped ? ' period-filter__btn--active' : ''}`}
                onClick={() => setGrouped(false)}
              >
                Список
              </button>
              <button
                type="button"
                className={`period-filter__btn${grouped ? ' period-filter__btn--active' : ''}`}
                onClick={() => setGrouped(true)}
              >
                По менеджерам
              </button>
            </div>
          )}
          {isCurrent && <span className="movement-panel__badge">в процессе</span>}
        </div>
      </div>

      {isCurrent ? (
        <p className="state-msg">Месяц ещё не закрыт — разбивка по контрактам появится после его завершения.</p>
      ) : (
        <>
          <div className="movement-panel__columns">
            <div className="movement-col movement-col--new">
              <div className="movement-col__title">Пришли / возобновили (+)</div>
              <ColumnContent
                contracts={movement.new_contracts}
                sign="pos"
                grouped={effectiveGrouped}
                managers={managers}
                colorMap={colorMap}
              />
            </div>
            <div className="movement-col movement-col--churn">
              <div className="movement-col__title">Отток (−)</div>
              <ColumnContent
                contracts={movement.churn_contracts}
                sign="neg"
                grouped={effectiveGrouped}
                managers={managers}
                colorMap={colorMap}
              />
            </div>
          </div>
          <div className="movement-panel__summary">
            New {formatSignedRub(movement.new_mrr)} · Churn {formatRub(movement.churn_mrr)} · чистое{' '}
            {formatSignedRub(movement.net_mrr)}
          </div>
        </>
      )}
    </div>
  )
}
