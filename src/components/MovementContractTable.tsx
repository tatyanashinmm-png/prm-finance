import { formatRub } from '../lib/format'
import { groupContractsByManager, hasReason, type MovementContract } from '../lib/movement'

function tariffCell(tariff: number | null, sign: 'pos' | 'neg') {
  if (tariff === null) return '—'
  return sign === 'pos' ? `+${formatRub(tariff)}` : `−${formatRub(tariff)}`
}

function ReasonCell({ reason }: { reason: string | null | undefined }) {
  if (hasReason(reason)) {
    return (
      <td className="drill-table__reason">{reason}</td>
    )
  }
  return (
    <td className="drill-table__reason">
      <span className="reason-badge reason-badge--missing">⚠ причина не указана</span>
    </td>
  )
}

interface MovementContractTableProps {
  contracts: MovementContract[]
  sign: 'pos' | 'neg'
  /** «Первый оплаченный» (Новые) или «Последний оплаченный» (Отток). */
  periodColumnLabel: string
  /** Значение для этой колонки — одно и то же для всех строк (месяц самого движения). */
  periodValue: string
  grouped: boolean
  managers: string[]
  colorMap: Map<string, string>
  /** Итог — по построению равен значению карточки, с которой провалились (инвариант), либо
   * пересчитан вызывающим кодом под активный фильтр (напр. «Только без причины»). */
  totalCount: number
  totalSumLabel: string
  /** Колонка «Причина оттока» — только в детализации Оттока. */
  showReason?: boolean
}

export function MovementContractTable({
  contracts,
  sign,
  periodColumnLabel,
  periodValue,
  grouped,
  managers,
  colorMap,
  totalCount,
  totalSumLabel,
  showReason,
}: MovementContractTableProps) {
  if (contracts.length === 0) {
    return <p className="state-msg">Нет контрактов за этот месяц</p>
  }

  return (
    <>
      {grouped ? (
        <div className="movement-groups">
          {groupContractsByManager(contracts, managers).map((g) => (
            <div key={g.manager} className="movement-group">
              <div className="movement-group__header">
                <span className="chart-legend__swatch" style={{ background: colorMap.get(g.manager) }} />
                <span className="movement-group__manager">{g.manager}</span>
                <span className="movement-group__subtotal">
                  {g.count} · {tariffCell(g.sum, sign)}
                </span>
              </div>
              <div className="table-scroll">
                <table className="drill-table">
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th>{periodColumnLabel}</th>
                      {showReason && <th>Причина оттока</th>}
                      <th>Тариф</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.contracts.map((c) => (
                      <tr key={c.contract_num}>
                        <td>
                          <span className="contract-num">{c.contract_num}</span>
                          {c.client_name}
                        </td>
                        <td>{periodValue}</td>
                        {showReason && <ReasonCell reason={c.reason} />}
                        <td className={`movement-list__amount movement-list__amount--${sign}`}>{tariffCell(c.tariff, sign)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="drill-table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Менеджер</th>
                <th>{periodColumnLabel}</th>
                {showReason && <th>Причина оттока</th>}
                <th>Тариф</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.contract_num}>
                  <td>
                    <span className="contract-num">{c.contract_num}</span>
                    {c.client_name}
                  </td>
                  <td>{c.manager}</td>
                  <td>{periodValue}</td>
                  {showReason && <ReasonCell reason={c.reason} />}
                  <td className={`movement-list__amount movement-list__amount--${sign}`}>{tariffCell(c.tariff, sign)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="movement-panel__summary">
        Итого: {totalCount} шт · {totalSumLabel}
      </div>
    </>
  )
}
