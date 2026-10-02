'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'

type SheetProps = {
  open: boolean
  /** Esc, клик по затемнению, кнопка «Закрыть» — родитель ставит open=false */
  onClose: () => void
  title: string
  children: ReactNode
  /** Липкий низ: «Сбросить» / «Показать» — растягиваются поровну */
  footer?: ReactNode
  testId?: string
}

/** Нижняя шторка на нативном <dialog>: фокус-ловушка, Esc и возврат фокуса — от браузера */
export function Sheet({ open, onClose, title, children, footer, testId }: SheetProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      // close приходит и от Esc — так родитель узнаёт, что шторка закрыта
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-full flex-col rounded-t-2xl bg-card p-0 text-ink shadow-sheet backdrop:bg-ink/40 open:flex"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line py-1 pr-2 pl-4">
        <h2 id={titleId} className="text-h3">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
      {footer && (
        <div className="flex gap-2 border-t border-line px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] *:flex-1">{footer}</div>
      )}
    </dialog>
  )
}
