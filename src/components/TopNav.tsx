export type SectionId = 'dashboard' | 'database' | 'users'

interface SectionDef {
  id: SectionId
  label: string
}

// Верхний уровень навигации. Внутри «Дашборда» позже появятся свои экраны
// (сейчас там только «Обзор») — секции добавляются просто дописыванием сюда.
const SECTIONS: SectionDef[] = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'database', label: 'База' },
  { id: 'users', label: 'Пользователи' },
]

interface TopNavProps {
  active: SectionId
  onChange: (section: SectionId) => void
  username: string
  role: string
  onLogout: () => void
}

export function TopNav({ active, onChange, username, role, onLogout }: TopNavProps) {
  return (
    <nav className="top-nav">
      <span className="top-nav__brand">PRM Finance</span>
      <div className="top-nav__tabs">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`top-nav__tab${active === section.id ? ' top-nav__tab--active' : ''}`}
            onClick={() => onChange(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
      <div className="top-nav__spacer" />
      <div className="top-nav__user">
        <span>
          {username} ({role})
        </span>
        <button type="button" className="top-nav__logout" onClick={onLogout}>
          Выйти
        </button>
      </div>
    </nav>
  )
}
