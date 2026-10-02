import type { OfferDto } from '../api/types'

/** Бэк сортирует по price ASC, но UI не должен ломаться, если порядок нарушен */
export function sortOffers(offers: OfferDto[]): OfferDto[] {
  return [...offers].sort((a, b) => a.price - b.price)
}

/** Разница между самым дешёвым и самым дорогим предложением; null, если сравнивать не с чем */
export function savingOf(offers: OfferDto[]): { amount: number; store: string } | null {
  if (offers.length < 2) return null
  const sorted = sortOffers(offers)
  const max = sorted[sorted.length - 1]
  const amount = max.price - sorted[0].price
  return amount > 0 ? { amount, store: max.storeName } : null
}
