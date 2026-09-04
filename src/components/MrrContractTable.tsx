import { formatRub } from '../lib/format'
import { groupMrrByManager, type MonthContract } from '../lib/monthContracts'
import { StatusBadge } from './StatusBadge'

interface MrrContractTableProps {
  contracts: MonthContract[]
  grouped: boolean
  managers: string[]
  colorMap: Map<string, string>
  totalCount: number
  totalSum: number
  emptyMessage?: string
}

/** Клиент | Менеджер | Статус | Сумма счёта — по убыванию суммы. Итог снизу = MRR карточки (инвариант). */
export function MrrContractTable({ contracts, grouped, managers, colorMap, totalCount, totalSum, emptyMessage }: MrrContractTableProps) {
  if (contracts.length === 0) {
    return <p className="state-msg">{emptyMessage ?? 'Нет данных за этот месяц'}</p>
  }

  const sorted = [...contracts].sort((a, b) => b.invoice_amount - a.invoice_amount)

  return (
    <>
      {grouped ? (
        <div className="movement-groups">
          {groupMrrByManager(sorted, managers).map((g) => (
            <div key={g.manager} className="movement-group">
              <div className="movement-group__header">
                <span className="chart-legend__swatch" style={{ background: colorMap.get(g.manager) }} />
                <span className="movement-group__manager">{g.manager}</span>
                <span className="movement-group__subtotal">
                  {g.count} · {formatRub(g.sum)}
                </span>
              </div>
              <div className="table-scroll">
                <table className="drill-table">
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th>Статус</th>
                      <th>Сумма счёта</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.contracts.map((c) => (
                      <tr key={c.contract_num}>
                        <td>
                          <span className="contract-num">{c.contract_num}</span>
                          {c.client_name}
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="movement-list__amount movement-list__amount--pos">{formatRub(c.invoice_amount)}</td>
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
                <th>Статус</th>
                <th>Сумма счёта</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.contract_num}>
                  <td>
                    <span className="contract-num">{c.contract_num}</span>
                    {c.client_name}
                  </td>
                  <td>{c.manager}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="movement-list__amount movement-list__amount--pos">{formatRub(c.invoice_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="movement-panel__summary">
        Итого: {totalCount} шт · {formatRub(totalSum)}
      </div>
    </>
  )
}
