import { Fragment, useEffect, useState } from 'react'
import { formatMonthFull, formatRub } from '../lib/format'

interface InvoiceRow {
  period_start: string
  invoice_amount: number
  paid_status: string | null
}

interface SubscriptionCard {
  contract_num: string
  legal_entity: string | null
  status: string | null
  manager: string
  current_tariff: number | null
  block_reason: string | null
  summary: {
    issued_count: number
    issued_amount: number
    paid_count: number
    paid_amount: number
    unpaid_in_window: InvoiceRow[]
    paid_ahead_count: number
  }
  invoices: InvoiceRow[]
}

interface ClientCardResponse {
  window: string[]
  client: {
    id: number
    name: string
    inn: string | null
    status: string | null
    manager: string | null
    note: string | null
    subscriptions_count: number
  }
  subscriptions: SubscriptionCard[]
}

type HistMode = 'closed' | 'all' | 'unpaid'

interface ClientCardProps {
  clientId: number
  onBack: () => void
}

function isPaid(inv: InvoiceRow): boolean {
  return inv.paid_status === 'Да'
}

function debtOf(sub: SubscriptionCard): number {
  return sub.summary.unpaid_in_window.reduce((sum, u) => sum + u.invoice_amount, 0)
}

function heatCellClass(inv: InvoiceRow): string {
  if (!isPaid(inv)) return 'heat-cell unpaid'
  if (inv.invoice_amount === 0) return 'heat-cell paid zero'
  return 'heat-cell paid'
}

