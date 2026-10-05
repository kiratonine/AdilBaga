import { describe, expect, it } from 'vitest'
import { applyGuards, matchBlock } from '../src/agent/match.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 2.5% 1 л', { volumeMl: 1000, fatPercent: 2.5 })
const b = cp('DANA', '2', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const c = cp('FIX_PRICE', '3', 'Молоко Фудмастер 2,5% 1л', { volumeMl: 1000, fatPercent: 2.5 })
const d = cp('DINA', '4', 'Молоко FoodMaster 2.5% 1 л ультрапаст', { volumeMl: 1000, fatPercent: 2.5 })

describe('matching', () => {
  it('single-store block never calls the llm', async () => {
    const out = await matchBlock([a, d], async () => { throw new Error('must not call') })
    expect(out).toHaveLength(2)
    expect(out.every((x) => x.method === 'deterministic' && x.members.length === 1)).toBe(true)
  })
  it('applies confidence policy', async () => {
    const llm = async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.97 }, { ids: ['DANA:2'], confidence: 1 }] })
    const out = await matchBlock([a, b, c], llm)
    const pair = out.find((x) => x.members.length === 2)!
    expect(pair).toMatchObject({ method: 'ai', review: 'approved' })
  })
  it('0.80–0.949 becomes pending, < 0.80 is split', async () => {
    const mid = await matchBlock([a, c], async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.85 }] }))
    expect(mid[0]).toMatchObject({ review: 'pending' })
    const low = await matchBlock([a, c], async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.6 }] }))
    expect(low).toHaveLength(2)
  })
  it('guard splits different fat', () => {
    expect(applyGuards({ members: [a, b], method: 'ai', confidence: 0.99, review: 'approved' })).toHaveLength(2)
  })
  it('guard never merges same store', () => {
    const out = applyGuards({ members: [a, d, c], method: 'ai', confidence: 0.99, review: 'approved' })
    expect(out.every((cl) => new Set(cl.members.map((m) => m.storeCode)).size === cl.members.length)).toBe(true)
    expect(out.flatMap((cl) => cl.members)).toHaveLength(3)
  })
  it('items the llm forgot become singletons', async () => {
    const out = await matchBlock([a, b, c], async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.99 }] }))
    expect(out.flatMap((x) => x.members)).toHaveLength(3)
  })
})
