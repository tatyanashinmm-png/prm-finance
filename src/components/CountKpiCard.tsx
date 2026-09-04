interface CountKpiCardProps {
  label: string
  value: number | null
  /** Абсолютная (не %) разница к предыдущему месяцу — штуки, не проценты. */
  delta: number | null
  /** Опорный месяц ещё не закрыт — дельта показывается приглушённой. */
  isCurrent: boolean
  /** Для оттока: рост (delta > 0) — это ухудшение (красный), а не рост (зелёный). */
  invert?: boolean
  emptyMessage: string
}

export function CountKpiCard({ label, value, delta, isCurrent, invert, emptyMessage }: CountKpiCardProps) {
  if (value === null) {
    return (
      <div className="card kpi-card">
        <div className="kpi-card__label">{label}</div>
        <p className="state-msg">{emptyMessage}</p>
      </div>
    )
  }

  let trend: 'up' | 'down' | 'flat' = 'flat'
  if (!isCurrent && delta !== null && delta !== 0) {
    const positive = delta > 0
    trend = invert ? (positive ? 'down' : 'up') : positive ? 'up' : 'down'
  }

  return (
    <div className="card kpi-card">
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value">{value} шт</div>
      {delta !== null && (
        <div className={`kpi-card__delta kpi-card__delta--${trend}`}>
          {!isCurrent && trend !== 'flat' && <span className="kpi-card__delta-arrow">{trend === 'down' ? '▼' : '▲'}</span>}
          {delta > 0 ? '+' : ''}
          {delta} к прошлому месяцу
        </div>
      )}
    </div>
  )
}
