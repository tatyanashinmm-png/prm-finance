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
      <div className="kpi-card">
        <div className="label">Чистое движение MRR</div>
        <p className="state-msg">Нет данных за опорный месяц</p>
      </div>
    )
  }

  const trend = isCurrent ? 'flat' : movement.net_mrr >= 0 ? 'up' : 'down'

  const content = (
    <>
      <div className="label">Чистое движение MRR</div>
      <div className="value">{formatSignedRub(movement.net_mrr)}</div>
      <span className={`delta ${trend}`}>
        {trend !== 'flat' && (trend === 'down' ? '↓' : '↑')} {trend === 'up' ? 'приток растёт' : trend === 'down' ? 'отток растёт' : 'в процессе'}
      </span>
      <div className="foot">
        New {formatSignedRub(movement.new_mrr)} · Churn {formatRub(movement.churn_mrr)}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className="kpi-card kpi-card--clickable" onClick={onClick}>
        {content}
      </button>
    )
  }

  return <div className="kpi-card">{content}</div>
}
