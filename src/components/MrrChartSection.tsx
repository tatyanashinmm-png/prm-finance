import { useState } from 'react'
import { MetricLineChart } from './MetricLineChart'
import { ManagerStackChart } from './ManagerStackChart'
import type { MonthlyMetric } from '../lib/metrics'
import type { ManagerMonthlyMrr } from '../lib/managerMrr'

interface MrrChartSectionProps {
  /** 'all' — показываем переключатель «Линия / По менеджерам»; конкретный менеджер — только линия. */
  isAllManagers: boolean
  months: MonthlyMetric[]
  managerMonths: ManagerMonthlyMrr[]
  managers: string[]
  colorMap: Map<string, string>
  /** Клик по точке/месяцу — переставляет опорный месяц дашборда. */
  onPointClick?: (periodStart: string) => void
  /** Опорный месяц дашборда — подсвечивается на графике. */
  anchorPeriod?: string | null
}

export function MrrChartSection({
  isAllManagers,
  months,
  managerMonths,
  managers,
  colorMap,
  onPointClick,
  anchorPeriod,
}: MrrChartSectionProps) {
  const [mode, setMode] = useState<'line' | 'stack'>('line')
  const [showLabels, setShowLabels] = useState(false)
  const showStack = isAllManagers && mode === 'stack'

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">MRR по месяцам</div>
        <div className="card__header-controls">
          {isAllManagers && (
            <div className="period-filter chart-mode-toggle">
              <button
                type="button"
                className={`period-filter__btn${mode === 'line' ? ' period-filter__btn--active' : ''}`}
                onClick={() => setMode('line')}
              >
                Линия
              </button>
              <button
                type="button"
                className={`period-filter__btn${mode === 'stack' ? ' period-filter__btn--active' : ''}`}
                onClick={() => setMode('stack')}
              >
                По менеджерам
              </button>
            </div>
          )}
          {!showStack && (
            <label className="toggle">
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              <span>Значения на графике</span>
            </label>
          )}
        </div>
      </div>
      {showStack ? (
        <ManagerStackChart
          months={managerMonths}
          managers={managers}
          colorMap={colorMap}
          onPointClick={onPointClick}
          anchorPeriod={anchorPeriod}
        />
      ) : (
        <MetricLineChart
          months={months}
          metricLabel="MRR"
          getValue={(m) => m.mrr}
          showLabels={showLabels}
          onPointClick={onPointClick}
          anchorPeriod={anchorPeriod}
        />
      )}
    </div>
  )
}
