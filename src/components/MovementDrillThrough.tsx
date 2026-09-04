import { useState } from 'react'
import { formatMonthFull, formatMonthShort, formatRub, formatSignedRub } from '../lib/format'
import { GroupToggle } from './GroupToggle'
import { ContractSearchInput } from './ContractSearchInput'
import { MovementColumns } from './MovementColumns'
import { MovementContractTable } from './MovementContractTable'
import { shiftMonth } from '../lib/period'
import { matchesContractSearch } from '../lib/search'
import {
  filterMovementByPredicate,
  hasReason,
  isConfirmedChurn,
  splitChurnByStatus,
  sumTariff,
  type MovementMonth,
} from '../lib/movement'

export type DrillKind = 'new' | 'churn' | 'net_count' | 'net_mrr'

const DRILL_LABELS: Record<DrillKind, string> = {
  new: 'Новые',
  churn: 'Отток',
  net_count: 'Чистый приток',
  net_mrr: 'Чистое движение MRR',
}

/** Пустое состояние для текущего незакрытого месяца — не «ошибка», а «ещё рано». */
const IN_PROGRESS_EMPTY_MSG = 'Пока нет — месяц ещё не завершился'

interface MovementDrillThroughProps {
  kind: DrillKind
  movement: MovementMonth | null
  /** Опорный месяц ещё не закрыт — детализация всё равно открывается, только с пометкой и мягкими пустыми состояниями. */
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
  const [confirmedOnly, setConfirmedOnly] = useState(false)
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [search, setSearch] = useState('')
  const effectiveGrouped = showGroupToggle && grouped
  // Поиск важнее «пока не завершился» — если что-то искали и не нашли,
  // это «ничего не найдено», а не «данных ещё нет».
  const emptyMessage = search.trim() ? 'Ничего не найдено' : isCurrent ? IN_PROGRESS_EMPTY_MSG : undefined

  // Разбивка и фильтры по статусу — считаются по полному churn_contracts
  // (уже отфильтрованному по менеджеру выше, в OverviewPage), НЕЗАВИСИМО от
  // самих фильтров ниже (включая поиск) — так сводка сверху остаётся
  // «общей картиной», даже когда включён один из быстрых фильтров.
  const churnContracts = movement?.churn_contracts ?? []
  const { confirmed: confirmedContracts, unpaidActive: unpaidContracts } = splitChurnByStatus(churnContracts)
  const missingReasonCount = churnContracts.filter((c) => !hasReason(c.reason)).length

  const searchedNewContracts = (movement?.new_contracts ?? []).filter((c) => matchesContractSearch(c, search))
  const newSum = sumTariff(searchedNewContracts)

  const statusFilterActive = confirmedOnly || unpaidOnly
  const displayedChurnContracts = churnContracts
    .filter((c) => !statusFilterActive || (confirmedOnly && isConfirmedChurn(c)) || (unpaidOnly && !isConfirmedChurn(c)))
    .filter((c) => !noReasonOnly || !hasReason(c.reason))
    .filter((c) => matchesContractSearch(c, search))
  const displayedChurnSum = sumTariff(displayedChurnContracts)

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
              <ContractSearchInput value={search} onChange={setSearch} />
              {kind === 'churn' && churnContracts.length > 0 && (
                <>
                  <label className="toggle">
                    <input type="checkbox" checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} />
                    <span>Подтверждённый (блок)</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
                    <span>Не оплатили (активны)</span>
                  </label>
                  {missingReasonCount > 0 && (
                    <label className="toggle">
                      <input type="checkbox" checked={noReasonOnly} onChange={(e) => setNoReasonOnly(e.target.checked)} />
                      <span>Только без причины</span>
                    </label>
                  )}
                </>
              )}
              {showGroupToggle && <GroupToggle grouped={grouped} onChange={setGrouped} />}
            </div>
          </div>

          {kind === 'churn' && churnContracts.length > 0 && (
            <div className="drill-status-summary">
              Подтверждённый отток (блок):{' '}
              <span className="churn-breakdown__confirmed">
                {confirmedContracts.length} шт · {formatRub(-sumTariff(confirmedContracts))}
              </span>{' '}
              · Не оплатили (активны):{' '}
              <span className="churn-breakdown__unpaid">
                {unpaidContracts.length} шт · {formatRub(-sumTariff(unpaidContracts))}
              </span>
            </div>
          )}

          {kind === 'churn' && missingReasonCount > 0 && (
            <div className="drill-warning-banner">
              ⚠ У {missingReasonCount} из {churnContracts.length} контрактов не указана причина оттока
            </div>
          )}

          <div className="card">
            {kind === 'new' && (
              <MovementContractTable
                contracts={searchedNewContracts}
                sign="pos"
                periodColumnLabel="Первый оплаченный"
                periodValue={formatMonthShort(movement.period_start)}
                grouped={effectiveGrouped}
                managers={managers}
                colorMap={colorMap}
                totalCount={searchedNewContracts.length}
                totalSumLabel={formatSignedRub(newSum)}
                emptyMessage={emptyMessage}
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
                showStatus
                totalCount={displayedChurnContracts.length}
                totalSumLabel={formatRub(-displayedChurnSum)}
                emptyMessage={emptyMessage}
              />
            )}
            {(kind === 'net_count' || kind === 'net_mrr') && (
              <MovementColumns
                movement={filterMovementByPredicate(movement, (c) => matchesContractSearch(c, search))}
                grouped={effectiveGrouped}
                managers={managers}
                colorMap={colorMap}
                showReason
                emptyMessage={emptyMessage}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
