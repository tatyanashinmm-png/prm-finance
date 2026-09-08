import type { ReactNode } from 'react'

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
  /** Клик по карточке — проваливание в детализацию (список контрактов). */
  onClick?: () => void
  /** Доп. строка под дельтой — сейчас только у «Отток»: разбивка блок/не оплатили. */
  breakdown?: ReactNode
  /** Мелкая подпись снизу, по мокапу (напр. "оплативших впервые"). */
  foot?: string
}

export function CountKpiCard({ label, value, delta, isCurrent, invert, emptyMessage, onClick, breakdown, foot }: CountKpiCardProps) {
  if (value === null) {
    return (
      <div className="kpi-card">
        <div className="label">{label}</div>
        <p className="state-msg">{emptyMessage}</p>
      </div>
    )
  }

  let trend: 'up' | 'down' | 'flat' = 'flat'
  if (!isCurrent && delta !== null && delta !== 0) {
    const positive = delta > 0
    trend = invert ? (positive ? 'down' : 'up') : positive ? 'up' : 'down'
  }

  const content = (
    <>
      <div className="label">{label}</div>
      <div className="value">{value} шт</div>
      {delta !== null && (
        <span className={`delta ${trend}`}>
          {trend !== 'flat' && (trend === 'down' ? '↓' : '↑')} {delta > 0 ? '+' : ''}
          {delta}
        </span>
      )}
      {breakdown}
      {foot && <div className="foot">{foot}</div>}
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
