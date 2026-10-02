import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { categoriesQuery, dashboardQuery, productQuery, topDealIds } from '../../../../api/queries'
import { getI18n, isLanguage } from '../../../../i18n'
import { pageMetadata } from '../../../../lib/seo'
import { CatalogPage } from '../../../../views/CatalogPage'

// Статика с ISR, как «Аналитика»: топ разброса цен берётся из дашборда
export const revalidate = 3600

export async function generateMetadata({ params }: PageProps<'/[lang]/catalog'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  const { t } = getI18n(lang)
  return pageMetadata({ lang, path: '/catalog', title: t('nav.home'), description: t('meta.catalog') })
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
