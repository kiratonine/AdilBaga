import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { SearchBox } from './SearchBox'

export function Header() {
  const { t } = useTranslation()

  const dashboardLink = (
    <NavLink
      to="/dashboard"
      data-testid="nav-dashboard"
      className={({ isActive }) =>
        `flex h-10 items-center rounded-[var(--radius-control)] px-3 text-[15px] font-medium transition-colors ${
          isActive ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface'
        }`
      }
    >
      {t('nav.dashboard')}
    </NavLink>
  )

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page/95 backdrop-blur supports-[backdrop-filter]:bg-page/85">
      <div className="container-page grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 py-3 md:grid-cols-[auto_minmax(0,560px)_1fr_auto] md:gap-x-6">
        <Logo />
        {/* На мобильном поиск уходит во вторую строку на всю ширину */}
        <div className="order-last col-span-3 md:order-none md:col-span-1">
          <SearchBox />
        </div>
        <nav className="flex justify-end md:col-start-3">{dashboardLink}</nav>
        <LanguageSwitch />
      </div>
    </header>
  )
}
