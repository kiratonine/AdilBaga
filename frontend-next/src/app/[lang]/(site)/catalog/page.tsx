import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { categoriesQuery, dashboardQuery, productQuery, topDealIds } from '../../../../api/queries'
import { getI18n, isLanguage } from '../../../../i18n'
import { CatalogPage } from '../../../../views/CatalogPage'

export async function generateMetadata({ params }: PageProps<'/[lang]/catalog'>): Promise<Metadata> {
  const { lang } = await params
  return isLanguage(lang) ? { title: getI18n(lang).t('nav.home') } : {}
}

// Данные — на сервере, чтобы категории и карточки с ценами были уже в HTML; клиент берёт их из кэша
export default async function Page() {
  const queryClient = new QueryClient()
  const [, dashboard] = await Promise.all([
    queryClient.prefetchQuery(categoriesQuery()),
    queryClient.fetchQuery(dashboardQuery()),
  ])
  await Promise.all(topDealIds(dashboard).map((id) => queryClient.prefetchQuery(productQuery(id))))

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CatalogPage />
    </HydrationBoundary>
  )
}
