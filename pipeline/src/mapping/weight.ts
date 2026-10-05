import type { SourceProduct, StoreCode } from '../types.js'

const DANA_WEIGHT_MARK = /(?<![а-яa-z])вес(?:ов(?:ой|ая|ое|ые))?(?![а-яa-z])/i

/**
 * Цена за кг (весовой товар) против цены за штуку/упаковку.
 * DINA: API помечает весовые товары (price_type/isWeightProduct), цена приведена к кг в scrapers/dina.ts.
 * DANA: единственный признак — слово «ВЕС»/«ВЕСОВОЙ» в названии (6 товаров в выгрузке 2026-10-05).
 * FIX_PRICE: признака нет (поле unit пустое у всех товаров, весовых товаров в каталоге нет) → false.
 */
export function isVariableWeight(storeCode: StoreCode, product: Pick<SourceProduct, 'name' | 'rawPayload'>): boolean {
  if (storeCode === 'DINA') return product.rawPayload.price_type === 'weight' || product.rawPayload.isWeightProduct === true
  if (storeCode === 'DANA') return DANA_WEIGHT_MARK.test(product.name)
  return false
}
