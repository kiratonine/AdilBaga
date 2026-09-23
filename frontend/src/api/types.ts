// DTO по подтверждённому контракту Backend 1 (docs/context/05_FRONTEND_ANSWERS_FROM_BACKEND_1.md).
// Поля с «?» бэк может добавить позже — UI не должен от них зависеть.

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
  | { key: string; label: string; type: 'multi-select'; options: (string | number)[] }
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
  /** Пока не входит в контракт — может появиться позже */
  inStock?: boolean
}

export type ProductCardDto = {
  id: string
  name: string
  brand: string | null
  category: CategoryRefDto
  imageUrl: string | null
  attributes: Record<string, AttributeValue>
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
  // Возможные будущие additive-поля
  imageUrl?: string | null
  category?: CategoryRefDto
  minStoreName?: string
  maxStoreName?: string
}

export type StoreLocationDto = {
  /** Может появиться позже; ключ маркера — storeCode + address */
  id?: string
  storeCode: StoreCode
  storeName: string
  name: string
  address: string
  latitude: number
  longitude: number
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
