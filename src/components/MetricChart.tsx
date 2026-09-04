import { useState } from 'react'
import { MetricLineChart } from './MetricLineChart'
import type { MonthlyMetric } from '../lib/metrics'

interface MetricChartProps {
  months: MonthlyMetric[]
  title: string
  metricLabel: string
  getValue: (m: MonthlyMetric) => number | null
  color?: string
  /** Опорный месяц дашборда — подсвечивается на графике. */
  anchorPeriod?: string | null
}

export function MetricChart({ months, title, metricLabel, getValue, color, anchorPeriod }: MetricChartProps) {
  const [showLabels, setShowLabels] = useState(false)

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">{title}</div>
        <label className="toggle">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          <span>Значения на графике</span>
        </label>
      </div>
      <MetricLineChart
        months={months}
        metricLabel={metricLabel}
        getValue={getValue}
        color={color}
        showLabels={showLabels}
        anchorPeriod={anchorPeriod}
      />
    </div>
  )
}
