import { useState } from 'react'
import { formatMonthFull, formatRub } from '../lib/format'
import { GroupToggle } from './GroupToggle'
import { MovementColumns } from './MovementColumns'
import type { MovementMonth } from '../lib/movement'

interface MrrMovementPanelProps {
  movement: MovementMonth | null
  isCurrent: boolean
  /** Переключатель «Список / По менеджерам» имеет смысл только при «Все менеджеры». */
  showGroupToggle: boolean
  managers: string[]
  colorMap: Map<string, string>
}

export function MrrMovementPanel({ movement, isCurrent, showGroupToggle, managers, colorMap }: MrrMovementPanelProps) {
  const [grouped, setGrouped] = useState(false)

  if (!movement) {
    return (
      <div className="card">
        <div className="card__title">Почему MRR изменился</div>
        <p className="state-msg">Нет данных о движении за опорный месяц</p>
      </div>
    )
  }

  const direction = movement.net_mrr >= 0 ? 'вырос' : 'упал'

  return (
    <div className="card">
      <div className="movement-panel__header">
        <div className="movement-panel__title">
          {formatMonthFull(movement.period_start)} · MRR {direction} на {formatRub(Math.abs(movement.net_mrr))}
        </div>
        <div className="movement-panel__header-controls">
          {showGroupToggle && !isCurrent && <GroupToggle grouped={grouped} onChange={setGrouped} />}
          {isCurrent && <span className="movement-panel__badge">в процессе</span>}
        </div>
      </div>

      {isCurrent ? (
        <p className="state-msg">Месяц ещё не закрыт — разбивка по контрактам появится после его завершения.</p>
      ) : (
        <MovementColumns
          movement={movement}
          grouped={showGroupToggle && grouped}
          managers={managers}
          colorMap={colorMap}
        />
      )}
    </div>
  )
}
