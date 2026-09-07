import { useEffect, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
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

/** "2026-07-01" -> "июль" (та же идея, что в ContractsPage — локальная копия,
 * не выносим в lib/format.ts ради одной короткой функции на два места). */
function monthNameLower(periodStart: string): string {
  return formatMonthFull(periodStart).split(' ')[0].toLowerCase()
}

interface ClientCardProps {
  clientId: number
  onBack: () => void
}

/** Карточка клиента (шаг 2.4) — клиент + ВСЕ его подписки, по каждой полная
 * история счетов + сводка. Тот же паттерн "шапка + ← Назад + контент", что и
 * MrrArpuDrillThrough.tsx: fetch на маунте, .drill-back/.drill-header/.page__title. */
export function ClientCard({ clientId, onBack }: ClientCardProps) {
  const [data, setData] = useState<ClientCardResponse | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setNotFound(false)
    setError(null)
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

  return (
    <div className="page">
      <button type="button" className="drill-back" onClick={onBack}>
        ← Назад к списку
      </button>

      {error && <p className="state-msg state-msg--error">Ошибка загрузки: {error}</p>}
      {notFound && <p className="state-msg">Клиент не найден</p>}
      {!error && !notFound && !data && <p className="state-msg">Загрузка…</p>}

      {data && (
        <>
          <div className="drill-header">
            <h1 className="page__title">
              {data.client.name} <StatusBadge status={data.client.status} />
            </h1>
          </div>
          <p className="state-msg client-card__meta">
            Менеджер: {data.client.manager ?? '—'} · Подписок: {data.client.subscriptions_count}
            {data.client.inn && <> · ИНН: {data.client.inn}</>}
            {data.client.note && <> · {data.client.note}</>}
          </p>

          {data.subscriptions.map((sub) => (
            <div className="card client-card__subscription" key={sub.contract_num}>
              <div className="client-card__sub-header">
                <h2 className="card__title">
                  <span className="contract-num">{sub.contract_num}</span>
                  {sub.legal_entity && <span className="client-card__legal-entity">{sub.legal_entity}</span>}
                  <StatusBadge status={sub.status} />
                </h2>
                <div className="client-card__sub-meta">
                  <span>Менеджер: {sub.manager}</span>
                  <span className={sub.status === 'Блок' ? 'client-card__tariff client-card__tariff--muted' : 'client-card__tariff'}>
                    Тариф: {sub.current_tariff === null ? '—' : formatRub(sub.current_tariff)}
                  </span>
                </div>
              </div>
              {sub.block_reason && <p className="drill-status-summary">{sub.block_reason}</p>}

              <div className="client-card__summary">
                <span>
                  Выставлено: {sub.summary.issued_count} · {formatRub(sub.summary.issued_amount)}
                </span>
                <span>
                  Оплачено: {sub.summary.paid_count} · {formatRub(sub.summary.paid_amount)}
                </span>
                {sub.summary.paid_ahead_count > 0 && <span>Оплачено вперёд: {sub.summary.paid_ahead_count} период(ов)</span>}
              </div>

              {sub.summary.unpaid_in_window.length > 0 && (
                <div className="client-card__unpaid">
                  <span className="client-card__unpaid-label">Неоплачено за {formatMonthFull(data.window[0])}–{formatMonthFull(data.window[data.window.length - 1])}:</span>
                  <ul className="client-card__unpaid-list">
                    {sub.summary.unpaid_in_window.map((p) => (
                      <li key={p.period_start}>
                        {monthNameLower(p.period_start)} — {formatRub(p.invoice_amount)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="table-scroll">
                <table className="drill-table">
                  <thead>
                    <tr>
                      <th>Период</th>
                      <th>Сумма</th>
                      <th>Оплачен</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sub.invoices.map((inv) => (
                      <tr key={inv.period_start}>
                        <td>{formatMonthFull(inv.period_start)}</td>
                        <td>{formatRub(inv.invoice_amount)}</td>
                        <td>{inv.paid_status ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
