// Frozen wire contract: contracts/openapi.yaml (Production Part 02).

export type StoreCode = 'DINA' | 'DANA' | 'FIX_PRICE'

export type CategoryDto = {
  id: string
  slug: string
  name: string
}

export type CategoryRefDto = Pick<CategoryDto, 'slug' | 'name'>

/** Примитивное значение атрибута. Подпись с единицами собирает lib/attributes.ts */
export type AttributeValue = string | number | boolean

export type FilterDto =
  // Multi-select discovery always supplies nonempty options; boolean needs none.
  | { key: string; label: string; type: 'multi-select'; options: AttributeValue[] }
  | { key: string; label: string; type: 'boolean' }

export type FilterSchemaDto = {
  category: string
  filters: FilterDto[]
}

export type OfferDto = {
  storeCode: StoreCode
  storeName: string
  price: number
  oldPrice: number | null
  /** Optional mock/SEO extension; NOT returned or guaranteed by API v1. */
  inStock?: boolean
}

export type ProductCardDto = {
  id: string
  name: string
  brand: string | null
  category: CategoryRefDto
  imageUrl: string | null
  /** null — значение у товара неизвестно */
  attributes: Record<string, AttributeValue | null>
  minPrice: number
  /** Отсортированы по price ASC */
  offers: OfferDto[]
  snapshotAt: string
}

export type SortValue = 'price_asc' | 'price_desc' | 'name_asc'

/** Значения выбранных фильтров: multi-select → массив значений, boolean → ['true'] или ['false'] */
export type FilterValues = Record<string, string[]>

export type ProductQuery = {
  category?: string
  search?: string
  filters?: FilterValues
  sort?: SortValue
  limit?: number
  offset?: number
}

export type PriceSpreadDto = {
  productId: string
  name: string
  minPrice: number
  maxPrice: number
  /** (max - min) / min * 100, считает бэк. Отсортировано DESC */
  differencePercent: number
}

export type StoreLocationDto = {
  storeCode: StoreCode
  storeName: string
  name: string
  address: string
  latitude: number
  longitude: number
}

/** Позиция корзины: самый дешёвый подходящий товар категории в сети; null — в сети такого нет */
export type BasketItemDto = {
  categorySlug: string
  categoryName: string
  productId: string | null
  name: string | null
  price: number | null
}

/** Продуктовая корзина одной сети. Состав и подсчёт — на бэке (07_FRONTEND_QUESTIONS_BASKET.md) */
export type BasketDto = {
  storeCode: StoreCode
  storeName: string
  /** Сумма найденных позиций */
  total: number
  items: BasketItemDto[]
}

export type DashboardDto = {
  summary: {
    canonicalProducts: number
    stores: number
    matchedAcrossStores: number
    snapshotAt: string
  }
  priceSpreads: PriceSpreadDto[]
  locations: StoreLocationDto[]
  /** Required: total sums found prices; missing items are null. */
  baskets: BasketDto[]
}

export interface CatalogApi {
  getCategories(): Promise<CategoryDto[]>
  getCategoryFilters(slug: string): Promise<FilterSchemaDto>
  /** Массив без total: следующей страницы нет, если пришло меньше limit */
  getProducts(query: ProductQuery): Promise<ProductCardDto[]>
  getProduct(id: string): Promise<ProductCardDto>
  getDashboard(): Promise<DashboardDto>
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
