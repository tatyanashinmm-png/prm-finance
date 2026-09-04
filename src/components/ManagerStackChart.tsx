import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type TooltipContentProps,
} from 'recharts'
import { formatCompactRub, formatMonthShort, formatRub } from '../lib/format'
import { isCurrentMonth } from '../lib/metrics'
import type { ManagerMonthlyMrr } from '../lib/managerMrr'

interface StackRow {
  period_start: string
  isCurrent: boolean
  total: number
  [manager: string]: string | number | boolean
}

function buildStackData(months: ManagerMonthlyMrr[], managers: string[]): StackRow[] {
  const currentIdx = months.findIndex((m) => isCurrentMonth(m.period_start))
  return months.map((m, i) => {
    const row: StackRow = {
      period_start: m.period_start,
      isCurrent: i === currentIdx,
      total: m.total_mrr,
    }
    for (const manager of managers) {
      row[manager] = m.by_manager.find((bm) => bm.manager === manager)?.mrr ?? 0
    }
    return row
  })
}

function makeStackTooltip(managers: string[], colorMap: Map<string, string>) {
  return function StackTooltip({ active, payload }: TooltipContentProps) {
    if (!active || !payload?.length) return null
    const point = payload[0]?.payload as StackRow | undefined
    if (!point) return null
    return (
      <div className="chart-tooltip chart-tooltip--wide">
        <div className="chart-tooltip__month">
          <span className="chart-tooltip__month-cap">{formatMonthShort(point.period_start)}</span>
          {point.isCurrent ? ' · в процессе' : ''}
        </div>
        {managers.map((manager) => {
          const value = point[manager]
          if (typeof value !== 'number' || value <= 0) return null
          return (
            <div key={manager} className="chart-tooltip__row">
              <span className="chart-tooltip__swatch" style={{ background: colorMap.get(manager) }} />
              <span className="chart-tooltip__row-label">{manager}</span>
              <span className="chart-tooltip__row-value">{formatRub(value)}</span>
            </div>
          )
        })}
        <div className="chart-tooltip__value chart-tooltip__total">Итого: {formatRub(point.total)}</div>
      </div>
    )
  }
}

interface ManagerStackChartProps {
  months: ManagerMonthlyMrr[]
  managers: string[]
  colorMap: Map<string, string>
  /** Клик по столбцу/месяцу — например, чтобы переключить панель «почему MRR изменился». */
  onPointClick?: (periodStart: string) => void
  /** Опорный месяц дашборда — подсвечивается на графике оранжевым кольцом/линией. */
  anchorPeriod?: string | null
}

/** Стек MRR по менеджерам за месяц — тело графика без карточки/заголовка,
 * используется MrrChartSection в режиме «По менеджерам». */
export function ManagerStackChart({ months, managers, colorMap, onPointClick, anchorPeriod }: ManagerStackChartProps) {
  const data = buildStackData(months, managers)
  const StackTooltip = makeStackTooltip(managers, colorMap)

  if (data.length === 0) {
    return <p className="state-msg">Нет данных за выбранный период</p>
  }

  const hasAnchor = anchorPeriod != null && data.some((d) => d.period_start === anchorPeriod)

  return (
    <>
      <div className="chart-legend">
        {managers.map((manager) => (
          <span key={manager} className="chart-legend__item">
            <span className="chart-legend__swatch" style={{ background: colorMap.get(manager) }} />
            {manager}
          </span>
        ))}
      </div>
      <div className="chart-scroll">
        <ResponsiveContainer width="100%" height={360} minWidth={Math.max(360, data.length * 44)}>
          <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 32 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="period_start"
              tickFormatter={formatMonthShort}
              tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
              interval={0}
              angle={-40}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompactRub(v)}
              tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={StackTooltip} cursor={{ fill: 'var(--color-bg)' }} />
            {hasAnchor && <ReferenceLine x={anchorPeriod ?? undefined} stroke="var(--color-orange)" strokeDasharray="3 3" />}
            {managers.map((manager) => (
              <Bar key={manager} dataKey={manager} stackId="managers" fill={colorMap.get(manager)} isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fillOpacity={d.isCurrent ? 0.45 : 1}
                    stroke={d.period_start === anchorPeriod ? 'var(--color-orange)' : undefined}
                    strokeWidth={d.period_start === anchorPeriod ? 2 : undefined}
                    cursor={onPointClick ? 'pointer' : undefined}
                    onClick={() => onPointClick?.(d.period_start)}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
