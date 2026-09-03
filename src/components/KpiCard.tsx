import { formatMonthShort, formatPercent } from '../lib/format'
import type { MetricKpi } from '../lib/metrics'

interface KpiCardProps {
  label: string
  kpi: MetricKpi | null
  formatValue: (value: number) => string
  emptyMessage: string
}

export function KpiCard({ label, kpi, formatValue, emptyMessage }: KpiCardProps) {
  if (!kpi) {
    return (
      <div className="card kpi-card">
        <div className="kpi-card__label">{label}</div>
        <p className="state-msg">{emptyMessage}</p>
      </div>
    )
  }

  const trend = kpi.deltaPct === null ? 'flat' : kpi.deltaPct >= 0 ? 'up' : 'down'

  return (
    <div className="card kpi-card">
      <div className="kpi-card__label">
        {label} за {formatMonthShort(kpi.periodStart)}
      </div>
      <div className="kpi-card__value">{formatValue(kpi.value)}</div>
      {kpi.deltaPct !== null && (
        <div className={`kpi-card__delta kpi-card__delta--${trend}`}>
          <span className="kpi-card__delta-arrow">{trend === 'down' ? '▼' : '▲'}</span>
          {formatPercent(kpi.deltaPct)} к прошлому месяцу
        </div>
      )}
    </div>
  )
}
