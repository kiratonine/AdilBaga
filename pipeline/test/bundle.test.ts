import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBundle, qualityReport } from '../src/agent/bundle.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'Молоко Фудмастер 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const f = cp('FIX_PRICE', 'fp_3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.imageUrl = 'https://cdn.dina/1.jpg'
const sources = (['DINA', 'DANA', 'FIX_PRICE'] as const).map((s) => ({ storeCode: s, city: 'Aktau' as const, capturedAt: '2026-10-05T10:00:00.000Z', errorCount: 0, sourceStats: {} }))
const bundle = buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [f], method: 'deterministic', confidence: 1, review: 'approved' },
], sources, '2026-10-05T12:00:00.000Z')

describe('bundle', () => {
  it('matches the Go contract shape', () => {
    expect(bundle.version).toBe('1.0')
    expect(bundle.rawProducts).toHaveLength(3)
    expect(bundle.sourceRuns.map((s) => s.productCount)).toEqual([1, 1, 1])
    const g = bundle.canonicalProducts[0]!
    expect(g).toMatchObject({ canonicalName: 'Молоко FoodMaster 3.2% 1 л', category: 'milk', imageUrl: 'https://cdn.dina/1.jpg', attributes: { volumeMl: 1000, fatPercent: 3.2 } })
    expect(g.members[0]!.rawProduct).toEqual(bundle.rawProducts[0])
    expect(g.members[0]).toMatchObject({ matchMethod: 'ai', matchConfidence: 0.97, reviewStatus: 'approved' })
  })
  it('never emits undefined (Go DeepEqual on members)', () => {
    expect(JSON.stringify(bundle)).not.toContain('undefined')
    for (const r of bundle.rawProducts) for (const k of ['sourceUrl', 'brand', 'category', 'oldPrice', 'imageUrl']) expect(r).toHaveProperty(k)
  })
  it('report counts cross-store matches', () => {
    expect(qualityReport(bundle)).toContain('Matched across 2+ stores: 1')
  })
  it('writes a fixture for the Go decoder test', () => {
    const dir = new URL('../../backend-go/internal/ingestion/testdata/', import.meta.url)
    mkdirSync(dir, { recursive: true })
    writeFileSync(new URL('pipeline_bundle.json', dir), JSON.stringify(bundle, null, 2))
  })
})
