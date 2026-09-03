import { useEffect, useRef, useState } from 'react'

const MONTHS_RU_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

interface MonthPickerProps {
  value: string // "YYYY-MM-01"
  onChange: (value: string) => void
  /** "YYYY-MM-01" — месяцы позже недоступны для выбора (используем, чтобы не пускать в будущее). */
  maxMonth?: string
  label?: string
}

export function MonthPicker({ value, onChange, maxMonth, label }: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [selYear, selMonth] = value.split('-').map(Number)
  const [viewYear, setViewYear] = useState(selYear)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const maxYear = maxMonth ? Number(maxMonth.slice(0, 4)) : undefined
  const maxMonthNum = maxMonth ? Number(maxMonth.slice(5, 7)) : undefined
  const yearAtMax = maxYear !== undefined && viewYear >= maxYear

  return (
    <div className="month-picker" ref={rootRef}>
      {label && <span className="month-picker__label">{label}</span>}
      <button
        type="button"
        className="month-picker__trigger"
        onClick={() => {
          setViewYear(selYear)
          setOpen((o) => !o)
        }}
      >
        {MONTHS_RU_SHORT[selMonth - 1]} {selYear}
      </button>
      {open && (
        <div className="month-picker__popover">
          <div className="month-picker__nav">
            <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="Предыдущий год">
              ‹
            </button>
            <span>{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              disabled={yearAtMax}
              aria-label="Следующий год"
            >
              ›
            </button>
          </div>
          <div className="month-picker__grid">
            {MONTHS_RU_SHORT.map((m, i) => {
              const monthNum = i + 1
              const disabled =
                maxYear !== undefined && (viewYear > maxYear || (viewYear === maxYear && monthNum > (maxMonthNum ?? 12)))
              const isSelected = viewYear === selYear && monthNum === selMonth
              return (
                <button
                  key={m}
                  type="button"
                  className={`month-picker__cell${isSelected ? ' month-picker__cell--active' : ''}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange(`${viewYear}-${String(monthNum).padStart(2, '0')}-01`)
                    setOpen(false)
                  }}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
