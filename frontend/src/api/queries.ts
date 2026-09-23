import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { catalogApi } from './catalogApi'
import type { ProductQuery } from './types'

export const PAGE_SIZE = 24

// Данные — статичный snapshot, поэтому кэшируем надолго
const STATIC = { staleTime: Infinity } as const

export const queryKeys = {
  categories: ['categories'] as const,
  filters: (slug: string) => ['filters', slug] as const,
  products: (query: ProductQuery) => ['products', query] as const,
  product: (id: string) => ['product', id] as const,
  dashboard: ['dashboard'] as const,
}

export const useCategories = () =>
  useQuery({ queryKey: queryKeys.categories, queryFn: catalogApi.getCategories, ...STATIC })

export const useCategoryFilters = (slug: string) =>
  useQuery({ queryKey: queryKeys.filters(slug), queryFn: () => catalogApi.getCategoryFilters(slug), ...STATIC })

export const useProducts = (query: ProductQuery) =>
  useQuery({
    queryKey: queryKeys.products(query),
    queryFn: () => catalogApi.getProducts(query),
    placeholderData: keepPreviousData,
    ...STATIC,
  })

export const useProduct = (id: string) =>
  useQuery({ queryKey: queryKeys.product(id), queryFn: () => catalogApi.getProduct(id), ...STATIC })

export const useDashboard = () =>
  useQuery({ queryKey: queryKeys.dashboard, queryFn: catalogApi.getDashboard, ...STATIC })

/** Дата snapshot для шапки. Отдельного /api/meta нет — берём из дашборда (кэш общий со страницей /dashboard) */
export function useSnapshotDate() {
  const { data } = useDashboard()
  return data?.summary.snapshotAt
}
