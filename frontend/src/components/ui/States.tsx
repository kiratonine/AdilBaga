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
        <button
          type="button"
          onClick={onRetry}
          className="h-10 rounded-[var(--radius-control)] bg-ink px-4 text-sm font-medium text-page hover:bg-ink/85"
        >
          {t('state.retry')}
        </button>
      )}
    </div>
  )
}
