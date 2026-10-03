import { notFound } from 'next/navigation'
import { cache } from 'react'
import { catalogApi } from './catalogApi'
import { ApiError } from './types'

/**
 * Запросы серверных страниц. cache — один запрос на рендер: generateMetadata и сама страница
 * берут товар/категорию из общего результата
 */
export const getCategories = cache(() => catalogApi.getCategories())
export const getCategoryFilters = cache((slug: string) => catalogApi.getCategoryFilters(slug))
export const getProduct = cache((id: string) => catalogApi.getProduct(id))
export const getDashboard = cache(() => catalogApi.getDashboard())

/**
 * 404 API → страница 404. Остальные ошибки пробрасываем: при ISR Next оставит прежнюю версию страницы,
 * а не закэширует на час вместо данных скелетон
 */
export function notFoundOn404(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) notFound()
  throw error
}

/** searchParams страницы → URLSearchParams (мульти-значения — повтором ключа, как в URL) */
export function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(record)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
  }
  return params
}
