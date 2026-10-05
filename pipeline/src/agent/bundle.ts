import type { SourceFile, StoreCode } from '../types.js'
import type { ClassifiedProduct } from './classify.js'
import type { Cluster } from './match.js'

export type BundleRaw = { storeCode: StoreCode; sourceProductId: string; sourceUrl: string | null; name: string; brand: string | null
  category: string | null; price: number; oldPrice: number | null; imageUrl: string | null; rawPayload: Record<string, unknown> }
export type Bundle = { version: '1.0'; generatedAt: string; rawProducts: BundleRaw[]
  canonicalProducts: { canonicalName: string; brand: string | null; category: string; imageUrl: string | null
    attributes: Record<string, number | string | boolean>; members: { rawProduct: BundleRaw; matchMethod: string; matchConfidence: number; reviewStatus: string }[] }[]
  sourceRuns: { storeCode: StoreCode; capturedAt: string; productCount: number; errorCount: number }[] }

const IMAGE_ORDER: StoreCode[] = ['DINA', 'DANA', 'ANVAR', 'FIX_PRICE']

function toRaw(c: ClassifiedProduct): BundleRaw {
  const p = c.product
  return { storeCode: c.storeCode, sourceProductId: p.sourceProductId, sourceUrl: p.sourceUrl, name: p.name, brand: c.brand,
    category: p.sourceCategoryPath.join(' / ') || null, price: p.price, oldPrice: p.oldPrice, imageUrl: p.imageUrl,
    rawPayload: { ...p.rawPayload, agentFlags: c.flags.join(',') } }
}

function mode<T>(xs: T[]): T | null {
  const counts = new Map<T, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export function buildBundle(clusters: Cluster[], sources: Omit<SourceFile, 'products'>[], generatedAt: string): Bundle {
  const rawProducts: BundleRaw[] = []
  const canonicalProducts: Bundle['canonicalProducts'] = []
  for (const cl of clusters) {
    const pairs = cl.members.map((m) => ({ m, raw: toRaw(m) }))
    rawProducts.push(...pairs.map((p) => p.raw))
    const withImage = [...pairs].sort((x, y) => IMAGE_ORDER.indexOf(x.m.storeCode) - IMAGE_ORDER.indexOf(y.m.storeCode))
      .find((p) => p.raw.imageUrl?.startsWith('https://'))
    const lead = withImage?.m ?? cl.members[0]!
    const attributes: Record<string, number> = {}
    for (const [k, v] of Object.entries(lead.attributes)) if (typeof v === 'number') attributes[k] = v
    canonicalProducts.push({
      canonicalName: lead.displayName, brand: mode(cl.members.map((m) => m.brand).filter((b): b is string => !!b)),
      category: lead.category, imageUrl: withImage?.raw.imageUrl ?? null, attributes,
      members: pairs.map(({ raw }) => ({ rawProduct: raw, matchMethod: cl.method, matchConfidence: cl.confidence, reviewStatus: cl.review })),
    })
  }
  const count = (s: StoreCode) => rawProducts.filter((r) => r.storeCode === s).length
  return { version: '1.0', generatedAt, rawProducts, canonicalProducts,
    sourceRuns: sources.map((s) => ({ storeCode: s.storeCode, capturedAt: s.capturedAt, productCount: count(s.storeCode), errorCount: s.errorCount })) }
}

export function qualityReport(b: Bundle): string {
  const chains = b.canonicalProducts.map((g) => new Set(g.members.map((m) => m.rawProduct.storeCode)).size)
  const byCat = new Map<string, number>()
  for (const g of b.canonicalProducts) byCat.set(g.category, (byCat.get(g.category) ?? 0) + 1)
  const pending = b.canonicalProducts.flatMap((g) => g.members).filter((m) => m.reviewStatus === 'pending').length
  return [
    `# Data quality report (${b.generatedAt})`, '',
    ...b.sourceRuns.map((s) => `- ${s.storeCode} raw: ${s.productCount} (errors ${s.errorCount})`),
    `- Canonical: ${b.canonicalProducts.length}`,
    `- Offers: ${b.rawProducts.length}`,
    `- Matched across 2+ stores: ${chains.filter((n) => n >= 2).length}`,
    `- Matched across 3+ stores: ${chains.filter((n) => n >= 3).length}`,
    `- Missing image: ${b.canonicalProducts.filter((g) => !g.imageUrl).length}`,
    `- Pending review mappings: ${pending}`,
    '', '## Canonical by category', ...[...byCat.entries()].sort((a, c) => c[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
  ].join('\n')
}
