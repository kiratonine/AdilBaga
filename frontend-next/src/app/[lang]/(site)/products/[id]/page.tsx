import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { categoryFiltersQuery, productQuery } from '../../../../../api/queries'
import { getCategoryFilters, getProduct, notFoundOn404 } from '../../../../../api/server'
import { ProductPage } from '../../../../../views/ProductPage'

// ISR: при сборке страниц товаров не строим (и не ходим в API) — каждая строится при первом заходе
// и кэшируется на час: цены — snapshot, обновляются редко
export const revalidate = 3600
export const generateStaticParams = () => []

export async function generateMetadata({ params }: PageProps<'/[lang]/products/[id]'>): Promise<Metadata> {
  const { id } = await params
  const product = await getProduct(id).catch(notFoundOn404)
  return { title: product.name }
}

export default async function Page({ params }: PageProps<'/[lang]/products/[id]'>) {
  const { id } = await params
  const product = await getProduct(id).catch(notFoundOn404)

  const queryClient = new QueryClient()
  queryClient.setQueryData(productQuery(id).queryKey, product)
  // Подписи характеристик — из schema категории. Не пришла — характеристики догрузит клиент
  await getCategoryFilters(product.category.slug)
    .then((schema) => queryClient.setQueryData(categoryFiltersQuery(product.category.slug).queryKey, schema))
    .catch(() => undefined)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductPage id={id} />
    </HydrationBoundary>
  )
}
