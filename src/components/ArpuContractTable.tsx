import { formatRub } from '../lib/format'
import { groupArpuByManager, hasTariff, type MonthContract } from '../lib/monthContracts'
import { CollapsibleGroup } from './CollapsibleGroup'

function NoTariffList({ contracts }: { contracts: MonthContract[] }) {
  if (contracts.length === 0) return null
  return (
    <ul className="arpu-no-tariff">
      {contracts.map((c) => (
        <li key={c.contract_num} className="arpu-no-tariff__item">
          <span className="movement-list__client">
            <span className="contract-num">{c.contract_num}</span>
            {c.client_name}
          </span>
          <span className="movement-panel__badge">тариф не задан</span>
        </li>
      ))}
    </ul>
  )
}

interface ArpuContractTableProps {
  contracts: MonthContract[]
  grouped: boolean
  managers: string[]
  colorMap: Map<string, string>
  emptyMessage?: string
}

/** Клиент | Менеджер | Тариф — по убыванию тарифа; контракты без тарифа — отдельным списком внизу, в среднее не входят. */
export function ArpuContractTable({ contracts, grouped, managers, colorMap, emptyMessage }: ArpuContractTableProps) {
  if (contracts.length === 0) {
    return <p className="state-msg">{emptyMessage ?? 'Нет данных за этот месяц'}</p>
  }

  const withTariff = contracts.filter((c) => hasTariff(c.tariff)).sort((a, b) => (b.tariff as number) - (a.tariff as number))
  const withoutTariff = contracts.filter((c) => !hasTariff(c.tariff))

  if (grouped) {
    return (
      <div className="movement-groups">
        {groupArpuByManager(contracts, managers).map((g) => {
          const groupWithTariff = g.contracts.filter((c) => hasTariff(c.tariff)).sort((a, b) => (b.tariff as number) - (a.tariff as number))
          const groupWithoutTariff = g.contracts.filter((c) => !hasTariff(c.tariff))
          return (
            <CollapsibleGroup
              key={g.manager}
              header={
                <>
                  <span className="chart-legend__swatch" style={{ background: colorMap.get(g.manager) }} />
                  <span className="movement-group__manager">{g.manager}</span>
                  <span className="movement-group__subtotal">
                    {g.count} шт · {g.avgTariff === null ? 'нет тарифа' : `${formatRub(g.avgTariff)} в среднем`}
                  </span>
                </>
              }
            >
              {groupWithTariff.length > 0 && (
                <div className="table-scroll">
                  <table className="drill-table">
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th>Тариф</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupWithTariff.map((c) => (
                        <tr key={c.contract_num}>
                          <td>
                            <span className="contract-num">{c.contract_num}</span>
                            {c.client_name}
                          </td>
                          <td className="movement-list__amount movement-list__amount--pos">{formatRub(c.tariff as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <NoTariffList contracts={groupWithoutTariff} />
            </CollapsibleGroup>
          )
        })}
      </div>
    )
  }

  return (
    <>
      {withTariff.length > 0 && (
        <div className="table-scroll">
          <table className="drill-table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Менеджер</th>
                <th>Тариф</th>
              </tr>
            </thead>
            <tbody>
              {withTariff.map((c) => (
                <tr key={c.contract_num}>
                  <td>
                    <span className="contract-num">{c.contract_num}</span>
                    {c.client_name}
                  </td>
                  <td>{c.manager}</td>
                  <td className="movement-list__amount movement-list__amount--pos">{formatRub(c.tariff as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {withoutTariff.length > 0 && (
        <div className="arpu-no-tariff-section">
          <div className="arpu-no-tariff-section__title">Без тарифа (не учитываются в среднем)</div>
          <NoTariffList contracts={withoutTariff} />
        </div>
      )}
    </>
  )
}
