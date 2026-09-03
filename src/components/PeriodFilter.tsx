import { MonthPicker } from './MonthPicker'
import { currentMonthStart } from '../lib/metrics'
import { defaultCustomRange, PERIOD_PRESETS, type PeriodSelection } from '../lib/period'

interface PeriodFilterProps {
  value: PeriodSelection
  onChange: (selection: PeriodSelection) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const isCustom = value.kind === 'custom'

  return (
    <div className="period-filter-wrap">
      <div className="period-filter">
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`period-filter__btn${
              value.kind === 'preset' && value.preset === preset.id ? ' period-filter__btn--active' : ''
            }`}
            onClick={() => onChange({ kind: 'preset', preset: preset.id })}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`period-filter__btn${isCustom ? ' period-filter__btn--active' : ''}`}
          onClick={() => onChange({ kind: 'custom', ...defaultCustomRange() })}
        >
          Свой период
        </button>
      </div>
      {isCustom && (
        <div className="period-custom">
          <MonthPicker
            label="с"
            value={value.start}
            maxMonth={currentMonthStart()}
            onChange={(start) => onChange({ kind: 'custom', start, end: value.end })}
          />
          <MonthPicker
            label="по"
            value={value.end}
            maxMonth={currentMonthStart()}
            onChange={(end) => onChange({ kind: 'custom', start: value.start, end })}
          />
        </div>
      )}
    </div>
  )
}
