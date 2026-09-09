import { useEffect, type ReactNode } from 'react'

interface DrillSlideoverProps {
  /** Управляет классом .show (анимация выезда) — контент остаётся смонтированным
   * чуть дольше, чем open=true, чтобы доиграть анимацию закрытия (см. OverviewPage). */
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
}

/** Общая «рамка» drill-детализации — выезжающая справа панель (мокап:
 * .scrim + .drilldown). Сама детализация (поиск, группировка, таблицы) не
 * меняется — просто рендерится внутри .drilldown-body вместо целого экрана. */
export function DrillSlideover({ open, title, onClose, children }: DrillSlideoverProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <div className={`drilldown${open ? ' show' : ''}`} role="dialog" aria-modal="true">
        <div className="drilldown-head">
          <button type="button" className="back-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Назад к обзору
          </button>
          <h3>{title}</h3>
        </div>
        <div className="drilldown-body">{children}</div>
      </div>
    </>
  )
}
