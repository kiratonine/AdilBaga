'use client'

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

/** С children — скелетон вместо текста; «Загружаем…» остаётся для скринридера */
export function LoadingState({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  if (children)
    return (
      <div role="status" aria-busy="true" data-testid="loading-state">
        <span className="sr-only">{t('state.loading')}</span>
        <div aria-hidden="true">{children}</div>
      </div>
    )
  return (
    <p role="status" data-testid="loading-state" className="py-16 text-muted">
      {t('state.loading')}
    </p>
  )
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" data-testid="error-state" className="flex flex-col items-start gap-4 py-16">
      <p className="max-w-[48ch]">{t('state.error')}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="primary">
          {t('state.retry')}
        </Button>
      )}
    </div>
  )
}

type EmptyProps = {
  title: string
  hint?: string
  action?: ReactNode
}

export function EmptyState({ title, hint, action }: EmptyProps) {
  return (
    <div data-testid="empty-state" className="flex flex-col items-start gap-2 rounded-[var(--radius-card)] bg-surface px-5 py-10 sm:px-8">
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="max-w-[52ch] text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

