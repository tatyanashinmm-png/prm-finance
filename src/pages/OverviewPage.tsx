import { useEffect, useMemo, useRef, useState } from 'react'
import { PeriodFilter } from '../components/PeriodFilter'
import { ManagerFilter, ALL_MANAGERS } from '../components/ManagerFilter'
import { KpiCard } from '../components/KpiCard'
import { CountKpiCard } from '../components/CountKpiCard'
import { MovementKpiCard } from '../components/MovementKpiCard'
import { MetricChart } from '../components/MetricChart'
import { MrrChartSection } from '../components/MrrChartSection'
import { MrrChangeStrip } from '../components/MrrChangeStrip'
import { MrrMovementPanel } from '../components/MrrMovementPanel'
import { MovementDrillThrough, type DrillKind } from '../components/MovementDrillThrough'
import { MrrArpuDrillThrough, type MetricDrillKind } from '../components/MrrArpuDrillThrough'
import { formatMonthFull, formatMonthShort, formatPercent, formatRub } from '../lib/format'
import { computeDeltas, getKpiAtPeriod, isCurrentMonth, isFutureMonth, type MonthlyMetric } from '../lib/metrics'
import { filterMonths, type PeriodSelection } from '../lib/period'
import { collectManagers, buildManagerColorMap, type ManagerMonthlyMrr } from '../lib/managerMrr'
import { filterMovementByManager, getMovementDeltasAtPeriod, splitChurnByStatus, type MovementMonth } from '../lib/movement'

const EMPTY_MSG = 'Нет данных за опорный месяц'

// Должно совпадать с длительностью transition у .drilldown в src/index.css —
// контент панели размонтируется только после того, как она доедет за правый
// край экрана, иначе при закрытии видно, как таблица исчезает раньше панели.
const DRILL_CLOSE_ANIMATION_MS = 260

/** Значение того же поля за предыдущий (по хронологии в массиве) месяц —
 * для подписи "к июлю: N ₽" под маленькими KPI-карточками (шаг D.4a).
 * Ищем в ПОЛНОМ (не обрезанном фильтром периода) ряду, чтобы предыдущий
 * месяц находился, даже если сам он выпал из выбранного диапазона. */
function findPrevValue<T extends { period_start: string }>(
  months: T[],
  anchorPeriod: string,
  getValue: (m: T) => number | null,
): { label: string; value: number | null } | null {
  const idx = months.findIndex((m) => m.period_start === anchorPeriod)
  if (idx <= 0) return null
  const prev = months[idx - 1]
  return { label: formatMonthShort(prev.period_start), value: getValue(prev) }
}

/** Точки для .sparkline hero-карточки MRR — реальные последние месяцы,
 * не демо из мокапа. Нормализуем в 0..height (SVG y растёт вниз, поэтому
 * большее значение -> меньший y). */
