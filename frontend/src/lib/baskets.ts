import type { BasketDto } from '../api/types'

export type BasketSummary = BasketDto & {
  /** Сколько позиций не нашлось в сети */
  missing: number
  /** Самая выгодная среди полных корзин */
  best: boolean
  /** На сколько дороже самой выгодной; null — у самой выгодной или если сравнить не с чем */
  overBest: number | null
}

/**
 * Корзины по возрастанию суммы: сначала полные, потом неполные.
 * Неполная корзина не может быть «выгоднее всего» — она дешевле только за счёт недостающих позиций.
 */
export function summarizeBaskets(baskets: BasketDto[]): BasketSummary[] {
  const withMissing = baskets.map((b) => ({ ...b, missing: b.items.filter((i) => i.price === null).length }))
  const sorted = withMissing.toSorted((a, b) => Number(a.missing > 0) - Number(b.missing > 0) || a.total - b.total)
  const best = sorted.find((b) => b.missing === 0)

  return sorted.map((b) => ({
    ...b,
    best: b === best,
    overBest: best && b !== best && b.missing === 0 ? b.total - best.total : null,
  }))
}
