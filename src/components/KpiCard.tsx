import { formatPercent } from '../lib/format'
import type { MetricKpi } from '../lib/metrics'

interface KpiCardProps {
  label: string
  kpi: MetricKpi | null
  formatValue: (value: number) => string
  emptyMessage: string
  /** Опорный месяц ещё не закрыт — дельта показывается приглушённой (серой), а не зелёной/красной. */
  muted?: boolean
  /** Клик по карточке — проваливание в детализацию (из каких контрактов складывается метрика). */
  onClick?: () => void
  /** Мелкая подпись снизу (напр. "к июлю: 18 149 ₽") — по мокапу dashboard-overview.html. */
  foot?: string
}

/** Маленькая KPI-карточка (шаг D.4a, вид по мокапу — .kpi-card/.label/.value/.delta/.foot).
 * Используется для ARPU; MRR теперь отдельный .hero-kpi прямо в OverviewPage. */
export function KpiCard({ label, kpi, formatValue, emptyMessage, muted, onClick, foot }: KpiCardProps) {
  if (!kpi) {
    return (
      <div className="kpi-card">
        <div className="label">{label}</div>
        <p className="state-msg">{emptyMessage}</p>
      </div>
    )
  }

  const trend = muted ? 'flat' : kpi.deltaPct === null ? 'flat' : kpi.deltaPct >= 0 ? 'up' : 'down'

  const content = (
    <>
      <div className="label">{label}</div>
      <div className="value">{formatValue(kpi.value)}</div>
      {kpi.deltaPct !== null && (
        <span className={`delta ${trend}`}>
          {trend !== 'flat' && (trend === 'down' ? '↓' : '↑')} {formatPercent(kpi.deltaPct)}
        </span>
      )}
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
