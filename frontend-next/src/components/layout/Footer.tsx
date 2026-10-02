'use client'

import { useTranslation } from 'react-i18next'
import { LogoMark } from './Logo'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-line bg-card">
      <div className="container-page flex flex-col gap-3 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-center gap-3">
          <LogoMark className="size-6 shrink-0" />
          <p className="max-w-[52ch]">{t('footer.about')}</p>
        </div>
        <p data-testid="copyright" className="shrink-0 tabular">
          {/* oxlint-disable-next-line react/purity -- год берётся в момент рендера намеренно */}
          {t('footer.rights', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  )
}
