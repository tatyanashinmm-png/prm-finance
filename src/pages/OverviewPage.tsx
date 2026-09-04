import { useEffect, useMemo, useState } from 'react'
import { PeriodFilter } from '../components/PeriodFilter'
import { ManagerFilter, ALL_MANAGERS } from '../components/ManagerFilter'
import { KpiCard } from '../components/KpiCard'
import { CountKpiCard } from '../components/CountKpiCard'
import { MovementKpiCard } from '../components/MovementKpiCard'
import { MetricChart } from '../components/MetricChart'
import { MrrChartSection } from '../components/MrrChartSection'
import { MrrChangeStrip } from '../components/MrrChangeStrip'
import { MrrMovementPanel } from '../components/MrrMovementPanel'
import { formatMonthFull, formatRub } from '../lib/format'
import { computeDeltas, getKpiAtPeriod, isCurrentMonth, isFutureMonth, type MonthlyMetric } from '../lib/metrics'
import { filterMonths, type PeriodSelection } from '../lib/period'
import { collectManagers, buildManagerColorMap, type ManagerMonthlyMrr } from '../lib/managerMrr'
import { filterMovementByManager, getMovementDeltasAtPeriod, type MovementMonth } from '../lib/movement'

const EMPTY_MSG = 'Нет данных за опорный месяц'

