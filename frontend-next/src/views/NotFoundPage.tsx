'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useHref } from '../lib/useLang'

export function NotFoundPage() {
  const { t } = useTranslation()
  const href = useHref()
  return (
    <div className="py-16">
      <title>{`${t('state.notFound')} — ${t('brand.name')}`}</title>
      <h1 className="text-[28px] font-semibold">{t('state.notFound')}</h1>
      <Link href={href('/catalog')} className="mt-4 inline-block font-medium text-accent underline underline-offset-4">
        {t('state.toCatalog')}
      </Link>
    </div>
  )
}
