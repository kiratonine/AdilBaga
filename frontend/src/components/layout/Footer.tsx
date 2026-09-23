import { useTranslation } from 'react-i18next'
import { LogoMark } from './Logo'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="mt-20 border-t border-line">
      <div className="container-page flex gap-3 py-8 text-sm text-muted">
        <LogoMark className="size-6 shrink-0" />
        <p className="max-w-[52ch]">{t('footer.about')}</p>
      </div>
    </footer>
  )
}
