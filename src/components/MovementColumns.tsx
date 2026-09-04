import { formatRub, formatSignedRub } from '../lib/format'
import { groupContractsByManager, hasReason, type MovementContract, type MovementMonth } from '../lib/movement'

function ContractRow({ contract, sign, showReason }: { contract: MovementContract; sign: 'pos' | 'neg'; showReason?: boolean }) {
  return (
    <li className="movement-list__item">
      <div className="movement-list__main">
        <div className="movement-list__client">
          <span className="contract-num">{contract.contract_num}</span>
          {contract.client_name}
        </div>
        {showReason &&
          (hasReason(contract.reason) ? (
            <div className="movement-list__reason" title={contract.reason ?? undefined}>
              {contract.reason}
            </div>
          ) : (
            <div className="movement-list__reason movement-list__reason--missing">⚠ причина не указана</div>
          ))}
      </div>
      <span className={`movement-list__amount movement-list__amount--${sign}`}>
        {contract.tariff === null ? '—' : sign === 'pos' ? `+${formatRub(contract.tariff)}` : `−${formatRub(contract.tariff)}`}
      </span>
    </li>
  )
}

function ColumnContent({
  contracts,
  sign,
  grouped,
  managers,
  colorMap,
  showReason,
}: {
  contracts: MovementContract[]
  sign: 'pos' | 'neg'
  grouped: boolean
  managers: string[]
  colorMap: Map<string, string>
  showReason?: boolean
}) {
  if (contracts.length === 0) return <p className="state-msg">Нет</p>

  if (!grouped) {
    return (
      <ul className="movement-list">
        {contracts.map((c) => (
          <ContractRow key={c.contract_num} contract={c} sign={sign} showReason={showReason} />
        ))}
      </ul>
    )
  }

  const groups = groupContractsByManager(contracts, managers)
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
              <ContractRow key={c.contract_num} contract={c} sign={sign} showReason={showReason} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface MovementColumnsProps {
  movement: MovementMonth
  grouped: boolean
  managers: string[]
  colorMap: Map<string, string>
  /** Причина оттока в секции «Отток (−)» — только для drill-through («Чистый приток»/«Чистое движение MRR»), не для панели «почему». */
  showReason?: boolean
}

/** Тело «две колонки (Пришли +/Отток −) + строка итога» — без переключателя
 * и без карточки-обёртки, чтобы переиспользоваться и панелью «почему», и
 * drill-through по карточкам «Чистый приток»/«Чистое движение MRR». */
export function MovementColumns({ movement, grouped, managers, colorMap, showReason }: MovementColumnsProps) {
  return (
    <>
      <div className="movement-panel__columns">
        <div className="movement-col movement-col--new">
          <div className="movement-col__title">Пришли / возобновили (+)</div>
          <ColumnContent contracts={movement.new_contracts} sign="pos" grouped={grouped} managers={managers} colorMap={colorMap} />
        </div>
        <div className="movement-col movement-col--churn">
          <div className="movement-col__title">Отток (−)</div>
          <ColumnContent
            contracts={movement.churn_contracts}
            sign="neg"
            grouped={grouped}
            managers={managers}
            colorMap={colorMap}
            showReason={showReason}
          />
        </div>
      </div>
      <div className="movement-panel__summary">
        New {formatSignedRub(movement.new_mrr)} · Churn {formatRub(movement.churn_mrr)} · чистое{' '}
        {formatSignedRub(movement.net_mrr)}
      </div>
    </>
  )
}
