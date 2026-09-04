import { formatPercent } from '../lib/format'
import type { MetricKpi } from '../lib/metrics'

interface KpiCardProps {
  label: string
  kpi: MetricKpi | null
  formatValue: (value: number) => string
  emptyMessage: string
  /** Опорный месяц ещё не закрыт — дельта показывается приглушённой (серой), а не зелёной/красной. */
  muted?: boolean
}

export function KpiCard({ label, kpi, formatValue, emptyMessage, muted }: KpiCardProps) {
  if (!kpi) {
    return (
      <div className="card kpi-card">
        <div className="kpi-card__label">{label}</div>
        <p className="state-msg">{emptyMessage}</p>
      </div>
    )
  }

  const trend = muted ? 'flat' : kpi.deltaPct === null ? 'flat' : kpi.deltaPct >= 0 ? 'up' : 'down'

  return (
    <div className="card kpi-card">
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value">{formatValue(kpi.value)}</div>
      {kpi.deltaPct !== null && (
        <div className={`kpi-card__delta kpi-card__delta--${trend}`}>
          {!muted && <span className="kpi-card__delta-arrow">{trend === 'down' ? '▼' : '▲'}</span>}
          {formatPercent(kpi.deltaPct)} к прошлому месяцу
        </div>
      )}
    </div>
  )
}
