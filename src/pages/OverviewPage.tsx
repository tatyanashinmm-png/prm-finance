import { useEffect, useMemo, useState } from 'react'
import { PeriodFilter } from '../components/PeriodFilter'
import { KpiCard } from '../components/KpiCard'
import { MetricChart } from '../components/MetricChart'
import { MrrChangeStrip } from '../components/MrrChangeStrip'
import { formatRub } from '../lib/format'
import {
  computeDeltas,
  getLastClosedArpuKpi,
  getLastClosedMrrKpi,
  isCurrentMonth,
  isFutureMonth,
  type MonthlyMetric,
} from '../lib/metrics'
import { filterMonths, type PeriodSelection } from '../lib/period'

export function OverviewPage() {
  const [months, setMonths] = useState<MonthlyMetric[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PeriodSelection>({ kind: 'preset', preset: 'last12' })

  useEffect(() => {
    fetch('/api/metrics/monthly')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setMonths(data.months))
      .catch((err) => setError(String(err)))
  }, [])

  const filtered = useMemo(() => (months ? filterMonths(months, selection) : []), [months, selection])
  const mrrKpi = useMemo(() => (months ? getLastClosedMrrKpi(months) : null), [months])
  const arpuKpi = useMemo(() => (months ? getLastClosedArpuKpi(months) : null), [months])
  const changePoints = useMemo(() => {
    if (!months) return []
    const deltas = computeDeltas(months)
    return filtered
      .filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
      .map((m) => ({ period_start: m.period_start, deltaPct: deltas.get(m.period_start) ?? null }))
  }, [months, filtered])

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Обзор</h1>
        <PeriodFilter value={selection} onChange={setSelection} />
      </div>

      {error && <p className="state-msg state-msg--error">Ошибка загрузки: {error}</p>}
      {!error && !months && <p className="state-msg">Загрузка…</p>}

      {months && (
        <>
          <div className="kpi-row">
            <KpiCard label="MRR" kpi={mrrKpi} formatValue={(v) => formatRub(v)} emptyMessage="Нет ни одного закрытого месяца" />
            <KpiCard label="ARPU" kpi={arpuKpi} formatValue={(v) => formatRub(v)} emptyMessage="Нет ни одного закрытого месяца" />
          </div>
          <MetricChart months={filtered} title="MRR по месяцам" metricLabel="MRR" getValue={(m) => m.mrr} />
          <MrrChangeStrip points={changePoints} />
          <MetricChart months={filtered} title="ARPU по месяцам" metricLabel="ARPU" getValue={(m) => m.arpu} />
        </>
      )}
    </div>
  )
}
