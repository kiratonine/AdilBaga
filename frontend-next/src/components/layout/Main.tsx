'use client'

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/** Первый Tab — сразу к контенту, мимо поиска и навигации */
export function SkipLink() {
  const { t } = useTranslation()
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-[var(--radius-control)] focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-card"
    >
      {t('nav.skip')}
    </a>
  )
}

/** Цель skip-link. Общая для страниц с шапкой и лендинга без неё */
export function Main({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="container-page flex-1 pt-8 focus:outline-none">
      {children}
    </main>
  )
}
