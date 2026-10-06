import type { ClassifiedProduct } from '../src/agent/classify.js'
import type { CategorySlug } from '../src/agent/taxonomy.js'

export const cp = (store: ClassifiedProduct['storeCode'], id: string, name: string, attrs: ClassifiedProduct['attributes'],
  brand: string | null = 'FoodMaster', type = 'молоко', category: CategorySlug = type === 'сахар' ? 'sugar' : 'milk'): ClassifiedProduct => ({
  storeCode: store, category, productType: type, brand, attributes: attrs, displayName: name, flags: [],
  product: { sourceProductId: id, name, price: 500, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null, sourceCategoryPath: [], rawPayload: {} },
})
