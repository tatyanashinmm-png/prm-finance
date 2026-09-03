export const ALL_MANAGERS = 'all'

interface ManagerFilterProps {
  managers: string[]
  value: string
  onChange: (value: string) => void
}

export function ManagerFilter({ managers, value, onChange }: ManagerFilterProps) {
  return (
    <div className="manager-filter">
      <span className="manager-filter__label">Менеджер</span>
      <select className="manager-filter__select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={ALL_MANAGERS}>Все менеджеры</option>
        {managers.map((manager) => (
          <option key={manager} value={manager}>
            {manager}
          </option>
        ))}
      </select>
    </div>
  )
}