function HistoryTable({ rows }: { rows: InvoiceRow[] }) {
  return (
    <table className="hist-table">
      <thead>
        <tr>
          <th>Период</th>
          <th>Сумма</th>
          <th>Оплачен</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((inv) => (
          <tr key={inv.period_start} className={isPaid(inv) ? '' : 'row-unpaid'}>
            <td>{formatMonthFull(inv.period_start)}</td>
            <td>{formatRub(inv.invoice_amount)}</td>
            <td>
              <span className={`pay-icon ${isPaid(inv) ? 'yes' : 'no'}`}>{isPaid(inv) ? '✓' : '✕'}</span> {isPaid(inv) ? 'Да' : 'Нет'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface SubCardProps {
  sub: SubscriptionCard
  idx: number
  currentMonth: string
  mode: HistMode
  onToggleExpand: () => void
  onShowUnpaid: () => void
  onShowAll: () => void
}

/** Одна подписка — карточка по мокапу clients.html (detail-view .sub-card):
 * шапка контракта, note-chip (причина/заметка), чипы-статистики, тепловая
 * карта истории + переключаемая таблица (свёрнуто/все периоды/только неоплаченные). */
function SubCard({ sub, idx, currentMonth, mode, onToggleExpand, onShowUnpaid, onShowAll }: SubCardProps) {
  const debt = debtOf(sub)
  const unpaidRows = sub.invoices.filter((inv) => !isPaid(inv))

  // Разделитель "сегодня" — граница между прошлым/текущим и оплаченным
  // вперёд. currentMonth берём из window[] ответа API (тот же серверный
  // "текущий месяц", что и в summary.paid_ahead_count), а не считаем дату
  // заново на фронте. Не рисуем разделитель, если он был бы в начале/конце
  // ряда — там ему нечего разделять.
  const todayIndex = sub.invoices.findIndex((inv) => inv.period_start > currentMonth)
  const dividerAt = todayIndex > 0 && todayIndex < sub.invoices.length ? todayIndex : -1

  const rowsShown = mode === 'unpaid' ? unpaidRows : sub.invoices

  return (
    <div className="sub-card" id={`subcard-${idx}`}>
      <div className="sub-head">
        <div className="left">
          <span className="contract">{sub.contract_num}</span>
          {sub.legal_entity && <span className="legal">{sub.legal_entity}</span>}
          <span className={`status-pill ${sub.status === 'Блок' ? 'blocked' : 'active'}`}>{sub.status ?? 'Активен'}</span>
        </div>
        <div className={`right${sub.status === 'Блок' ? ' tariff-muted' : ''}`}>
          Тариф: <b>{sub.current_tariff === null ? '—' : formatRub(sub.current_tariff)}</b>
          {sub.current_tariff !== null && '/мес'}
        </div>
      </div>

      {sub.block_reason && (
        <div className={`note-chip ${sub.status === 'Блок' ? 'flag' : 'info'}`}>
          {sub.status === 'Блок' ? '⚑' : '📝'} {sub.block_reason}
        </div>
      )}

      <div className="stat-chips">
        <div className="stat-chip">
          <div className="lbl">Выставлено</div>
          <div className="val">
            {sub.summary.issued_count} · {formatRub(sub.summary.issued_amount)}
          </div>
        </div>
        <div className="stat-chip">
          <div className="lbl">Оплачено</div>
          <div className="val">
            {sub.summary.paid_count} · {formatRub(sub.summary.paid_amount)}
          </div>
        </div>
        {debt > 0 && (
          <div className="stat-chip debt" onClick={onShowUnpaid}>
            <div className="lbl">Не оплачено →</div>
            <div className="val">{formatRub(debt)}</div>
          </div>
        )}
      </div>

      {sub.invoices.length === 0 ? (
        <p className="state-msg">Нет истории счетов</p>
      ) : (
        <>
          <div className="history-head">
            {mode === 'unpaid' ? (
              <h4>
                Неоплаченные периоды ({unpaidRows.length}){' '}
                <button type="button" className="expand-link" style={{ marginLeft: 8 }} onClick={onShowAll}>
                  показать все {sub.invoices.length} ▾
                </button>
              </h4>
            ) : (
              <h4>История платежей ({sub.invoices.length} мес.)</h4>
            )}
            <button type="button" className="expand-link" onClick={onToggleExpand}>
              {mode === 'closed' ? 'Показать все периоды ▾' : 'Свернуть ▴'}
            </button>
          </div>

          <div className="heatmap">
            {sub.invoices.map((inv, i) => (
              <Fragment key={inv.period_start}>
                {i === dividerAt && <div className="heat-divider" title="сегодня" />}
                <div className={heatCellClass(inv)}>
                  <span className="heat-tip">
                    <b>{formatMonthFull(inv.period_start)}</b>
                    <br />
                    {formatRub(inv.invoice_amount)} · {isPaid(inv) ? 'оплачен' : 'не оплачен'}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>

          <div className="heat-legend">
            <span>
              <i style={{ background: 'var(--green)', opacity: 0.55 }} />
              оплачен
            </span>
            {sub.invoices.some((inv) => isPaid(inv) && inv.invoice_amount === 0) && (
              <span>
                <i style={{ background: 'var(--lavender)' }} />0 ₽, оплачен
              </span>
            )}
            <span>
              <i style={{ background: 'var(--red)' }} />
              не оплачен
            </span>
          </div>

          <div className={`full-table${mode !== 'closed' ? ' open' : ''}`}>
            <HistoryTable rows={rowsShown} />
          </div>
        </>
      )}
    </div>
  )
}

/** Карточка клиента (шаг 2.4, вид переоформлен под мокап clients.html —
 * шаг D.3) — клиент + ВСЕ его подписки, по каждой полная история счетов +
 * сводка. Данные из /api/clients/:id как есть, эндпоинт не менялся. */
export function ClientCard({ clientId, onBack }: ClientCardProps) {
  const [data, setData] = useState<ClientCardResponse | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [histModes, setHistModes] = useState<Record<number, HistMode>>({})

  useEffect(() => {
    setData(null)
    setNotFound(false)
    setError(null)
    setHistModes({})
    fetch(`/api/clients/${clientId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true)
          return null
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((body: ClientCardResponse | null) => {
        if (body) setData(body)
      })
      .catch((err) => setError(String(err)))
  }, [clientId])

  const modeOf = (idx: number): HistMode => histModes[idx] ?? 'closed'
  const setMode = (idx: number, mode: HistMode) => setHistModes((prev) => ({ ...prev, [idx]: mode }))

  const toggleExpand = (idx: number) => {
    setMode(idx, modeOf(idx) === 'closed' ? 'all' : 'closed')
  }

  const showUnpaid = (idx: number) => {
    setMode(idx, 'unpaid')
    document.getElementById(`subcard-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const showUnpaidForAll = () => {
    if (!data) return
    let firstIdx: number | null = null
    data.subscriptions.forEach((sub, idx) => {
      if (sub.summary.unpaid_in_window.length > 0) {
        setMode(idx, 'unpaid')
        if (firstIdx === null) firstIdx = idx
      }
    })
    if (firstIdx !== null) document.getElementById(`subcard-${firstIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const totalIssued = data ? data.subscriptions.reduce((s, x) => s + x.summary.issued_amount, 0) : 0
  const totalPaid = data ? data.subscriptions.reduce((s, x) => s + x.summary.paid_amount, 0) : 0
  const totalDebt = data ? data.subscriptions.reduce((s, x) => s + debtOf(x), 0) : 0
  const currentMonth = data && data.window.length > 0 ? data.window[data.window.length - 1] : ''

  return (
    <div className="page">
      <button type="button" className="back-btn" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Назад к списку
      </button>

      {error && <p className="state-msg state-msg--error">Ошибка загрузки: {error}</p>}
      {notFound && <p className="state-msg">Клиент не найден</p>}
      {!error && !notFound && !data && <p className="state-msg">Загрузка…</p>}

      {data && (
        <>
          <div className="detail-header">
            <div>
              <h1>
                {data.client.name} <span className={`status-pill ${data.client.status === 'Блок' ? 'blocked' : 'active'}`}>{data.client.status ?? 'Активен'}</span>
              </h1>
              <div className="meta">
                Менеджер: {data.client.manager ?? '—'} · Подписок: {data.client.subscriptions_count}
                {data.client.inn && <> · ИНН: {data.client.inn}</>}
                {data.client.note && <> · {data.client.note}</>}
              </div>
            </div>
            <div className="stat-chips" style={{ margin: 0 }}>
              <div className="stat-chip">
                <div className="lbl">Выставлено всего</div>
                <div className="val">{formatRub(totalIssued)}</div>
              </div>
              <div className="stat-chip">
                <div className="lbl">Оплачено всего</div>
                <div className="val">{formatRub(totalPaid)}</div>
              </div>
              {totalDebt > 0 && (
                <div className="stat-chip debt" onClick={showUnpaidForAll}>
                  <div className="lbl">Долг →</div>
                  <div className="val">{formatRub(totalDebt)}</div>
                </div>
              )}
            </div>
          </div>

          {data.subscriptions.map((sub, idx) => (
            <SubCard
              key={sub.contract_num}
              sub={sub}
              idx={idx}
              currentMonth={currentMonth}
              mode={modeOf(idx)}
              onToggleExpand={() => toggleExpand(idx)}
              onShowUnpaid={() => showUnpaid(idx)}
              onShowAll={() => setMode(idx, 'all')}
            />
          ))}
        </>
      )}
    </div>
  )
}
