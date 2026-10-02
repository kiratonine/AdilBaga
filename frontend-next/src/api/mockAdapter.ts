import { mockCategories, mockDashboard, mockFilters, mockProducts } from '../mocks'
import { ApiError, type CatalogApi, type ProductCardDto, type ProductQuery } from './types'

type MockOptions = {
  /** Искусственная задержка, чтобы видеть loading-состояния */
  delayMs?: number
}

export function createMockAdapter({ delayMs = 250 }: MockOptions = {}): CatalogApi {
  const respond = <T>(data: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), delayMs))

  const fail = (status: number, message: string): Promise<never> =>
    new Promise((_, reject) => setTimeout(() => reject(new ApiError(status, message)), delayMs))

  return {
    getCategories: () => respond(mockCategories),

    getCategoryFilters: (slug) => {
      const schema = mockFilters[slug]
      return schema ? respond(schema) : fail(404, `Category "${slug}" not found`)
    },

    getProducts: (query) => {
      const offset = query.offset ?? 0
      const matched = queryProducts(mockProducts, query)
      return respond(query.limit === undefined ? matched.slice(offset) : matched.slice(offset, offset + query.limit))
    },

    getProduct: (id) => {
      const product = mockProducts.find((p) => p.id === id)
      return product ? respond(product) : fail(404, `Product "${id}" not found`)
    },

    getDashboard: () => respond(mockDashboard),
  }
}

/** Фильтрация и сортировка так, как их (по нашему предложению) делает бэк */
export function queryProducts(source: ProductCardDto[], query: ProductQuery): ProductCardDto[] {
  const search = query.search?.trim().toLowerCase()
  const activeFilters = Object.entries(query.filters ?? {}).filter(([, values]) => values.length > 0)

  const result = source.filter((p) => {
    if (query.category && p.category.slug !== query.category) return false
    if (search && !`${p.name} ${p.brand ?? ''}`.toLowerCase().includes(search)) return false
    // Между значениями одного фильтра — OR, между фильтрами — AND
    return activeFilters.every(([key, values]) => values.includes(String(p.attributes[key])))
  })

  const collator = new Intl.Collator('ru')
  switch (query.sort ?? 'price_asc') {
    case 'price_asc':
      return result.sort((a, b) => a.minPrice - b.minPrice)
    case 'price_desc':
      return result.sort((a, b) => b.minPrice - a.minPrice)
    case 'name_asc':
      return result.sort((a, b) => collator.compare(a.name, b.name))
  }
}
