import { formatRub, formatSignedRub } from '../lib/format'
import type { MovementMonth } from '../lib/movement'

export function MovementKpiCard({ movement, isCurrent }: { movement: MovementMonth | null; isCurrent: boolean }) {
  if (!movement) {
    return (
      <div className="card kpi-card">
        <div className="kpi-card__label">Чистое движение MRR</div>
        <p className="state-msg">Нет данных за опорный месяц</p>
      </div>
    )
  }

  const trend = isCurrent ? 'flat' : movement.net_mrr >= 0 ? 'up' : 'down'

  return (
    <div className="card kpi-card">
      <div className="kpi-card__label">Чистое движение MRR</div>
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
