import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { categoriesQuery, categoryFiltersQuery, productPagesQuery } from '../../../../../api/queries'
import { getCategories, getCategoryFilters, notFoundOn404, toSearchParams } from '../../../../../api/server'
import { JsonLd } from '../../../../../components/seo/JsonLd'
import { getI18n, isLanguage } from '../../../../../i18n'
import { readFilters, readSort } from '../../../../../lib/filterParams'
import { pageMetadata } from '../../../../../lib/seo'
import { breadcrumbJsonLd } from '../../../../../lib/structuredData'
import { CategoryPage } from '../../../../../views/CategoryPage'

export async function generateMetadata({ params }: PageProps<'/[lang]/collections/[slug]'>): Promise<Metadata> {
  const { lang, slug } = await params
  const [categories] = await Promise.all([getCategories(), getCategoryFilters(slug).catch(notFoundOn404)])
  const category = categories.find((c) => c.slug === slug)
  if (!category || !isLanguage(lang)) return {}
  // canonical — без фильтров и сортировки: варианты списка одной категории в индексе не плодим
  return pageMetadata({
    lang,
    path: `/collections/${slug}`,
    title: category.name,
    description: getI18n(lang).t('meta.category', { name: category.name }),
  })
}

// Динамическая страница: фильтры и сортировка из URL — в HTML сразу отфильтрованный список.
// Дальше фильтры, сортировка и «Показать ещё» работают на клиенте без запросов к этому серверу
export default async function Page({ params, searchParams }: PageProps<'/[lang]/collections/[slug]'>) {
  const { lang, slug } = await params
  if (!isLanguage(lang)) notFound()
  const [categories, schema] = await Promise.all([getCategories(), getCategoryFilters(slug).catch(notFoundOn404)])

  const query = toSearchParams(await searchParams)
  const queryClient = new QueryClient()
  queryClient.setQueryData(categoriesQuery().queryKey, categories)
  queryClient.setQueryData(categoryFiltersQuery(slug).queryKey, schema)
  // Ключ совпадает с useProductPages на клиенте — те же readFilters/readSort по тому же URL
  await queryClient.fetchInfiniteQuery(
    productPagesQuery({ category: slug, filters: readFilters(query, schema.filters), sort: readSort(query) }),
  )

  const category = categories.find((c) => c.slug === slug)
  const crumbs = [{ name: getI18n(lang).t('nav.home'), path: '/catalog' }]
  if (category) crumbs.push({ name: category.name, path: `/collections/${slug}` })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <JsonLd data={breadcrumbJsonLd(lang, crumbs)} />
      <CategoryPage slug={slug} />
    </HydrationBoundary>
  )
}
