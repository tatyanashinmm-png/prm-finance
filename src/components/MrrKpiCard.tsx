import { formatMonthShort, formatPercent, formatRub } from '../lib/format'
import type { MrrKpi } from '../lib/metrics'

export function MrrKpiCard({ kpi }: { kpi: MrrKpi | null }) {
  if (!kpi) {
    return (
      <div className="card kpi-card">
        <div className="kpi-card__label">MRR</div>
        <p className="state-msg">Нет ни одного закрытого месяца</p>
      </div>
    )
  }

  const trend = kpi.deltaPct === null ? 'flat' : kpi.deltaPct >= 0 ? 'up' : 'down'

  return (
    <div className="card kpi-card">
      <div className="kpi-card__label">MRR за {formatMonthShort(kpi.periodStart)}</div>
      <div className="kpi-card__value">{formatRub(kpi.mrr)}</div>
      {kpi.deltaPct !== null && (
        <div className={`kpi-card__delta kpi-card__delta--${trend}`}>
          <span className="kpi-card__delta-arrow">{trend === 'down' ? '▼' : '▲'}</span>
          {formatPercent(kpi.deltaPct)} к прошлому месяцу
        </div>
      )}
    </div>
  )
}
