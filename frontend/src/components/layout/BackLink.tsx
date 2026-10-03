'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { hasInAppHistory } from '../../lib/inAppHistory'

/**
 * «Назад»: пришли с нашей страницы — шаг назад по истории (категория вернётся с фильтрами и прокруткой),
 * пришли извне (поисковик, ссылка) — переход на fallbackHref. Это ссылка, поэтому работает и без JS
 */
export function BackLink({ fallbackHref }: { fallbackHref: string }) {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <Link
      href={fallbackHref}
      onClick={(event) => {
        if (!hasInAppHistory() || event.metaKey || event.ctrlKey || event.shiftKey) return
        event.preventDefault()
        router.back()
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-control border border-line py-1.5 pr-3 pl-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
    >
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
        <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {t('nav.back')}
    </Link>
  )
}
