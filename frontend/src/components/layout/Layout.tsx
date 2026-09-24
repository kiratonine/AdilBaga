import { useTranslation } from 'react-i18next'
import { Outlet, ScrollRestoration } from 'react-router'
import { Footer } from './Footer'
import { Header } from './Header'

export function Layout() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Первый Tab — сразу к контенту, мимо поиска и навигации */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-[var(--radius-control)] focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-page"
      >
        {t('nav.skip')}
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="container-page flex-1 pt-8 focus:outline-none">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  )
}
