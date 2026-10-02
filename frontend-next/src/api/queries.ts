import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { catalogApi } from './catalogApi'
import type { DashboardDto, ProductCardDto, ProductQuery } from './types'

export const PAGE_SIZE = 24

// Данные — статичный snapshot, поэтому кэшируем надолго
const STATIC = { staleTime: Infinity } as const

type PagedQuery = Omit<ProductQuery, 'limit' | 'offset'>

export const queryKeys = {
  categories: ['categories'] as const,
  filters: (slug: string) => ['filters', slug] as const,
  productPages: (query: PagedQuery) => ['products', query] as const,
  product: (id: string) => ['product', id] as const,
  dashboard: ['dashboard'] as const,
}

/** Опции запросов — общие для хуков и серверного prefetch (страницы с данными в HTML) */
export const categoriesQuery = () =>
  queryOptions({ queryKey: queryKeys.categories, queryFn: catalogApi.getCategories, ...STATIC })

export const productQuery = (id: string) =>
  queryOptions({ queryKey: queryKeys.product(id), queryFn: () => catalogApi.getProduct(id), ...STATIC })

/** slug неизвестен (страница товара ещё грузится) — запрос не отправляем */
export const categoryFiltersQuery = (slug: string | undefined) =>
  queryOptions({
    queryKey: queryKeys.filters(slug ?? ''),
    queryFn: () => catalogApi.getCategoryFilters(slug ?? ''),
    enabled: Boolean(slug),
    ...STATIC,
  })

/** Список с «Показать ещё». limit/offset подставляет пагинация. Сервер кладёт в кэш первую страницу */
export const productPagesQuery = (query: PagedQuery) =>
  infiniteQueryOptions({
    queryKey: queryKeys.productPages(query),
    queryFn: ({ pageParam }) => catalogApi.getProducts({ ...query, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: getNextOffset,
    ...STATIC,
  })

export const dashboardQuery = () =>
  queryOptions({ queryKey: queryKeys.dashboard, queryFn: catalogApi.getDashboard, ...STATIC })

export const useCategories = () => useQuery(categoriesQuery())

export const useCategoryFilters = (slug: string | undefined) => useQuery(categoryFiltersQuery(slug))

/** Бэк отдаёт массив без total: страница короче PAGE_SIZE — значит, она последняя */
export function getNextOffset(lastPage: ProductCardDto[], allPages: ProductCardDto[][]): number | undefined {
  return lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE
}

export const useProductPages = (query: PagedQuery, { enabled = true }: { enabled?: boolean } = {}) =>
  useInfiniteQuery({
    ...productPagesQuery(query),
    enabled,
    // При смене фильтров/сортировки держим прежний список, но товары другой категории не показываем
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[1] as PagedQuery | undefined)?.category === query.category ? previous : undefined,
  })

/** Несколько товаров по id (главная: товары с наибольшим разбросом цен из дашборда) */
export const useProductsByIds = (ids: string[]) =>
  useQueries({
    queries: ids.map(productQuery),
    combine: (results) => ({
      data: results.flatMap((r) => (r.data ? [r.data] : [])),
      isPending: results.some((r) => r.isPending),
      isError: results.length > 0 && results.every((r) => r.isError),
      refetch: () => results.forEach((r) => void r.refetch()),
    }),
  })

export const useProduct = (id: string) => useQuery(productQuery(id))

export const useDashboard = () => useQuery(dashboardQuery())

/** Сколько товаров с наибольшим разбросом цен показывать в каталоге — выбор и порядок делает бэк */
export const TOP_DEALS = 8

export const topDealIds = (dashboard: DashboardDto | undefined): string[] =>
  dashboard?.priceSpreads.slice(0, TOP_DEALS).map((s) => s.productId) ?? []
