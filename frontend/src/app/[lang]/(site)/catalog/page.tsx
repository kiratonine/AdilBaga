import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { categoriesQuery, dashboardQuery, productQuery, topDealIds } from '../../../../api/queries'
import { JsonLd } from '../../../../components/seo/JsonLd'
import { getI18n, isLanguage } from '../../../../i18n'
import { pageMetadata } from '../../../../lib/seo'
import { siteJsonLd } from '../../../../lib/structuredData'
import { CatalogPage } from '../../../../views/CatalogPage'

// Runtime SSR; API GET responses use the bounded server data cache.

export async function generateMetadata({ params }: PageProps<'/[lang]/catalog'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  // Каталог — главная сайта: в title бренд и «сравнение цен в Актау», а не просто «Каталог»
  return pageMetadata({ lang, path: '/catalog', description: getI18n(lang).t('meta.catalog') })
}

// Данные — на сервере, чтобы категории и карточки с ценами были уже в HTML; клиент берёт их из кэша
export default async function Page({ params }: PageProps<'/[lang]/catalog'>) {
  await connection()
  const { lang } = await params
  if (!isLanguage(lang)) notFound()
  const { t } = getI18n(lang)
  const queryClient = new QueryClient()
  const [, dashboard] = await Promise.all([
    queryClient.fetchQuery(categoriesQuery()),
    queryClient.fetchQuery(dashboardQuery()),
  ])
  await Promise.all(topDealIds(dashboard).map((id) => queryClient.fetchQuery(productQuery(id))))

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <JsonLd data={siteJsonLd(lang, { name: t('brand.name'), description: t('brand.tagline') })} />
      <CatalogPage />
    </HydrationBoundary>
  )
}
