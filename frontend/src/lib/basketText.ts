import type { TFunction } from 'i18next'
import type { BasketSummary } from './baskets'
import { formatPrice } from './format'

/** «Корзина: 2 250 ₸ · неполная» — для popup и списка точек; у пустой корзины 0 ₸ не показываем */
export function basketLine(basket: BasketSummary, t: TFunction): string {
  if (basket.empty) return t('dashboard.basketOnMapNoData')
  const line = t('dashboard.basketOnMap', { amount: formatPrice(basket.total) })
  return basket.missing > 0 ? `${line} · ${t('dashboard.basketIncomplete')}` : line
}
