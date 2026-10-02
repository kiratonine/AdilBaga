import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { categoryFiltersQuery, productQuery } from '../../../../../api/queries'
import { getCategoryFilters, getProduct, notFoundOn404 } from '../../../../../api/server'
import { JsonLd } from '../../../../../components/seo/JsonLd'
import { getI18n, isLanguage } from '../../../../../i18n'
import { pageMetadata, productDescription } from '../../../../../lib/seo'
import { breadcrumbJsonLd, productJsonLd } from '../../../../../lib/structuredData'
import { ProductPage } from '../../../../../views/ProductPage'

// ISR: при сборке страниц товаров не строим (и не ходим в API) — каждая строится при первом заходе
// и кэшируется на час: цены — snapshot, обновляются редко
export const revalidate = 3600
export const generateStaticParams = () => []

export async function generateMetadata({ params }: PageProps<'/[lang]/products/[id]'>): Promise<Metadata> {
  const { lang, id } = await params
  const product = await getProduct(id).catch(notFoundOn404)
  if (!isLanguage(lang)) return {}
  return pageMetadata({
    lang,
    path: `/products/${id}`,
    title: product.name,
    description: productDescription(lang, product),
    image: product.imageUrl,
  })
}

export default async function Page({ params }: PageProps<'/[lang]/products/[id]'>) {
  const { lang, id } = await params
  if (!isLanguage(lang)) notFound()
  const product = await getProduct(id).catch(notFoundOn404)

  const queryClient = new QueryClient()
  queryClient.setQueryData(productQuery(id).queryKey, product)
  // Подписи характеристик — из schema категории. Не пришла — характеристики догрузит клиент
  await getCategoryFilters(product.category.slug)
    .then((schema) => queryClient.setQueryData(categoryFiltersQuery(product.category.slug).queryKey, schema))
    .catch(() => undefined)

  // Крошки — как на странице: Каталог / Категория / товар
  const breadcrumbs = breadcrumbJsonLd(lang, [
    { name: getI18n(lang).t('nav.home'), path: '/catalog' },
    { name: product.category.name, path: `/collections/${product.category.slug}` },
    { name: product.name, path: `/products/${id}` },
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <JsonLd data={productJsonLd(lang, product)} />
      <JsonLd data={breadcrumbs} />
      <ProductPage id={id} />
    </HydrationBoundary>
  )
}
