import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function LoadingState() {
  const { t } = useTranslation()
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
        <Button onClick={onRetry} variant="solid">
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

type ButtonProps = {
  onClick: () => void
  variant?: 'solid' | 'outline'
  disabled?: boolean
  children: ReactNode
  testId?: string
}

export function Button({ onClick, variant = 'outline', disabled, children, testId }: ButtonProps) {
  const look =
    variant === 'solid' ? 'bg-ink text-page hover:bg-ink/85' : 'border border-line bg-page text-ink hover:border-ink'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`h-10 rounded-[var(--radius-control)] px-4 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-60 ${look}`}
    >
      {children}
    </button>
  )
}
