import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from 'recharts'
import { formatMonthShort, formatRub } from '../lib/format'

// Форма ответа GET /api/metrics/monthly — эндпоинт не менялся, поля строго
// в его контракте (snake_case).
interface MonthlyMetric {
  period_start: string
  issued_amount: number
  issued_count: number
  paid_count: number
  mrr: number
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as MonthlyMetric | undefined
  if (!point) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__month">{formatMonthShort(point.period_start)}</div>
      <div className="chart-tooltip__value">MRR: {formatRub(point.mrr, { decimals: true })}</div>
    </div>
  )
}

export function MrrPage() {
  const [months, setMonths] = useState<MonthlyMetric[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/metrics/monthly')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setMonths(data.months))
      .catch((err) => setError(String(err)))
  }, [])

  return (
    <div className="page">
      <h1 className="page__title">MRR</h1>

      <div className="card">
        <div className="card__title">MRR по месяцам</div>
        {error && <p className="state-msg state-msg--error">Ошибка загрузки: {error}</p>}
        {!error && !months && <p className="state-msg">Загрузка…</p>}
        {months && months.length === 0 && <p className="state-msg">Нет данных</p>}
        {months && months.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={months} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="period_start"
                tickFormatter={formatMonthShort}
                tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => formatRub(v)}
                tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                axisLine={false}
                tickLine={false}
                width={96}
              />
              <Tooltip content={ChartTooltip} />
              <Line
                type="monotone"
                dataKey="mrr"
                stroke="#0C39FF"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#0C39FF', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="card__title">Расшифровка по месяцам</div>
        {months && months.length > 0 && (
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Месяц</th>
                <th>Выставлено</th>
                <th>Выставлено / Оплачено, шт</th>
                <th>Оплачено = MRR</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.period_start}>
                  <td>{formatMonthShort(m.period_start)}</td>
                  <td>{formatRub(m.issued_amount)}</td>
                  <td className="metrics-table__ratio">
                    {m.issued_count} / {m.paid_count}
                  </td>
                  <td>{formatRub(m.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
