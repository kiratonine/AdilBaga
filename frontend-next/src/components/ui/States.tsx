'use client'

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'

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

type CardProps = {
  icon: IconName
  testId?: string
  role?: 'alert'
  children: ReactNode
}

/** Белая карточка состояния по центру: иконка, текст, действие. Общая для ошибки, пустого результата и 404 */
export function StateCard({ icon, testId, role, children }: CardProps) {
  return (
    <div
      role={role}
      data-testid={testId}
      className="flex flex-col items-center gap-3 rounded-card bg-card px-5 py-10 text-center text-pretty sm:px-8 md:py-14"
    >
      <Icon name={icon} size={32} className="text-muted" />
      {children}
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <StateCard icon="alert" testId="error-state" role="alert">
      <p className="max-w-[48ch]">{t('state.error')}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" className="mt-1">
          {t('state.retry')}
        </Button>
      )}
    </StateCard>
  )
}

type EmptyProps = {
  title: string
  hint?: string
  action?: ReactNode
  icon?: IconName
}

export function EmptyState({ title, hint, action, icon = 'search' }: EmptyProps) {
  return (
    <StateCard icon={icon} testId="empty-state">
      <p className="text-h3">{title}</p>
      {hint && <p className="max-w-[52ch] text-muted">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </StateCard>
  )
}