function buildSparklinePoints(values: number[], width = 220, height = 42): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

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
  // Открытая drill-детализация — теперь slideover справа поверх «Обзора»
  // (шаг D.4c), а не отдельный экран: `drill` держит контент смонтированным,
  // `drillVisible` — управляет классом .show (анимация выезда/закрытия).
  const [drill, setDrill] = useState<DrillKind | MetricDrillKind | null>(null)
  const [drillVisible, setDrillVisible] = useState(false)
  const drillCloseTimer = useRef<number | null>(null)

  function openDrill(kind: DrillKind | MetricDrillKind) {
    if (drillCloseTimer.current !== null) {
      window.clearTimeout(drillCloseTimer.current)
      drillCloseTimer.current = null
    }
    setDrill(kind)
    // Монтируем панель ещё закрытой (translateX(100%) в CSS), затем на
    // следующем кадре включаем .show — иначе transform-переход не проиграется.
    requestAnimationFrame(() => setDrillVisible(true))
  }

  function closeDrill() {
    setDrillVisible(false)
    drillCloseTimer.current = window.setTimeout(() => {
      setDrill(null)
      drillCloseTimer.current = null
    }, DRILL_CLOSE_ANIMATION_MS)
  }

  useEffect(() => {
    return () => {
      if (drillCloseTimer.current !== null) window.clearTimeout(drillCloseTimer.current)
    }
  }, [])

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
  // Разбивка карточки «Отток» по статусу контракта — поверх ядрового
  // (мягкого) оттока, сама формула churn_count/churn_mrr не меняется.
  const churnStatusSplit = useMemo(
    () => (movementAtAnchor ? splitChurnByStatus(movementAtAnchor.churn_contracts) : null),
    [movementAtAnchor],
  )

  // Спарклайн hero-карточки MRR — последние 4 закрытых/текущих месяца (та же
  // пропорция, что в мокапе "Май → Август"), независимо от выбранного
  // диапазона периода (это отдельный маленький обзорный тренд, не график ниже).
  const sparklineMonths = useMemo(() => {
    if (!activeMrrMonths) return []
    return activeMrrMonths.filter((m) => !isFutureMonth(m.period_start)).slice(-4)
  }, [activeMrrMonths])
  const sparklinePoints = useMemo(() => buildSparklinePoints(sparklineMonths.map((m) => m.mrr)), [sparklineMonths])
  const sparklineCaption =
    sparklineMonths.length > 0
      ? `${formatMonthShort(sparklineMonths[0].period_start)} → ${formatMonthShort(sparklineMonths[sparklineMonths.length - 1].period_start)}, ₽`
      : ''

  const mrrPrev = useMemo(
    () => (activeMrrMonths && anchorPeriod ? findPrevValue(activeMrrMonths, anchorPeriod, (m) => m.mrr) : null),
    [activeMrrMonths, anchorPeriod],
  )
  const arpuPrev = useMemo(
    () => (months && anchorPeriod ? findPrevValue(months, anchorPeriod, (m) => m.arpu) : null),
    [months, anchorPeriod],
  )

  const ready = months !== null && managerMonths !== null && movementMonths !== null

  return (
    <>
    <div className="page">
      <div className="dash-topbar">
        <h1 className="page__title">Обзор</h1>
        <div className="dash-topbar__filters">
          <ManagerFilter managers={managers} value={managerFilter} onChange={setManagerFilter} />
          <PeriodFilter value={selection} onChange={setSelection} />
        </div>
      </div>

      {error && <p className="state-msg state-msg--error">Ошибка загрузки: {error}</p>}
      {!error && !ready && <p className="state-msg">Загрузка…</p>}

      {ready && (
        <>
          <div className="kpi-row">
            <div
              className="hero-kpi"
              role={mrrKpi ? 'button' : undefined}
              tabIndex={mrrKpi ? 0 : undefined}
              onClick={mrrKpi ? () => openDrill('mrr') : undefined}
              onKeyDown={
                mrrKpi
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') openDrill('mrr')
                    }
                  : undefined
              }
            >
              <div className="top-row">
                <div className="label">
                  {anchorPeriod ? `MRR за ${monthOnly(anchorPeriod)}` : 'MRR'}
                  {isAnchorCurrent && <span className="badge-live">в процессе</span>}
                </div>
              </div>
              {mrrKpi ? (
                <>
                  <div>
                    <div className="value">{formatRub(mrrKpi.value)}</div>
                    {mrrKpi.deltaPct !== null && (
                      <span className={`delta ${isAnchorCurrent ? 'flat' : mrrKpi.deltaPct >= 0 ? 'up' : 'down'}`}>
                        {!isAnchorCurrent && (mrrKpi.deltaPct >= 0 ? '↑' : '↓')} {formatPercent(mrrKpi.deltaPct)}
                        {mrrPrev && ` к ${mrrPrev.label}`}
                      </span>
                    )}
                  </div>
                  {sparklinePoints && (
                    <div>
                      <svg className="sparkline" width="100%" height="42" viewBox="0 0 220 42" preserveAspectRatio="none">
                        <polyline points={sparklinePoints} fill="none" stroke="#5EEAD4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {sparklineCaption && <div className="caption">{sparklineCaption}</div>}
                    </div>
                  )}
                </>
              ) : (
                <p className="state-msg" style={{ color: '#B9BAE0' }}>
                  {EMPTY_MSG}
                </p>
              )}
            </div>

            {isAllManagers ? (
              <KpiCard
                label="ARPU"
                kpi={arpuKpi}
                formatValue={(v) => formatRub(v)}
                emptyMessage={EMPTY_MSG}
                muted={isAnchorCurrent}
                onClick={arpuKpi ? () => openDrill('arpu') : undefined}
                foot={arpuPrev && arpuPrev.value !== null ? `к ${arpuPrev.label}: ${formatRub(arpuPrev.value)}` : undefined}
              />
            ) : (
              <div className="kpi-card">
                <div className="label">ARPU</div>
                <p className="state-msg">Разбивка по менеджеру — позже</p>
              </div>
            )}
            <CountKpiCard
              label="Новые"
              value={movementAtAnchor?.new_count ?? null}
              delta={movementDeltas?.newCountDelta ?? null}
              isCurrent={isAnchorCurrent}
              emptyMessage={EMPTY_MSG}
              onClick={movementAtAnchor ? () => openDrill('new') : undefined}
              foot="оплативших впервые"
            />
            <CountKpiCard
              label="Отток"
              value={movementAtAnchor?.churn_count ?? null}
              delta={movementDeltas?.churnCountDelta ?? null}
              isCurrent={isAnchorCurrent}
              invert
              emptyMessage={EMPTY_MSG}
              onClick={movementAtAnchor ? () => openDrill('churn') : undefined}
              foot="перестали платить"
              breakdown={
                churnStatusSplit && churnStatusSplit.confirmed.length + churnStatusSplit.unpaidActive.length > 0 ? (
                  <div className="churn-breakdown">
                    в блоке: <span className="churn-breakdown__confirmed">{churnStatusSplit.confirmed.length}</span> · активны, не
                    оплатили: <span className="churn-breakdown__unpaid">{churnStatusSplit.unpaidActive.length}</span>
                  </div>
                ) : null
              }
            />
            <CountKpiCard
              label="Чистый приток"
              value={movementAtAnchor?.net_count ?? null}
              delta={movementDeltas?.netCountDelta ?? null}
              isCurrent={isAnchorCurrent}
              emptyMessage={EMPTY_MSG}
              onClick={movementAtAnchor ? () => openDrill('net_count') : undefined}
              foot="новые минус отток, шт"
            />
            <MovementKpiCard
              movement={movementAtAnchor}
              isCurrent={isAnchorCurrent}
              onClick={movementAtAnchor ? () => openDrill('net_mrr') : undefined}
            />
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

    {ready && drill && (drill === 'mrr' || drill === 'arpu') && (
      <MrrArpuDrillThrough
        kind={drill}
        month={anchorPeriod!}
        isCurrent={isAnchorCurrent}
        showGroupToggle={isAllManagers}
        managers={managers}
        colorMap={colorMap}
        managerFilter={managerFilter}
        open={drillVisible}
        onBack={closeDrill}
      />
    )}
    {ready && drill && drill !== 'mrr' && drill !== 'arpu' && (
      <MovementDrillThrough
        kind={drill}
        movement={movementAtAnchor}
        isCurrent={isAnchorCurrent}
        showGroupToggle={isAllManagers}
        managers={managers}
        colorMap={colorMap}
        open={drillVisible}
        onBack={closeDrill}
      />
    )}
    </>
  )
}

/** "2026-08-01" -> "август" (для подписи hero-карточки "MRR за август"). */
function monthOnly(periodStart: string): string {
  return formatMonthFull(periodStart).split(' ')[0].toLowerCase()
}
