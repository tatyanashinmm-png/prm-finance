import { useEffect, useMemo, useState } from 'react'
import { ManagerMultiFilter } from '../components/ManagerMultiFilter'
import { formatMonthFull, formatRub } from '../lib/format'
import { ClientCard } from './ClientCard'

type StatusFilter = 'Активен' | 'Блок' | 'все'
type SortKey = 'name' | 'status' | 'manager' | 'tariff'
type SortDir = 1 | -1

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

/** Чип неоплаченного периода — "июл · 3 910 ₽" (формат из мокапа clients.html). */
function formatUnpaidChip(p: UnpaidPeriod): string {
  const month3 = monthNameLower(p.period_start).slice(0, 3)
  const amount = new Intl.NumberFormat('ru-RU').format(p.invoice_amount)
  return `${month3} · ${amount} ₽`
}

/** "Александр Солодин" -> "АС" (инициалы для мини-аватарки, как в мокапе). */
function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
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

interface SortableThProps {
  label: string
  sortKeyName: SortKey
  activeKey: SortKey | null
  dir: SortDir
  onSort: (key: SortKey) => void
}

/** Заголовок сортируемой колонки — вид из мокапа (th.sortable + .arrow),
 * поведение как в мокапе: первый клик — по убыванию, повторный — переключает. */
function SortableTh({ label, sortKeyName, activeKey, dir, onSort }: SortableThProps) {
  const isActive = activeKey === sortKeyName
  return (
    <th className={`sortable${isActive ? ' sorted' : ''}`} onClick={() => onSort(sortKeyName)}>
      {label} <span className="arrow">{isActive ? (dir === 1 ? '▴' : '▾') : '▾'}</span>
    </th>
  )
}

export function ContractsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [managers, setManagers] = useState<string[]>([])
  const [status, setStatus] = useState<StatusFilter>('Активен')
  const [unpaidOnly, setUnpaidOnly] = useState(false)

  // Сортировка — клиентская, поверх уже загруженного и отфильтрованного
  // сервером ответа; сам /api/clients не трогаем и не передаём туда параметр
  // сортировки.
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(-1)

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

  const sortedRows = useMemo(() => {
    if (!data) return []
    if (!sortKey) return data.rows
    const rows = [...data.rows]
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.client_name.localeCompare(b.client_name, 'ru') * sortDir
        case 'status':
          return (a.status ?? '').localeCompare(b.status ?? '', 'ru') * sortDir
        case 'manager':
          return a.manager.localeCompare(b.manager, 'ru') * sortDir
        case 'tariff': {
          // Подписки без тарифа — всегда в конце, независимо от направления
          // сортировки (иначе null/не-число скакало бы то в начало, то в
          // конец при переключении стрелки, что нечитаемо).
          if (a.tariff === null && b.tariff === null) return 0
          if (a.tariff === null) return 1
          if (b.tariff === null) return -1
          return (a.tariff - b.tariff) * sortDir
        }
      }
    })
    return rows
  }, [data, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(-1)
    }
  }

  // Дефолт = только Активен, без поиска/менеджеров/неоплаченных/сортировки —
  // как при первом открытии экрана. Кнопка сброса показывается, только если
  // реально есть что сбрасывать (проверяем searchInput, а не debouncedSearch —
  // иначе кнопка на долю секунды не появлялась бы сразу после ввода первого символа).
  const hasActiveFilters = searchInput.trim() !== '' || managers.length > 0 || status !== 'Активен' || unpaidOnly || sortKey !== null

  const resetFilters = () => {
    setSearchInput('')
    setDebouncedSearch('')
    setManagers([])
    setStatus('Активен')
    setUnpaidOnly(false)
    setSortKey(null)
    setSortDir(-1)
  }

  if (selectedClientId !== null) {
    return <ClientCard clientId={selectedClientId} onBack={() => setSelectedClientId(null)} />
  }

  return (
    <div className="page">
      <h1 className="page__title">Клиенты</h1>

      <div className="filterbar">
        <div className="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Поиск по клиенту или номеру контракта"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <ManagerMultiFilter managers={managerOptions} value={managers} onChange={setManagers} />
        <div className="segmented">
          {(['Активен', 'Блок', 'все'] as StatusFilter[]).map((s) => (
            <button key={s} type="button" className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
              {s === 'все' ? 'Все' : s}
            </button>
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
          Есть неоплаченные
        </label>
        {hasActiveFilters && (
          <button type="button" className="reset-link" onClick={resetFilters}>
            Сбросить фильтры
          </button>
        )}
      </div>

      {error && <p className="state-msg state-msg--error">Ошибка: {error}</p>}
      {!error && data === null && <p className="state-msg">Загрузка…</p>}
      {!error && data !== null && (
        <>
          <div className="results-line">
            <div>
              Показано <b>{data.total}</b>
              {activeTotal !== null && (
                <>
                  {' '}
                  · всего активных: <b>{activeTotal}</b>
                </>
              )}
              {windowLabel && <> · неоплаты за: {windowLabel}</>}
            </div>
          </div>

          {data.rows.length === 0 ? (
            <p className="state-msg">Нет клиентов по заданным фильтрам</p>
          ) : (
            <div className="table-card">
              <div className="table-scroll">
                <table className="clients-table">
                  <thead>
                    <tr>
                      <SortableTh label="Наименование" sortKeyName="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <th>Номер контракта</th>
                      <SortableTh label="Статус" sortKeyName="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Менеджер" sortKeyName="manager" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Стоимость" sortKeyName="tariff" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <th>Неоплаченные периоды</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr key={row.contract_num} onClick={() => setSelectedClientId(row.client_id)}>
                        <td>
                          <div className="name-cell">{row.client_name}</div>
                        </td>
                        <td>
                          <span className="contract-num">{row.contract_num}</span>
                        </td>
                        <td>
                          <span className={`status-pill ${row.status === 'Блок' ? 'blocked' : 'active'}`}>{row.status ?? 'Активен'}</span>
                        </td>
                        <td>
                          <div className="mgr-cell">
                            <span className="mini-avatar">{initials(row.manager)}</span>
                            {row.manager}
                          </div>
                        </td>
                        <td className={row.status === 'Блок' ? 'tariff-muted' : ''}>{row.tariff === null ? '—' : formatRub(row.tariff)}</td>
                        <td>
                          {row.unpaid_periods.length > 0 ? (
                            <div className="unpaid-chips">
                              {row.unpaid_periods.map((p) => (
                                <span key={p.period_start} className="unpaid-chip" title={formatMonthFull(p.period_start)}>
                                  {formatUnpaidChip(p)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="no-unpaid">—</span>
                          )}
                        </td>
                        <td className="chev">›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
