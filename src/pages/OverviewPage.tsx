import { useEffect, useMemo, useState } from 'react'
import { PeriodFilter } from '../components/PeriodFilter'
import { ManagerFilter, ALL_MANAGERS } from '../components/ManagerFilter'
import { KpiCard } from '../components/KpiCard'
import { MetricChart } from '../components/MetricChart'
import { MrrChartSection } from '../components/MrrChartSection'
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
import { collectManagers, buildManagerColorMap, type ManagerMonthlyMrr } from '../lib/managerMrr'

export function OverviewPage() {
  const [months, setMonths] = useState<MonthlyMetric[] | null>(null)
  const [managerMonths, setManagerMonths] = useState<ManagerMonthlyMrr[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PeriodSelection>({ kind: 'preset', preset: 'last12' })
  const [managerFilter, setManagerFilter] = useState<string>(ALL_MANAGERS)

  useEffect(() => {
    Promise.all([
      fetch('/api/metrics/monthly').then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      }),
      fetch('/api/metrics/mrr-by-manager').then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      }),
    ])
      .then(([monthlyData, byManagerData]) => {
        setMonths(monthlyData.months)
        setManagerMonths(byManagerData.months)
      })
      .catch((err) => setError(String(err)))
  }, [])

  const isAllManagers = managerFilter === ALL_MANAGERS

  const managers = useMemo(() => (managerMonths ? collectManagers(managerMonths) : []), [managerMonths])
  const colorMap = useMemo(() => buildManagerColorMap(managers), [managers])

  // MRR конкретного менеджера — синтетический ряд той же формы MonthlyMetric,
  // чтобы без изменений переиспользовать KpiCard/MetricLineChart/getLastClosedMrrKpi.
  const managerMrrView = useMemo<MonthlyMetric[] | null>(() => {
    if (!managerMonths || isAllManagers) return null
    return managerMonths.map((m) => ({
      period_start: m.period_start,
      mrr: m.by_manager.find((bm) => bm.manager === managerFilter)?.mrr ?? 0,
      arpu: null,
      issued_amount: 0,
      issued_count: 0,
      paid_count: 0,
    }))
  }, [managerMonths, managerFilter, isAllManagers])

  const activeMrrMonths = isAllManagers ? months : managerMrrView

  const filtered = useMemo(() => (activeMrrMonths ? filterMonths(activeMrrMonths, selection) : []), [activeMrrMonths, selection])
  const filteredManagerMonths = useMemo(
    () => (managerMonths ? filterMonths(managerMonths, selection) : []),
    [managerMonths, selection],
  )
  const mrrKpi = useMemo(() => (activeMrrMonths ? getLastClosedMrrKpi(activeMrrMonths) : null), [activeMrrMonths])
  const arpuKpi = useMemo(() => (months ? getLastClosedArpuKpi(months) : null), [months])
  const changePoints = useMemo(() => {
    if (!activeMrrMonths) return []
    const deltas = computeDeltas(activeMrrMonths)
    return filtered
      .filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
      .map((m) => ({ period_start: m.period_start, deltaPct: deltas.get(m.period_start) ?? null }))
  }, [activeMrrMonths, filtered])

  const ready = months !== null && managerMonths !== null

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Обзор</h1>
        <div className="page__filters">
          <ManagerFilter managers={managers} value={managerFilter} onChange={setManagerFilter} />
          <PeriodFilter value={selection} onChange={setSelection} />
        </div>
      </div>

      {error && <p className="state-msg state-msg--error">Ошибка загрузки: {error}</p>}
      {!error && !ready && <p className="state-msg">Загрузка…</p>}

      {ready && (
        <>
          <div className="kpi-row">
            <KpiCard label="MRR" kpi={mrrKpi} formatValue={(v) => formatRub(v)} emptyMessage="Нет ни одного закрытого месяца" />
            {isAllManagers ? (
              <KpiCard label="ARPU" kpi={arpuKpi} formatValue={(v) => formatRub(v)} emptyMessage="Нет ни одного закрытого месяца" />
            ) : (
              <div className="card kpi-card metric-card--muted">
                <div className="kpi-card__label">ARPU</div>
                <p className="state-msg">Разбивка по менеджеру — позже</p>
              </div>
            )}
          </div>

          <MrrChartSection
            isAllManagers={isAllManagers}
            months={filtered}
            managerMonths={filteredManagerMonths}
            managers={managers}
            colorMap={colorMap}
          />
          <MrrChangeStrip points={changePoints} />

          {isAllManagers ? (
            <MetricChart months={filtered} title="ARPU по месяцам" metricLabel="ARPU" getValue={(m) => m.arpu} />
          ) : (
            <div className="card metric-card--muted">
              <div className="card__title">ARPU по месяцам</div>
              <p className="state-msg">Разбивка по менеджеру — позже</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
