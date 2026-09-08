import type { ReactElement } from 'react'

export type SectionId = 'dashboard' | 'database' | 'users'

interface SectionDef {
  id: SectionId
  label: string
  icon: ReactElement
}

// Иконки — 1:1 из мокапа (dashboard-overview.html/clients.html), только вид,
// внутренние ключи секций (dashboard/database/users) не меняются — App.tsx
// продолжает переключать те же три страницы, что и раньше через TopNav.
const SECTIONS: SectionDef[] = [
  {
    id: 'dashboard',
    label: 'Дашборд',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 13h4v8H3zM10 3h4v18h-4zM17 8h4v13h-4z" />
      </svg>
    ),
  },
  {
    id: 'database',
    label: 'Клиенты',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </svg>
    ),
  },
  {
    id: 'users',
    label: 'Пользователи',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 9c1.8.2 3 1.5 3 3M22 20c0-2.6-1.7-4.6-4-5.4" />
      </svg>
    ),
  },
]

interface SidebarProps {
  active: SectionId
  onChange: (section: SectionId) => void
}

/** Вертикальный навбар по мокапу (шаг D.1) — заменяет горизонтальный TopNav.
 * «Настройки» из мокапа сознательно не добавлены (вести некуда) — .spacer
 * оставлен, чтобы будущий пункт снизу не потребовал перекройки разметки. */
export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="mark">P</div>
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`nav-item${active === section.id ? ' active' : ''}`}
          onClick={() => onChange(section.id)}
        >
          {section.icon}
          <span>{section.label}</span>
        </button>
      ))}
      <div className="spacer" />
    </nav>
  )
}
