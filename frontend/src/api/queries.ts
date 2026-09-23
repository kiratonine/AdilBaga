import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { catalogApi } from './catalogApi'
import type { ProductCardDto, ProductQuery } from './types'

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

export const useCategories = () =>
  useQuery({ queryKey: queryKeys.categories, queryFn: catalogApi.getCategories, ...STATIC })

export const useCategoryFilters = (slug: string) =>
  useQuery({ queryKey: queryKeys.filters(slug), queryFn: () => catalogApi.getCategoryFilters(slug), ...STATIC })

/** Бэк отдаёт массив без total: страница короче PAGE_SIZE — значит, она последняя */
export function getNextOffset(lastPage: ProductCardDto[], allPages: ProductCardDto[][]): number | undefined {
  return lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE
}

/** Список с «Показать ещё». limit/offset подставляет пагинация */
export const useProductPages = (query: PagedQuery, { enabled = true }: { enabled?: boolean } = {}) =>
  useInfiniteQuery({
    queryKey: queryKeys.productPages(query),
    queryFn: ({ pageParam }) => catalogApi.getProducts({ ...query, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    enabled,
    getNextPageParam: getNextOffset,
    // При смене фильтров/сортировки держим прежний список, но товары другой категории не показываем
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[1] as PagedQuery | undefined)?.category === query.category ? previous : undefined,
    ...STATIC,
  })

/** Несколько товаров по id (главная: товары с наибольшим разбросом цен из дашборда) */
export const useProductsByIds = (ids: string[]) =>
  useQueries({
    queries: ids.map((id) => ({ queryKey: queryKeys.product(id), queryFn: () => catalogApi.getProduct(id), ...STATIC })),
    combine: (results) => ({
      data: results.flatMap((r) => (r.data ? [r.data] : [])),
      isPending: results.some((r) => r.isPending),
      isError: results.length > 0 && results.every((r) => r.isError),
      refetch: () => results.forEach((r) => void r.refetch()),
    }),
  })

export const useProduct = (id: string) =>
  useQuery({ queryKey: queryKeys.product(id), queryFn: () => catalogApi.getProduct(id), ...STATIC })

export const useDashboard = () =>
  useQuery({ queryKey: queryKeys.dashboard, queryFn: catalogApi.getDashboard, ...STATIC })
