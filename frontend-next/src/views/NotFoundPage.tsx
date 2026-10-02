'use client'

import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { StateCard } from '../components/ui/States'
import { useHref } from '../lib/useLang'

export function NotFoundPage() {
  const { t } = useTranslation()
  const href = useHref()
  return (
    <StateCard icon="search">
      <title>{`${t('state.notFound')} — ${t('brand.name')}`}</title>
      <h1 className="text-h1">{t('state.notFound')}</h1>
      <Button href={href('/catalog')} variant="primary" className="mt-1">
        {t('state.toCatalog')}
      </Button>
    </StateCard>
  )
}
