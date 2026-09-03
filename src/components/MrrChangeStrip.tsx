import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, type TooltipContentProps } from 'recharts'
import { formatMonthShort, formatPercent } from '../lib/format'

export interface ChangePoint {
  period_start: string
  deltaPct: number | null
}

function ChangeTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as ChangePoint | undefined
  if (!point || point.deltaPct === null) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__month chart-tooltip__month-cap">{formatMonthShort(point.period_start)}</div>
      <div className="chart-tooltip__value">{formatPercent(point.deltaPct)} к прошлому месяцу</div>
    </div>
  )
}

export function MrrChangeStrip({ points }: { points: ChangePoint[] }) {
  if (points.length === 0) return null

  return (
    <div className="card">
      <div className="card__title">Изменение к прошлому месяцу</div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <XAxis dataKey="period_start" hide />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <ReferenceLine y={0} stroke="var(--color-border)" />
          <Tooltip content={ChangeTooltip} cursor={{ fill: 'var(--color-bg)' }} />
          <Bar dataKey="deltaPct" radius={2} isAnimationActive={false}>
            {points.map((p) => (
              <Cell
                key={p.period_start}
                fill={p.deltaPct === null ? 'transparent' : p.deltaPct >= 0 ? '#16A34A' : '#FF5D5D'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
