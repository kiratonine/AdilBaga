import type { ClassifiedProduct } from './classify.js'

export function blockKey(c: ClassifiedProduct): string {
  const a = c.attributes
  const size = a.volumeMl ? `${a.volumeMl}ml` : a.weightGrams ? `${a.weightGrams}g` : a.packageCount ? `${a.packageCount}pcs` : 'nosize'
  const pack = a.packageCount && (a.volumeMl || a.weightGrams) ? `x${a.packageCount}` : ''
  return `${c.category}|${c.productType}|${size}${pack}`
}

export function buildBlocks(items: ClassifiedProduct[], maxSize = 40): ClassifiedProduct[][] {
  const groups = new Map<string, ClassifiedProduct[]>()
  for (const it of items) {
    const k = blockKey(it)
    groups.set(k, [...(groups.get(k) ?? []), it])
  }
  const out: ClassifiedProduct[][] = []
  for (const g of groups.values()) {
    if (g.length <= maxSize) { out.push(g); continue }
    const byBrand = new Map<string, ClassifiedProduct[]>()
    for (const it of g) {
      const k = (it.brand ?? '?').toLowerCase().slice(0, 1)
      byBrand.set(k, [...(byBrand.get(k) ?? []), it])
    }
    for (const part of byBrand.values()) for (let i = 0; i < part.length; i += maxSize) out.push(part.slice(i, i + maxSize))
  }
  return out
}
