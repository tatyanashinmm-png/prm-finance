import { useEffect, useMemo, useState } from 'react'
import { ContractSearchInput } from '../components/ContractSearchInput'
import { ManagerMultiFilter } from '../components/ManagerMultiFilter'
import { StatusBadge } from '../components/StatusBadge'
import { formatMonthFull, formatRub } from '../lib/format'
import { ClientCard } from './ClientCard'

type StatusFilter = 'Активен' | 'Блок' | 'все'

interface UnpaidPeriod {
  period_start: string
  invoice_amount: number
  paid_status: string | null
}

interface ClientRow {
  client_id: number
  client_name: string
  contract_num: string
  status: string | null
  manager: string
  tariff: number | null
  block_reason: string | null
  unpaid_periods: UnpaidPeriod[]
}

interface ClientsResponse {
  window: string[]
  total: number
  rows: ClientRow[]
}

/** "2026-07-01" -> "июль" */
function monthNameLower(periodStart: string): string {
  return formatMonthFull(periodStart).split(' ')[0].toLowerCase()
}

/** ["2026-07-01","2026-08-01","2026-09-01"] -> "июль–сентябрь 2026" (или
 * "декабрь 2026 – январь 2027", если окно перескакивает через год). */
function formatWindowLabel(window: string[]): string {
  if (window.length === 0) return ''
  const first = window[0]
  const last = window[window.length - 1]
  const firstYear = first.slice(0, 4)
  const lastYear = last.slice(0, 4)
  const firstMonth = monthNameLower(first)
  const lastMonth = monthNameLower(last)
  if (firstYear === lastYear) return `${firstMonth}–${lastMonth} ${lastYear}`
  return `${firstMonth} ${firstYear} – ${lastMonth} ${lastYear}`
}

function formatUnpaidPeriods(periods: UnpaidPeriod[]): string {
  if (periods.length === 0) return '—'
  return periods.map((p) => `${monthNameLower(p.period_start)} ${new Intl.NumberFormat('ru-RU').format(p.invoice_amount)}`).join(', ')
}

function buildQuery(params: { search: string; managers: string[]; status: StatusFilter; unpaidOnly: boolean }): string {
  const qs = new URLSearchParams()
  if (params.search.trim()) qs.set('search', params.search.trim())
  for (const m of params.managers) qs.append('manager', m)
  if (params.status !== 'Активен') qs.set('status', params.status)
  if (params.unpaidOnly) qs.set('unpaid', 'true')
  const s = qs.toString()
  return s ? `/api/clients?${s}` : '/api/clients'
}

export function ContractsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [managers, setManagers] = useState<string[]>([])
  const [status, setStatus] = useState<StatusFilter>('Активен')
  const [unpaidOnly, setUnpaidOnly] = useState(false)

  const [data, setData] = useState<ClientsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Открытая карточка клиента — отдельный подэкран поверх этой же страницы
  // (тот же приём, что и MrrArpuDrillThrough на Обзоре). Фильтры выше не
  // сбрасываются при переходе, т.к. это состояние того же компонента, а не
  // отдельный маршрут — просто временно не рендерим таблицу.
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)

  // Список менеджеров для фильтра и счётчик "всего активных" — из ОТДЕЛЬНОГО
  // одноразового запроса без фильтров (status=все), чтобы список менеджеров
  // не "сжимался" вместе с текущими фильтрами (иначе выбранный менеджер мог бы
  // пропасть из выпадашки, как только применён другой фильтр).
  const [managerOptions, setManagerOptions] = useState<string[]>([])
  const [activeTotal, setActiveTotal] = useState<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    fetch('/api/clients?status=все')
      .then((res) => res.json())
      .then((body: ClientsResponse) => {
        const unique = [...new Set(body.rows.map((r) => r.manager))].sort((a, b) => a.localeCompare(b, 'ru'))
        setManagerOptions(unique)
        setActiveTotal(body.rows.filter((r) => r.status === 'Активен').length)
      })
      .catch(() => {
        /* список менеджеров и счётчик — не критично для основной таблицы */
      })
  }, [])

  useEffect(() => {
    setData(null)
    setError(null)
    fetch(buildQuery({ search: debouncedSearch, managers, status, unpaidOnly }))
      .then((res) => res.json())
      .then((body: ClientsResponse) => setData(body))
      .catch((err) => setError(String(err)))
  }, [debouncedSearch, managers, status, unpaidOnly])

  const windowLabel = useMemo(() => (data ? formatWindowLabel(data.window) : ''), [data])

  // Дефолт = только Активен, без поиска/менеджеров/неоплаченных — как при
  // первом открытии экрана. Кнопка сброса показывается, только если реально
  // есть что сбрасывать (проверяем searchInput, а не debouncedSearch — иначе
  // кнопка на долю секунды не появлялась бы сразу после ввода первого символа).
  const hasActiveFilters = searchInput.trim() !== '' || managers.length > 0 || status !== 'Активен' || unpaidOnly

  const resetFilters = () => {
    setSearchInput('')
    setDebouncedSearch('')
    setManagers([])
    setStatus('Активен')
    setUnpaidOnly(false)
  }

  if (selectedClientId !== null) {
    return <ClientCard clientId={selectedClientId} onBack={() => setSelectedClientId(null)} />
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Клиенты</h1>
        <div className="page__filters">
          <ContractSearchInput value={searchInput} onChange={setSearchInput} />
          <ManagerMultiFilter managers={managerOptions} value={managers} onChange={setManagers} />
          <div className="status-toggle">
            {(['Активен', 'Блок', 'все'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`status-toggle__btn${status === s ? ' status-toggle__btn--active' : ''}`}
                onClick={() => setStatus(s)}
              >
                {s === 'все' ? 'Все' : s}
              </button>
            ))}
          </div>
          <label className="checkbox-filter">
            <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
            Есть неоплаченные
          </label>
          {hasActiveFilters && (
            <button type="button" className="reset-filters-btn" onClick={resetFilters}>
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {error && <p className="state-msg state-msg--error">Ошибка: {error}</p>}
        {!error && data === null && <p className="state-msg">Загрузка…</p>}
        {!error && data !== null && (
          <>
            <p className="state-msg clients-page__summary">
              Показано: {data.total}
              {activeTotal !== null && <> · всего активных: {activeTotal}</>}
              {windowLabel && <> · неоплаты за: {windowLabel}</>}
            </p>
            {data.rows.length === 0 ? (
              <p className="state-msg">Нет клиентов по заданным фильтрам</p>
            ) : (
              <div className="table-scroll">
                <table className="drill-table clients-table">
                  <thead>
                    <tr>
                      <th>Наименование</th>
                      <th>Номер контракта</th>
                      <th>Статус</th>
                      <th>Менеджер</th>
                      <th>Стоимость</th>
                      <th>Неоплаченные периоды</th>
                      <th>Причина блока / Важно!</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr
                        key={row.contract_num}
                        className="clients-table__row"
                        onClick={() => setSelectedClientId(row.client_id)}
                      >
                        <td>{row.client_name}</td>
                        <td>
                          <span className="contract-num">{row.contract_num}</span>
                        </td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>{row.manager}</td>
                        <td className={row.status === 'Блок' ? 'clients-table__tariff clients-table__tariff--muted' : 'clients-table__tariff'}>
                          {row.tariff === null ? '—' : formatRub(row.tariff)}
                        </td>
                        <td className="clients-table__wrap">{formatUnpaidPeriods(row.unpaid_periods)}</td>
                        <td className="drill-table__reason">{row.block_reason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
