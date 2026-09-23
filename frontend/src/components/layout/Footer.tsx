import { useTranslation } from 'react-i18next'
import { LogoMark } from './Logo'

const STORES = ['Dina Market', 'Dana Market', 'Fix Price']

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="mt-20 border-t border-line">
      <div className="container-page flex flex-col gap-4 py-8 text-sm text-muted md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-[52ch] gap-3">
          <LogoMark className="size-6 shrink-0" />
          <p>{t('footer.about')}</p>
        </div>
        <p>{t('footer.sources', { stores: STORES.join(', ') })}</p>
      </div>
    </footer>
  )
}
