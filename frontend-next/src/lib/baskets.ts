import type { BasketDto } from '../api/types'

export type BasketSummary = BasketDto & {
  /** Сколько позиций не нашлось в сети */
  missing: number
  /** Не нашлось ни одной позиции: total = 0 — не цена, показываем «Нет данных» */
  empty: boolean
  /** Самая выгодная среди полных корзин */
  best: boolean
  /** На сколько дороже самой выгодной; null — у самой выгодной или если сравнить не с чем */
  overBest: number | null
}

/** Полные корзины, потом неполные, потом пустые */
function rank(b: { missing: number; empty: boolean }) {
  return b.empty ? 2 : b.missing > 0 ? 1 : 0
}

/**
 * Корзины по возрастанию суммы: сначала полные, потом неполные и пустые.
 * Неполная корзина не может быть «выгоднее всего» — она дешевле только за счёт недостающих позиций.
 */
export function summarizeBaskets(baskets: BasketDto[]): BasketSummary[] {
  const counted = baskets.map((b) => {
    const missing = b.items.filter((i) => i.price === null).length
    return { ...b, missing, empty: missing === b.items.length }
  })
  const sorted = counted.toSorted((a, b) => rank(a) - rank(b) || a.total - b.total)
  const best = sorted.find((b) => b.missing === 0)

  return sorted.map((b) => ({
    ...b,
    best: b === best,
    overBest: best && b !== best && b.missing === 0 ? b.total - best.total : null,
  }))
}
