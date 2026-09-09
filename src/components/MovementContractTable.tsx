import { formatRub } from '../lib/format'
import { groupContractsByManager, hasReason, type MovementContract } from '../lib/movement'
import { CollapsibleGroup } from './CollapsibleGroup'
import { StatusBadge } from './StatusBadge'

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

/** Шаг D.4e: строка Оттока карточкой вместо строки таблицы — у Отточной таблицы
 * 6 колонок (в т.ч. свободный текст «Причина оттока»), в 660px-панели это не
 * помещается без горизонтального скролла. Карточка: сверху клиент + тариф,
 * строкой ниже — менеджер (только вне группировки)/период/статус, снизу —
 * причина оттока полным текстом с переносом (переиспользует .reason из D.4c/D.4d). */
function ContractCard({
  contract,
  sign,
  periodColumnLabel,
  periodValue,
  showReason,
  showStatus,
  showManager,
}: {
  contract: MovementContract
  sign: 'pos' | 'neg'
  periodColumnLabel: string
  periodValue: string
  showReason?: boolean
  showStatus?: boolean
  showManager: boolean
}) {
  return (
    <div className="drill-card">
      <div className="drill-card__top">
        <div className="drill-card__client">
          <span className="contract-num">{contract.contract_num}</span>
          {contract.client_name}
        </div>
        <span className={`movement-list__amount movement-list__amount--${sign}`}>{tariffCell(contract.tariff, sign)}</span>
      </div>
      <div className="drill-card__meta">
        {showManager && <span>{contract.manager}</span>}
        <span>
          {periodColumnLabel}: {periodValue}
        </span>
        {showStatus && <StatusBadge status={contract.status} />}
      </div>
      {showReason &&
        (hasReason(contract.reason) ? (
          <span className="reason ok">{contract.reason}</span>
        ) : (
          <span className="reason missing">причина не указана</span>
        ))}
    </div>
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
  /** Колонка «Статус» (Блок/Активен) — только в детализации Оттока. */
  showStatus?: boolean
  /** Текст пустого состояния — по умолчанию «Нет контрактов за этот месяц»; для текущего
   * незакрытого месяца вызывающий код передаёт «Пока нет…», чтобы не выглядело как ошибка. */
  emptyMessage?: string
  /** Шаг D.4e: строки карточками вместо таблицы — для Оттока (6 колонок, в т.ч.
   * свободный текст причины, не помещается в 660px-панели без гор. скролла). */
  cardLayout?: boolean
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
  showStatus,
  emptyMessage,
  cardLayout,
}: MovementContractTableProps) {
  if (contracts.length === 0) {
    return <p className="state-msg">{emptyMessage ?? 'Нет контрактов за этот месяц'}</p>
  }

  return (
    <>
      {grouped ? (
        <div className="movement-groups">
          {groupContractsByManager(contracts, managers).map((g) => (
            <CollapsibleGroup
              key={g.manager}
              header={
                <>
                  <span className="chart-legend__swatch" style={{ background: colorMap.get(g.manager) }} />
                  <span className="movement-group__manager">{g.manager}</span>
                  <span className="movement-group__subtotal">
                    {g.count} · {tariffCell(g.sum, sign)}
                  </span>
                </>
              }
            >
              {cardLayout ? (
                <div className="drill-cards">
                  {g.contracts.map((c) => (
                    <ContractCard
                      key={c.contract_num}
                      contract={c}
                      sign={sign}
                      periodColumnLabel={periodColumnLabel}
                      periodValue={periodValue}
                      showReason={showReason}
                      showStatus={showStatus}
                      showManager={false}
                    />
                  ))}
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="drill-table">
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th>{periodColumnLabel}</th>
                        {showStatus && <th>Статус</th>}
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
                          {showStatus && <td><StatusBadge status={c.status} /></td>}
                          {showReason && <ReasonCell reason={c.reason} />}
                          <td className={`movement-list__amount movement-list__amount--${sign}`}>{tariffCell(c.tariff, sign)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsibleGroup>
          ))}
        </div>
      ) : cardLayout ? (
        <div className="drill-cards">
          {contracts.map((c) => (
            <ContractCard
              key={c.contract_num}
              contract={c}
              sign={sign}
              periodColumnLabel={periodColumnLabel}
              periodValue={periodValue}
              showReason={showReason}
              showStatus={showStatus}
              showManager
            />
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
                {showStatus && <th>Статус</th>}
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
                  {showStatus && <td><StatusBadge status={c.status} /></td>}
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
