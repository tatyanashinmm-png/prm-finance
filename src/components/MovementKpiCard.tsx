import { formatRub, formatSignedRub } from '../lib/format'
import type { MovementMonth } from '../lib/movement'

interface MovementKpiCardProps {
  movement: MovementMonth | null
  isCurrent: boolean
  /** Клик по карточке — проваливание в детализацию (Пришли/Отток). */
  onClick?: () => void
}

export function MovementKpiCard({ movement, isCurrent, onClick }: MovementKpiCardProps) {
  if (!movement) {
    return (
      <div className="card kpi-card">
        <div className="kpi-card__label">Чистое движение MRR</div>
        <p className="state-msg">Нет данных за опорный месяц</p>
      </div>
    )
  }

  const trend = isCurrent ? 'flat' : movement.net_mrr >= 0 ? 'up' : 'down'

  const content = (
    <>
      <div className="kpi-card__label">Чистое движение MRR</div>
      <div className={`kpi-card__value movement-kpi__value movement-kpi__value--${trend}`}>
        {formatSignedRub(movement.net_mrr)}
      </div>
      <div className="movement-kpi__pills">
        <span className="movement-pill movement-pill--new">New {formatSignedRub(movement.new_mrr)}</span>
        <span className="movement-pill movement-pill--churn">Churn {formatRub(movement.churn_mrr)}</span>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className="card kpi-card kpi-card--clickable" onClick={onClick}>
        {content}
      </button>
    )
  }

  return <div className="card kpi-card">{content}</div>
}
