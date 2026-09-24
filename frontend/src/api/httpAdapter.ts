import {
  ApiError,
  type CatalogApi,
  type CategoryDto,
  type DashboardDto,
  type FilterSchemaDto,
  type ProductCardDto,
  type ProductQuery,
} from './types'

export function createHttpAdapter(baseUrl: string): CatalogApi {
  const root = baseUrl.replace(/\/+$/, '')

  async function get<T>(path: string, params?: URLSearchParams): Promise<T> {
    const qs = params && params.size > 0 ? `?${params}` : ''
    let response: Response
    try {
      response = await fetch(`${root}/api${path}${qs}`, { headers: { Accept: 'application/json' } })
    } catch {
      throw new ApiError(0, 'Network error')
    }
    if (!response.ok) {
      // NestJS: { statusCode, message, error }
      const body = await response.json().catch(() => null)
      const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
      throw new ApiError(response.status, message ?? response.statusText)
    }
    return response.json() as Promise<T>
  }

  return {
    getCategories: () => get<CategoryDto[]>('/categories'),
    getCategoryFilters: (slug) => get<FilterSchemaDto>(`/categories/${encodeURIComponent(slug)}/filters`),
    getProducts: (query) => get<ProductCardDto[]>('/products', toSearchParams(query)),
    getProduct: (id) => get<ProductCardDto>(`/products/${encodeURIComponent(id)}`),
    getDashboard: () => get<DashboardDto>('/dashboard'),
  }
}

/** Мульти-значения передаются повторением параметра: ?volumeMl=500&volumeMl=1000 */
export function toSearchParams(query: ProductQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.category) params.set('category', query.category)
  if (query.search?.trim()) params.set('search', query.search.trim())
  for (const [key, values] of Object.entries(query.filters ?? {})) {
    for (const value of values) params.append(key, value)
  }
  if (query.sort) params.set('sort', query.sort)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.offset !== undefined) params.set('offset', String(query.offset))
  return params
}
