import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/agent/bundle.js'
import { buildDictionary } from '../src/mapping/dictionary.js'
import { assertFresh, buildSyncBundle } from '../src/sync/sync.js'
import type { SourceFile } from '../src/types.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const f = cp('FIX_PRICE', 'fp_3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.sourceCategoryPath = ['Молоко']
const day0 = '2026-10-06T06:00:00.000Z'
const meta = (s: SourceFile['storeCode']) => ({ storeCode: s, city: 'Aktau' as const, capturedAt: day0, errorCount: 0, sourceStats: {} })
const dict = buildDictionary(buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [f], method: 'deterministic', confidence: 1, review: 'approved' },
], (['DINA', 'DANA', 'FIX_PRICE'] as const).map(meta), day0))

const today = (dinaExtra: SourceFile['products'] = []): SourceFile[] => [
  { ...meta('DINA'), products: [{ ...a.product, price: 610 }, ...dinaExtra] },
  { ...meta('DANA'), products: [b.product] },
  { ...meta('FIX_PRICE'), products: [f.product] },
]

describe('sync', () => {
  it('known products keep their dictionary card and take today prices', () => {
    const { bundle, unmapped } = buildSyncBundle(today(), dict, '2026-10-07T06:00:00.000Z')
    expect(unmapped).toEqual([])
    const milk = bundle.canonicalProducts.find((g) => g.category === 'milk')!
    expect(milk.members.map((m) => m.rawProduct.storeCode).sort()).toEqual(['DANA', 'DINA'])
    expect(milk.members.find((m) => m.rawProduct.storeCode === 'DINA')!.rawProduct.price).toBe(610)
    expect(milk).toMatchObject({ canonicalName: Object.values(dict.canonicals).find((c) => c.category === 'milk')!.name, attributes: { volumeMl: 1000, fatPercent: 3.2 } })
    expect(milk.members[0]).toMatchObject({ matchMethod: 'ai', matchConfidence: 0.97, reviewStatus: 'approved' })
  })
  it('unknown product becomes a pending singleton in the learned store category', () => {
    const fresh = { ...a.product, sourceProductId: '99', name: 'Молоко Новое 2.5% 900 мл', sourceCategoryPath: ['Молоко'] }
    const { bundle, unmapped } = buildSyncBundle(today([fresh]), dict, '2026-10-07T06:00:00.000Z')
    expect(unmapped).toEqual([expect.objectContaining({ storeCode: 'DINA', sourceProductId: '99', guessedCategory: 'milk' })])
    const g = bundle.canonicalProducts.find((x) => x.members.some((m) => m.rawProduct.sourceProductId === '99'))!
    expect(g).toMatchObject({ category: 'milk', attributes: { volumeMl: 900, fatPercent: 2.5 } })
    expect(g.members).toHaveLength(1)
    expect(g.members[0]).toMatchObject({ matchMethod: 'deterministic', reviewStatus: 'pending' })
  })
  it('every raw appears in exactly one group (Go bundle contract)', () => {
    const { bundle } = buildSyncBundle(today(), dict, '2026-10-07T06:00:00.000Z')
    expect(bundle.canonicalProducts.flatMap((g) => g.members)).toHaveLength(bundle.rawProducts.length)
    expect(bundle.sourceRuns.map((s) => s.storeCode).sort()).toEqual(['DANA', 'DINA', 'FIX_PRICE'])
  })
  it('refuses stale or missing source files', () => {
    const now = new Date('2026-10-07T06:00:00.000Z')
    expect(() => assertFresh(today(), ['DINA', 'DANA', 'FIX_PRICE'], now, 36)).not.toThrow()
    expect(() => assertFresh(today().slice(0, 2), ['DINA', 'DANA', 'FIX_PRICE'], now, 36)).toThrow(/FIX_PRICE: source file missing/)
    expect(() => assertFresh(today(), ['DINA', 'DANA', 'FIX_PRICE'], new Date('2026-10-09T06:00:00.000Z'), 36)).toThrow(/stale/)
  })
  it('sync code never touches the LLM', () => {
    for (const file of ['../src/sync/sync.ts', '../src/cli/sync.ts', '../src/mapping/dictionary.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(src).not.toMatch(/gemini|classifyBatch|matchBlock|GEMINI_API_KEY/)
    }
  })
})
