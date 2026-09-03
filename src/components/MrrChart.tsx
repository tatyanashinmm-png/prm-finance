import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  type TooltipContentProps,
  type DotItemDotProps,
} from 'recharts'
import { formatCompactRub, formatMonthShort, formatRub } from '../lib/format'
import { isCurrentMonth, type MonthlyMetric } from '../lib/metrics'

interface ChartPoint extends MonthlyMetric {
  isCurrent: boolean
  mrrClosed: number | null
  mrrTrend: number | null
}

function buildChartData(months: MonthlyMetric[]): ChartPoint[] {
  const currentIdx = months.findIndex((m) => isCurrentMonth(m.period_start))
  return months.map((m, i) => {
    const isCurrent = i === currentIdx
    return {
      ...m,
      isCurrent,
      mrrClosed: isCurrent ? null : m.mrr,
      mrrTrend: currentIdx >= 0 && (i === currentIdx || i === currentIdx - 1) ? m.mrr : null,
    }
  })
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as ChartPoint | undefined
  if (!point) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__month">
        <span className="chart-tooltip__month-cap">{formatMonthShort(point.period_start)}</span>
        {point.isCurrent ? ' · в процессе' : ''}
      </div>
      <div className="chart-tooltip__value">MRR: {formatRub(point.mrr, { decimals: true })}</div>
    </div>
  )
}

function ClosedDot(props: DotItemDotProps) {
  const { cx, cy, payload } = props
  const point = payload as ChartPoint
  if (point?.isCurrent || cx == null || cy == null) return null
  return <circle cx={cx} cy={cy} r={3} fill="#0C39FF" />
}

function TrendDot(props: DotItemDotProps) {
  const { cx, cy, payload } = props
  const point = payload as ChartPoint
  if (!point?.isCurrent || cx == null || cy == null) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="var(--color-surface)" stroke="#0C39FF" strokeWidth={2} />
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize={11} fill="var(--color-text-secondary)">
        в процессе
      </text>
    </g>
  )
}

export function MrrChart({ months }: { months: MonthlyMetric[] }) {
  const [showLabels, setShowLabels] = useState(false)
  const data = buildChartData(months)

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">MRR по месяцам</div>
        <label className="toggle">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          <span>Значения на графике</span>
        </label>
      </div>
      {data.length === 0 && <p className="state-msg">Нет данных за выбранный период</p>}
      {data.length > 0 && (
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 32 }}>
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
            <Tooltip content={ChartTooltip} />
            <Line
              type="monotone"
              dataKey="mrrClosed"
              stroke="#0C39FF"
              strokeWidth={2.5}
              dot={ClosedDot}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            >
              {showLabels && (
                <LabelList
                  dataKey="mrrClosed"
                  position="top"
                  formatter={(v) => (typeof v === 'number' ? formatCompactRub(v) : '')}
                  style={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                />
              )}
            </Line>
            <Line
              type="monotone"
              dataKey="mrrTrend"
              stroke="#0C39FF"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              dot={TrendDot}
              activeDot={{ r: 5 }}
              connectNulls
              legendType="none"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
