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

/** Первые limit предложений по цене для карточки; про остальные — сколько их и до какой цены */
export function topOffers(offers: OfferDto[], limit: number): { shown: OfferDto[]; hiddenCount: number; maxPrice: number } {
  const sorted = sortOffers(offers)
  return {
    shown: sorted.slice(0, limit),
    hiddenCount: Math.max(sorted.length - limit, 0),
    maxPrice: sorted.length > 0 ? sorted[sorted.length - 1].price : 0,
  }
}

/** Скидка предложения в процентах, округлённая вниз; null — скидки нет или она меньше 1% */
export function discountPercent(offer: OfferDto | undefined): number | null {
  if (!offer?.oldPrice || offer.oldPrice <= offer.price) return null
  const percent = Math.floor(((offer.oldPrice - offer.price) / offer.oldPrice) * 100)
  return percent >= 1 ? percent : null
}
