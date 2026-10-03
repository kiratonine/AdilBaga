import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { dashboardQuery } from '../../../../api/queries'
import { getDashboard } from '../../../../api/server'
import { getI18n, isLanguage } from '../../../../i18n'
import { pageMetadata } from '../../../../lib/seo'
import { DashboardPage } from '../../../../views/DashboardPage'

// Runtime SSR; API GET responses use the bounded server data cache.

export async function generateMetadata({ params }: PageProps<'/[lang]/dashboard'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  const { t } = getI18n(lang)
  return pageMetadata({ lang, path: '/dashboard', title: t('dashboard.title'), description: t('meta.dashboard') })
}

export default async function Page() {
  await connection()
  const queryClient = new QueryClient()
  queryClient.setQueryData(dashboardQuery().queryKey, await getDashboard())

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardPage />
    </HydrationBoundary>
  )
}
