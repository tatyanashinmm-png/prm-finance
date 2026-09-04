interface ContractSearchInputProps {
  value: string
  onChange: (value: string) => void
}

/** Поиск по клиенту/номеру контракта — во всех drill-through экранах. */
export function ContractSearchInput({ value, onChange }: ContractSearchInputProps) {
  return (
    <div className="drill-search">
      <input
        type="text"
        className="drill-search__input"
        placeholder="Поиск по клиенту или номеру контракта"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="drill-search__clear" onClick={() => onChange('')} aria-label="Очистить поиск">
          ×
        </button>
      )}
    </div>
  )
}
