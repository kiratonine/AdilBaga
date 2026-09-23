import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('state.notFound'))
  return (
    <div className="py-16">
      <h1 className="text-[28px] font-semibold">{t('state.notFound')}</h1>
      <Link to="/" className="mt-4 inline-block font-medium text-accent underline underline-offset-4">
        {t('state.toCatalog')}
      </Link>
    </div>
  )
}
