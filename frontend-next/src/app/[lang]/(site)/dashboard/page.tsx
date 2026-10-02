import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { dashboardQuery } from '../../../../api/queries'
import { getDashboard } from '../../../../api/server'
import { getI18n, isLanguage } from '../../../../i18n'
import { DashboardPage } from '../../../../views/DashboardPage'

// Статика с ISR: сводка, корзины и разброс цен — в HTML; snapshot обновляется редко
export const revalidate = 3600

export async function generateMetadata({ params }: PageProps<'/[lang]/dashboard'>): Promise<Metadata> {
  const { lang } = await params
  return isLanguage(lang) ? { title: getI18n(lang).t('dashboard.title') } : {}
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
