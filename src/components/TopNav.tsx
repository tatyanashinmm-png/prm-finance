export type TabId = 'mrr' | 'movement' | 'arpu' | 'overview' | 'contracts'

interface TabDef {
  id: TabId
  label: string
  enabled: boolean
}

// Каркас на будущее: новые вкладки просто добавляются в этот список.
// enabled: false — показана приглушённой, кликнуть нельзя.
const TABS: TabDef[] = [
  { id: 'mrr', label: 'MRR', enabled: true },
  { id: 'movement', label: 'Движение', enabled: false },
  { id: 'arpu', label: 'ARPU', enabled: false },
  { id: 'overview', label: 'Обзор', enabled: false },
  { id: 'contracts', label: 'Контракты', enabled: true },
]

interface TopNavProps {
  active: TabId
  onChange: (tab: TabId) => void
  username: string
  role: string
  onLogout: () => void
}

export function TopNav({ active, onChange, username, role, onLogout }: TopNavProps) {
  return (
    <nav className="top-nav">
      <span className="top-nav__brand">PRM Finance</span>
      <div className="top-nav__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`top-nav__tab${active === tab.id ? ' top-nav__tab--active' : ''}`}
            disabled={!tab.enabled}
            title={tab.enabled ? undefined : 'скоро'}
            onClick={() => tab.enabled && onChange(tab.id)}
          >
            {tab.label}
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
