import { PERIOD_PRESETS, type PeriodPreset } from '../lib/period'

interface PeriodFilterProps {
  value: PeriodPreset
  onChange: (preset: PeriodPreset) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="period-filter">
      {PERIOD_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={`period-filter__btn${value === preset.id ? ' period-filter__btn--active' : ''}`}
          onClick={() => onChange(preset.id)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
