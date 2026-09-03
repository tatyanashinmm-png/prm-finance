import { formatMonthShort, formatRub, formatSignedRub } from '../lib/format'
import type { MovementMonth } from '../lib/movement'

export function MovementKpiCard({ movement }: { movement: MovementMonth | null }) {
  if (!movement) {
    return (
      <div className="card kpi-card">
        <div className="kpi-card__label">Чистое движение MRR</div>
        <p className="state-msg">Нет ни одного закрытого месяца</p>
      </div>
    )
  }

  const trend = movement.net_mrr >= 0 ? 'up' : 'down'

  return (
    <div className="card kpi-card">
      <div className="kpi-card__label">Чистое движение MRR за {formatMonthShort(movement.period_start)}</div>
      <div className={`kpi-card__value movement-kpi__value movement-kpi__value--${trend}`}>
        {formatSignedRub(movement.net_mrr)}
      </div>
      <div className="movement-kpi__pills">
        <span className="movement-pill movement-pill--new">New {formatSignedRub(movement.new_mrr)}</span>
        <span className="movement-pill movement-pill--churn">Churn {formatRub(movement.churn_mrr)}</span>
      </div>
    </div>
  )
}
