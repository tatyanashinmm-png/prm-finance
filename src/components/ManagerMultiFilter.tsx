import { useEffect, useRef, useState } from 'react'

interface ManagerMultiFilterProps {
  managers: string[]
  value: string[]
  onChange: (value: string[]) => void
}

/** Множественный фильтр менеджера (шаг 2.3) — в отличие от ManagerFilter
 * (одиночный select), здесь можно выбрать несколько сразу: /api/clients
 * принимает повторяющиеся ?manager=. Пустой value = фильтр не применяется
 * (показываем всех), а не "ни одного". Попап + клик вне закрывает его —
 * тот же паттерн, что уже есть в MonthPicker. */
export function ManagerMultiFilter({ managers, value, onChange }: ManagerMultiFilterProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const toggle = (manager: string) => {
    if (value.includes(manager)) onChange(value.filter((m) => m !== manager))
    else onChange([...value, manager])
  }

  const label = value.length === 0 ? 'Все менеджеры' : value.length === 1 ? value[0] : `Менеджеры: ${value.length}`

  return (
    <div className="manager-multi-filter" ref={rootRef}>
      <span className="manager-filter__label">Менеджер</span>
      <button type="button" className="manager-multi-filter__trigger" onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="manager-multi-filter__popover">
          <label className="manager-multi-filter__option">
            <input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} />
            Все менеджеры
          </label>
          <div className="manager-multi-filter__divider" />
          {managers.map((manager) => (
            <label key={manager} className="manager-multi-filter__option">
              <input type="checkbox" checked={value.includes(manager)} onChange={() => toggle(manager)} />
              {manager}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
