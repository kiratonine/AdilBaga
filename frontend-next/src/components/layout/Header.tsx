'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { navSection } from '../../lib/paths'
import { useHref } from '../../lib/useLang'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { SearchBox, SearchBoxFallback } from './SearchBox'

// Активный пункт — графит с подчёркиванием: зелёный в дизайн-коде только для выгоды
const navLink = (isActive: boolean) =>
  `relative flex h-10 items-center px-3 text-[15px] font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${
    isActive ? 'text-ink after:bg-ink' : 'text-muted hover:text-ink'
  }`

export function Header() {
  const { t } = useTranslation()
  const section = navSection(usePathname())
  const href = useHref()

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card">
      <div className="container-page grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 py-3 md:grid-cols-[auto_minmax(0,560px)_1fr_auto] md:gap-x-6">
        <Logo />
        {/* На мобильном поиск уходит во вторую строку на всю ширину */}
        <div className="order-last col-span-2 md:order-none md:col-span-1">
          <Suspense fallback={<SearchBoxFallback />}>
            <SearchBox />
          </Suspense>
        </div>
        {/* На мобильном разделы — в таб-баре внизу */}
        <nav className="hidden justify-end gap-1 md:col-start-3 md:flex">
          <Link
            href={href('/catalog')}
            data-testid="nav-catalog"
            aria-current={section === 'catalog' ? 'page' : undefined}
            className={navLink(section === 'catalog')}
          >
            {t('nav.home')}
          </Link>
          <Link
            href={href('/dashboard')}
            data-testid="nav-dashboard"
            aria-current={section === 'dashboard' ? 'page' : undefined}
            className={navLink(section === 'dashboard')}
          >
            {t('nav.dashboard')}
          </Link>
        </nav>
        <LanguageSwitch />
      </div>
    </header>
  )
}
