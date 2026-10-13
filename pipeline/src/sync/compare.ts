import type { Bundle } from '../agent/bundle.js'

export type BundleDiff = {
  a: number; b: number
  onlyA: string[]; onlyB: string[]
  priceChanged: { id: string; a: number; b: number }[]
  mismatchRatio: number
  perStore: Record<string, { a: number; b: number }>
}

// Идентичность товара: сеть + id в источнике; повторы внутри bundle схлопываются
const index = (bundle: Bundle) => new Map(bundle.rawProducts.map((r) => [`${r.storeCode}:${r.sourceProductId}`, r]))

export function compareBundles(a: Bundle, b: Bundle): BundleDiff {
  const ia = index(a)
  const ib = index(b)
  const onlyA = [...ia.keys()].filter((id) => !ib.has(id))
  const onlyB = [...ib.keys()].filter((id) => !ia.has(id))
  const priceChanged: BundleDiff['priceChanged'] = []
  for (const [id, ra] of ia) {
    const rb = ib.get(id)
    if (rb && rb.price !== ra.price) priceChanged.push({ id, a: ra.price, b: rb.price })
  }
  const perStore: BundleDiff['perStore'] = {}
  for (const [side, idx] of [['a', ia], ['b', ib]] as const) {
    for (const r of idx.values()) {
      const s = (perStore[r.storeCode] ??= { a: 0, b: 0 })
      s[side]++
    }
  }
  // Цена не считается расхождением: ищем потерянные и лишние позиции, а цены отдаём отдельным списком
  return { a: ia.size, b: ib.size, onlyA, onlyB, priceChanged, mismatchRatio: (onlyA.length + onlyB.length) / Math.max(ia.size, 1), perStore }
}
