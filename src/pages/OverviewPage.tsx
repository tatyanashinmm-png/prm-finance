import { useEffect, useMemo, useState } from 'react'
import { PeriodFilter } from '../components/PeriodFilter'
import { MrrKpiCard } from '../components/MrrKpiCard'
import { MrrChart } from '../components/MrrChart'
import { MrrChangeStrip } from '../components/MrrChangeStrip'
import { computeDeltas, getLastClosedKpi, isCurrentMonth, isFutureMonth, type MonthlyMetric } from '../lib/metrics'
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
  const kpi = useMemo(() => (months ? getLastClosedKpi(months) : null), [months])
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
          <MrrKpiCard kpi={kpi} />
          <MrrChart months={filtered} />
          <MrrChangeStrip points={changePoints} />
        </>
      )}
    </div>
  )
}