export function OverviewPage() {
  const [months, setMonths] = useState<MonthlyMetric[] | null>(null)
  const [managerMonths, setManagerMonths] = useState<ManagerMonthlyMrr[] | null>(null)
  const [movementMonths, setMovementMonths] = useState<MovementMonth[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PeriodSelection>({ kind: 'preset', preset: 'last12' })
  const [managerFilter, setManagerFilter] = useState<string>(ALL_MANAGERS)
  // Ручной выбор опорного месяца (клик по графику) — переопределяет
  // автоматический расчёт (последний закрытый месяц в выбранном периоде).
  const [manualAnchorPeriod, setManualAnchorPeriod] = useState<string | null>(null)

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
      fetch('/api/metrics/movement').then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      }),
    ])
      .then(([monthlyData, byManagerData, movementData]) => {
        setMonths(monthlyData.months)
        setManagerMonths(byManagerData.months)
        setMovementMonths(movementData.months)
      })
      .catch((err) => setError(String(err)))
  }, [])

  // При смене диапазона периода сбрасываем ручной выбор опорного месяца —
  // кликнутая ранее точка может выпасть из нового диапазона.
  useEffect(() => {
    setManualAnchorPeriod(null)
  }, [selection])

  const isAllManagers = managerFilter === ALL_MANAGERS

  const managers = useMemo(() => (managerMonths ? collectManagers(managerMonths) : []), [managerMonths])
  const colorMap = useMemo(() => buildManagerColorMap(managers), [managers])

  // MRR конкретного менеджера — синтетический ряд той же формы MonthlyMetric,
  // чтобы без изменений переиспользовать KpiCard/MetricLineChart/getKpiAtPeriod.
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
  const changePoints = useMemo(() => {
    if (!activeMrrMonths) return []
    const deltas = computeDeltas(activeMrrMonths)
    return filtered
      .filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
      .map((m) => ({ period_start: m.period_start, deltaPct: deltas.get(m.period_start) ?? null }))
  }, [activeMrrMonths, filtered])

  // Движение — пересчитано на срез менеджера при конкретном выборе (фильтруем
  // new_contracts/churn_contracts по manager и пересчитываем штуки/суммы —
  // никакой новой формулы, та же сумма tariff, что и в ядре).
  const activeMovementMonths = useMemo(() => {
    if (!movementMonths) return null
    return isAllManagers ? movementMonths : movementMonths.map((m) => filterMovementByManager(m, managerFilter))
  }, [movementMonths, isAllManagers, managerFilter])

  // Опорный месяц: ручной выбор (клик по графику) — либо последний ЗАКРЫТЫЙ
  // месяц внутри выбранного периода, либо (если в периоде нет закрытых —
  // например период кончается текущим месяцем) последний месяц периода.
  const anchorPeriod = useMemo(() => {
    if (manualAnchorPeriod) return manualAnchorPeriod
    const closed = filtered.filter((m) => !isCurrentMonth(m.period_start) && !isFutureMonth(m.period_start))
    if (closed.length > 0) return closed[closed.length - 1].period_start
    return filtered.length > 0 ? filtered[filtered.length - 1].period_start : null
  }, [filtered, manualAnchorPeriod])

  const isAnchorCurrent = anchorPeriod ? isCurrentMonth(anchorPeriod) : false

  const mrrKpi = useMemo(
    () => (activeMrrMonths && anchorPeriod ? getKpiAtPeriod(activeMrrMonths, anchorPeriod, (m) => m.mrr) : null),
    [activeMrrMonths, anchorPeriod],
  )
  const arpuKpi = useMemo(
    () => (months && anchorPeriod ? getKpiAtPeriod(months, anchorPeriod, (m) => m.arpu) : null),
    [months, anchorPeriod],
  )
  const movementAtAnchor = useMemo(
    () => (activeMovementMonths && anchorPeriod ? (activeMovementMonths.find((m) => m.period_start === anchorPeriod) ?? null) : null),
    [activeMovementMonths, anchorPeriod],
  )
  const movementDeltas = useMemo(
    () => (activeMovementMonths && anchorPeriod ? getMovementDeltasAtPeriod(activeMovementMonths, anchorPeriod) : null),
    [activeMovementMonths, anchorPeriod],
  )

  const ready = months !== null && managerMonths !== null && movementMonths !== null

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
          {anchorPeriod && (
            <div className="anchor-banner">
              Показатели за: {formatMonthFull(anchorPeriod)}
              {isAnchorCurrent && <span className="movement-panel__badge">в процессе</span>}
            </div>
          )}

          <div className="kpi-row">
            <KpiCard label="MRR" kpi={mrrKpi} formatValue={(v) => formatRub(v)} emptyMessage={EMPTY_MSG} muted={isAnchorCurrent} />
            {isAllManagers ? (
              <KpiCard
                label="ARPU"
                kpi={arpuKpi}
                formatValue={(v) => formatRub(v)}
                emptyMessage={EMPTY_MSG}
                muted={isAnchorCurrent}
              />
            ) : (
              <div className="card kpi-card metric-card--muted">
                <div className="kpi-card__label">ARPU</div>
                <p className="state-msg">Разбивка по менеджеру — позже</p>
              </div>
            )}
            <CountKpiCard
              label="Новые"
              value={movementAtAnchor?.new_count ?? null}
              delta={movementDeltas?.newCountDelta ?? null}
              isCurrent={isAnchorCurrent}
              emptyMessage={EMPTY_MSG}
            />
            <CountKpiCard
              label="Отток"
              value={movementAtAnchor?.churn_count ?? null}
              delta={movementDeltas?.churnCountDelta ?? null}
              isCurrent={isAnchorCurrent}
              invert
              emptyMessage={EMPTY_MSG}
            />
            <CountKpiCard
              label="Чистый приток"
              value={movementAtAnchor?.net_count ?? null}
              delta={movementDeltas?.netCountDelta ?? null}
              isCurrent={isAnchorCurrent}
              emptyMessage={EMPTY_MSG}
            />
            <MovementKpiCard movement={movementAtAnchor} isCurrent={isAnchorCurrent} />
          </div>

          <MrrChartSection
            isAllManagers={isAllManagers}
            months={filtered}
            managerMonths={filteredManagerMonths}
            managers={managers}
            colorMap={colorMap}
            onPointClick={setManualAnchorPeriod}
            anchorPeriod={anchorPeriod}
          />
          <MrrMovementPanel
            movement={movementAtAnchor}
            isCurrent={isAnchorCurrent}
            showGroupToggle={isAllManagers}
            managers={managers}
            colorMap={colorMap}
          />
          <MrrChangeStrip points={changePoints} />

          {isAllManagers ? (
            <MetricChart
              months={filtered}
              title="ARPU по месяцам"
              metricLabel="ARPU"
              getValue={(m) => m.arpu}
              anchorPeriod={anchorPeriod}
            />
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
