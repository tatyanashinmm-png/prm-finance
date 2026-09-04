import { useState, type ReactNode } from 'react'

interface CollapsibleGroupProps {
  header: ReactNode
  children: ReactNode
}

/** Блок группировки «По менеджерам» со сворачиванием — при большом числе
 * контрактов список из нескольких групп неудобно листать целиком, поэтому
 * каждую группу можно свернуть до одной строки заголовка с подытогом. */
export function CollapsibleGroup({ header, children }: CollapsibleGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="movement-group">
      <button type="button" className="movement-group__header movement-group__header--toggle" onClick={() => setCollapsed((v) => !v)}>
        <span className={`movement-group__chevron${collapsed ? ' movement-group__chevron--collapsed' : ''}`}>▾</span>
        {header}
      </button>
      {!collapsed && children}
    </div>
  )
}
