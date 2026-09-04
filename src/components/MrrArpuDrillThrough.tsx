import { useEffect, useState } from 'react'
import { formatMonthFull, formatRub } from '../lib/format'
import { hasTariff, type MonthContract } from '../lib/monthContracts'
import { matchesContractSearch } from '../lib/search'
import { ALL_MANAGERS } from './ManagerFilter'
import { GroupToggle } from './GroupToggle'
import { ContractSearchInput } from './ContractSearchInput'
import { MrrContractTable } from './MrrContractTable'
import { ArpuContractTable } from './ArpuContractTable'

export type MetricDrillKind = 'mrr' | 'arpu'

const IN_PROGRESS_EMPTY_MSG = 'Пока нет — месяц ещё не завершился'

interface MrrArpuDrillThroughProps {
  kind: MetricDrillKind
  month: string
  isCurrent: boolean
  showGroupToggle: boolean
  managers: string[]
  colorMap: Map<string, string>
  managerFilter: string
  onBack: () => void
}

export function MrrArpuDrillThrough({
  kind,
  month,
  isCurrent,
  showGroupToggle,
  managers,
  colorMap,
  managerFilter,
  onBack,
}: MrrArpuDrillThroughProps) {
  const [contracts, setContracts] = useState<MonthContract[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [grouped, setGrouped] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setContracts(null)
    setError(null)
    fetch(`/api/metrics/month-contracts?month=${month}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setContracts(data.contracts))
      .catch((err) => setError(String(err)))
  }, [month])

  const isAllManagers = managerFilter === ALL_MANAGERS
  // Уважаем глобальный фильтр «Менеджер» клиентски — тот же паттерн, что
  // filterMovementByManager: сумма/среднее пересчитываются из уже
  // отфильтрованного списка, без новой формулы. Для ARPU эта детализация
  // при выбранном менеджере не открывается (карточка приглушена на
  // обзоре), но фильтр применяем единообразно на всякий случай.
  const filteredContracts = contracts && !isAllManagers ? contracts.filter((c) => c.manager === managerFilter) : contracts
  // Поиск — отдельный слой поверх фильтра «Менеджер»: сужает строки в
  // таблице, но НЕ трогает заголовок «Общий ARPU за месяц» (это фиксированная
  // цифра месяца, как на карточке, не «итог по видимым строкам»).
  const searchedContracts = filteredContracts ? filteredContracts.filter((c) => matchesContractSearch(c, search)) : null

  const emptyMessage = search.trim() ? 'Ничего не найдено' : isCurrent ? IN_PROGRESS_EMPTY_MSG : undefined

  const label = kind === 'mrr' ? 'MRR' : 'ARPU'

  return (
    <div className="page">
      <button type="button" className="drill-back" onClick={onBack}>
        ← Назад к обзору
      </button>

      <div className="drill-header">
        <h1 className="page__title">
          {label} · {formatMonthFull(month)}
          {isCurrent && <span className="movement-panel__badge">в процессе</span>}
        </h1>
        {filteredContracts && filteredContracts.length > 0 && (
          <div className="movement-panel__header-controls">
            <ContractSearchInput value={search} onChange={setSearch} />
            {showGroupToggle && <GroupToggle grouped={grouped} onChange={setGrouped} />}
          </div>
        )}
      </div>

      {error && <p className="state-msg state-msg--error">Ошибка загрузки: {error}</p>}
      {!error && !filteredContracts && <p className="state-msg">Загрузка…</p>}

      {!error && filteredContracts && searchedContracts && (
        <>
          {kind === 'arpu' &&
            (() => {
              const withTariff = filteredContracts.filter((c) => hasTariff(c.tariff))
              const overallArpu = withTariff.length > 0 ? withTariff.reduce((s, c) => s + (c.tariff as number), 0) / withTariff.length : null
              return (
                overallArpu !== null && (
                  <div className="drill-status-summary">
                    Общий ARPU за месяц: <strong>{formatRub(overallArpu)}</strong> (по {withTariff.length} контрактам с тарифом)
                  </div>
                )
              )
            })()}

          <div className="card">
            {kind === 'mrr' ? (
              <MrrContractTable
                contracts={searchedContracts}
                grouped={showGroupToggle && grouped}
                managers={managers}
                colorMap={colorMap}
                totalCount={searchedContracts.length}
                totalSum={searchedContracts.reduce((s, c) => s + c.invoice_amount, 0)}
                emptyMessage={emptyMessage}
              />
            ) : (
              <ArpuContractTable
                contracts={searchedContracts}
                grouped={showGroupToggle && grouped}
                managers={managers}
                colorMap={colorMap}
                emptyMessage={emptyMessage}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
