import { useState } from 'react'
import { formatMonthFull, formatMonthShort, formatRub, formatSignedRub } from '../lib/format'
import { GroupToggle } from './GroupToggle'
import { MovementColumns } from './MovementColumns'
import { MovementContractTable } from './MovementContractTable'
import { shiftMonth } from '../lib/period'
import { hasReason, type MovementMonth } from '../lib/movement'

export type DrillKind = 'new' | 'churn' | 'net_count' | 'net_mrr'

const DRILL_LABELS: Record<DrillKind, string> = {
  new: 'Новые',
  churn: 'Отток',
  net_count: 'Чистый приток',
  net_mrr: 'Чистое движение MRR',
}

interface MovementDrillThroughProps {
  kind: DrillKind
  movement: MovementMonth | null
  /** Опорный месяц ещё не закрыт — вместо таблиц показываем заглушку (как в панели «почему»). */
  isCurrent: boolean
  /** «Список/По менеджерам» имеет смысл только при «Все менеджеры». */
  showGroupToggle: boolean
  managers: string[]
  colorMap: Map<string, string>
  onBack: () => void
}

export function MovementDrillThrough({
  kind,
  movement,
  isCurrent,
  showGroupToggle,
  managers,
  colorMap,
  onBack,
}: MovementDrillThroughProps) {
  const [grouped, setGrouped] = useState(false)
  const [noReasonOnly, setNoReasonOnly] = useState(false)
  const effectiveGrouped = showGroupToggle && grouped

  // Сколько контрактов оттока без причины — для баннера и для фильтра
  // «Только без причины». Считаем по полному churn_contracts (без учёта
  // самого фильтра «без причины»), но с учётом уже применённого фильтра
  // «Менеджер» (movement сюда приходит уже отфильтрованным им из OverviewPage).
  const churnContracts = movement?.churn_contracts ?? []
  const missingReasonCount = churnContracts.filter((c) => !hasReason(c.reason)).length
  const displayedChurnContracts = noReasonOnly ? churnContracts.filter((c) => !hasReason(c.reason)) : churnContracts
  const displayedChurnSum = displayedChurnContracts.reduce((sum, c) => sum + (c.tariff ?? 0), 0)

  return (
    <div className="page">
      <button type="button" className="drill-back" onClick={onBack}>
        ← Назад к обзору
      </button>

      {!movement ? (
        <div className="card">
          <p className="state-msg">Нет данных за опорный месяц</p>
        </div>
      ) : (
        <>
          <div className="drill-header">
            <h1 className="page__title">
              {DRILL_LABELS[kind]} · {formatMonthFull(movement.period_start)}
              {isCurrent && <span className="movement-panel__badge">в процессе</span>}
            </h1>
            <div className="movement-panel__header-controls">
              {kind === 'churn' && !isCurrent && missingReasonCount > 0 && (
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={noReasonOnly}
                    onChange={(e) => setNoReasonOnly(e.target.checked)}
                  />
                  <span>Только без причины</span>
                </label>
              )}
              {showGroupToggle && !isCurrent && <GroupToggle grouped={grouped} onChange={setGrouped} />}
            </div>
          </div>

          {kind === 'churn' && !isCurrent && missingReasonCount > 0 && (
            <div className="drill-warning-banner">
              ⚠ У {missingReasonCount} из {churnContracts.length} контрактов не указана причина оттока
            </div>
          )}

          <div className="card">
            {isCurrent ? (
              <p className="state-msg">Месяц ещё не закрыт — детализация появится после его завершения.</p>
            ) : (
              <>
                {kind === 'new' && (
                  <MovementContractTable
                    contracts={movement.new_contracts}
                    sign="pos"
                    periodColumnLabel="Первый оплаченный"
                    periodValue={formatMonthShort(movement.period_start)}
                    grouped={effectiveGrouped}
                    managers={managers}
                    colorMap={colorMap}
                    totalCount={movement.new_count}
                    totalSumLabel={formatSignedRub(movement.new_mrr)}
                  />
                )}
                {kind === 'churn' && (
                  <MovementContractTable
                    contracts={displayedChurnContracts}
                    sign="neg"
                    periodColumnLabel="Последний оплаченный"
                    periodValue={formatMonthShort(shiftMonth(movement.period_start, -1))}
                    grouped={effectiveGrouped}
                    managers={managers}
                    colorMap={colorMap}
                    showReason
                    totalCount={displayedChurnContracts.length}
                    totalSumLabel={formatRub(-displayedChurnSum)}
                  />
                )}
                {(kind === 'net_count' || kind === 'net_mrr') && (
                  <MovementColumns movement={movement} grouped={effectiveGrouped} managers={managers} colorMap={colorMap} showReason />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
