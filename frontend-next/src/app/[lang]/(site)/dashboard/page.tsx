import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { dashboardQuery } from '../../../../api/queries'
import { getDashboard } from '../../../../api/server'
import { getI18n, isLanguage } from '../../../../i18n'
import { pageMetadata } from '../../../../lib/seo'
import { DashboardPage } from '../../../../views/DashboardPage'

// Статика с ISR: сводка, корзины и разброс цен — в HTML; snapshot обновляется редко
export const revalidate = 3600

export async function generateMetadata({ params }: PageProps<'/[lang]/dashboard'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  const { t } = getI18n(lang)
  return pageMetadata({ lang, path: '/dashboard', title: t('dashboard.title'), description: t('meta.dashboard') })
}

export default async function Page() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(dashboardQuery().queryKey, await getDashboard())

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardPage />
    </HydrationBoundary>
  )
}
