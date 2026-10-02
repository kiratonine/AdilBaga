import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { categoriesQuery, categoryFiltersQuery, productPagesQuery } from '../../../../../api/queries'
import { getCategories, getCategoryFilters, notFoundOn404, toSearchParams } from '../../../../../api/server'
import { readFilters, readSort } from '../../../../../lib/filterParams'
import { CategoryPage } from '../../../../../views/CategoryPage'

export async function generateMetadata({ params }: PageProps<'/[lang]/collections/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const [categories] = await Promise.all([getCategories(), getCategoryFilters(slug).catch(notFoundOn404)])
  const category = categories.find((c) => c.slug === slug)
  return category ? { title: category.name } : {}
}

// Динамическая страница: фильтры и сортировка из URL — в HTML сразу отфильтрованный список.
// Дальше фильтры, сортировка и «Показать ещё» работают на клиенте без запросов к этому серверу
export default async function Page({ params, searchParams }: PageProps<'/[lang]/collections/[slug]'>) {
  const { slug } = await params
  const [categories, schema] = await Promise.all([getCategories(), getCategoryFilters(slug).catch(notFoundOn404)])

  const query = toSearchParams(await searchParams)
  const queryClient = new QueryClient()
  queryClient.setQueryData(categoriesQuery().queryKey, categories)
  queryClient.setQueryData(categoryFiltersQuery(slug).queryKey, schema)
  // Ключ совпадает с useProductPages на клиенте — те же readFilters/readSort по тому же URL
  await queryClient.fetchInfiniteQuery(
    productPagesQuery({ category: slug, filters: readFilters(query, schema.filters), sort: readSort(query) }),
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CategoryPage slug={slug} />
    </HydrationBoundary>
  )
}
