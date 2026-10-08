import { describe, expect, it } from 'vitest'
import { classifyBatch } from '../src/agent/classify.js'
import type { SourceProduct } from '../src/types.js'

const prod = (id: string, name: string): SourceProduct => ({ sourceProductId: id, name, price: 500, oldPrice: null,
  imageUrl: null, sourceUrl: null, brand: null, sourceCategoryPath: [], rawPayload: {} })
const items = [
  { storeCode: 'DINA' as const, product: prod('1', 'Молоко FoodMaster 3,2% 1 л') },
  { storeCode: 'DINA' as const, product: prod('2', 'САХАР "АНВАР" 1КГ') },
]
const good = { items: [
  { id: 'DINA:1', category: 'milk', productType: 'молоко', brand: 'FoodMaster', volumeMl: 1000, fatPercent: 3.2, displayName: 'Молоко FoodMaster 3.2% 1 л' },
  { id: 'DINA:2', category: 'sugar', productType: 'сахар', brand: 'Анвар', weightGrams: 1000, displayName: 'Сахар Анвар 1 кг' },
] }

describe('classify', () => {
  it('accepts valid llm output', async () => {
    const out = await classifyBatch(items, async () => good)
    expect(out.map((c) => c.category)).toEqual(['milk', 'sugar'])
    expect(out[0]!.attributes).toEqual({ volumeMl: 1000, fatPercent: 3.2 })
  })
  it('keeps brand Анвар for non-anvar store', async () => {
    const out = await classifyBatch(items, async () => good)
    expect(out[1]).toMatchObject({ storeCode: 'DINA', brand: 'Анвар' })
  })
  it('regex size wins over llm size and flags the conflict', async () => {
    const wrong = structuredClone(good); wrong.items[0]!.volumeMl = 900
    const out = await classifyBatch(items, async () => wrong)
    expect(out[0]!.attributes.volumeMl).toBe(1000)
    expect(out[0]!.flags).toContain('size_conflict')
  })
  it('rejects unknown ids and categories, retries once, then falls back to other', async () => {
    let calls = 0
    const bad = { items: [{ id: 'DINA:999', category: 'spaceships', productType: 'x', brand: null, displayName: 'x' }] }
    const out = await classifyBatch(items, async () => { calls++; return bad })
    expect(calls).toBe(2)
    expect(out.map((c) => c.category)).toEqual(['other', 'other'])
    expect(out.every((c) => c.flags.includes('llm_fallback'))).toBe(true)
  })
})
