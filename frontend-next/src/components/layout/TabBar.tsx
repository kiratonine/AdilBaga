'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { navSection, type NavSection } from '../../lib/paths'
import { useHref } from '../../lib/useLang'
import { Icon, type IconName } from '../ui/Icon'

const TABS: { section: NavSection; path: string; icon: IconName; label: string }[] = [
  { section: 'catalog', path: '/catalog', icon: 'grid', label: 'nav.home' },
  { section: 'search', path: '/search', icon: 'search', label: 'nav.search' },
  { section: 'dashboard', path: '/dashboard', icon: 'chart', label: 'nav.dashboard' },
]

/** Нижняя навигация на мобильном. Отступ под неё у body задаёт globals.css по data-tab-bar */
export function TabBar() {
  const { t } = useTranslation()
  const href = useHref()
  const active = navSection(usePathname())

  return (
    <nav
      aria-label={t('nav.main')}
      data-testid="tab-bar"
      data-tab-bar=""
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-3">
        {TABS.map((tab) => {
          const isActive = tab.section === active
          return (
            <li key={tab.section}>
              <Link
                href={href(tab.path)}
                // Поиск динамический (запрос во вкладке): заранее загруженный /search без q Next потом
                // переиспользует при переходе на /search?q=… — и во вкладке остаётся «Поиск». Страница
                // лёгкая, результаты всё равно грузит клиент, prefetch ей не нужен
                prefetch={tab.section === 'search' ? false : undefined}
                data-testid={`tab-${tab.section}`}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] leading-none ${
                  isActive ? 'font-semibold text-ink' : 'font-medium text-muted'
                }`}
              >
                <Icon name={tab.icon} />
                {t(tab.label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
