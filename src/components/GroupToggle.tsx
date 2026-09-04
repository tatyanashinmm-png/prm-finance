interface GroupToggleProps {
  grouped: boolean
  onChange: (grouped: boolean) => void
}

/** Переключатель «Список / По менеджерам» — переиспользуется панелью «почему»
 * и drill-through по карточкам движения. */
export function GroupToggle({ grouped, onChange }: GroupToggleProps) {
  return (
    <div className="period-filter">
      <button
        type="button"
        className={`period-filter__btn${!grouped ? ' period-filter__btn--active' : ''}`}
        onClick={() => onChange(false)}
      >
        Список
      </button>
      <button
        type="button"
        className={`period-filter__btn${grouped ? ' period-filter__btn--active' : ''}`}
        onClick={() => onChange(true)}
      >
        По менеджерам
      </button>
    </div>
  )
}
