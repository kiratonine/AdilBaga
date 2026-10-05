import { describe, expect, it } from 'vitest'
import type { Cluster } from '../src/agent/match.js'
import { isVariableWeight } from '../src/mapping/weight.js'
import { isolateForPublish } from '../src/mapping/publish.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const c = cp('FIX_PRICE', 'fp_3', 'Молоко FM 3.2% 1000 мл', { volumeMl: 1000, fatPercent: 3.2 })

describe('isolateForPublish', () => {
  it('splits a pending multi-store cluster into singletons keeping metadata', () => {
    const out = isolateForPublish([{ members: [a, b, c], method: 'ai', confidence: 0.85, review: 'pending' }])
    expect(out).toHaveLength(3)
    out.forEach((cl, i) => {
      expect(cl.members).toHaveLength(1)
      expect(cl).toMatchObject({ method: 'ai', confidence: 0.85, review: 'pending' })
      expect(cl.members[0]).toBe([a, b, c][i])
    })
  })
  it('leaves approved clusters and singletons untouched', () => {
    const input: Cluster[] = [
      { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
      { members: [c], method: 'deterministic', confidence: 1, review: 'pending' },
    ]
    expect(isolateForPublish(input)).toEqual(input)
  })
})

const cucumberKg = cp('DINA', '10', 'Огурцы', {}, null, 'огурцы', 'vegetables')
cucumberKg.product.rawPayload = { price_type: 'weight', isWeightProduct: true }
const cucumberPiece = cp('DANA', 'dana_11', 'Огурцы 1 шт', {}, null, 'огурцы', 'vegetables')
const cucumberKg2 = cp('DANA', 'dana_12', 'Огурцы ВЕС', {}, null, 'огурцы', 'vegetables')
const cucumberPiece2 = cp('FIX_PRICE', 'fp_13', 'Огурцы 1 шт', {}, null, 'огурцы', 'vegetables')

describe('isVariableWeight', () => {
  it('DINA by payload flags', () => {
    expect(isVariableWeight('DINA', cucumberKg.product)).toBe(true)
    expect(isVariableWeight('DINA', { name: 'Огурцы', rawPayload: { price_type: 'unit' } })).toBe(false)
  })
  it('DANA by the word ВЕС / ВЕСОВОЙ in the name, not by substrings', () => {
    expect(isVariableWeight('DANA', { name: "СЫР 'ЭМИР ФАСОВ' ВЕСОВОЙ  4039", rawPayload: {} })).toBe(true)
    expect(isVariableWeight('DANA', { name: 'ПЕЧЕНЬ ГОВЯЖЬЯ ВЕС 1188', rawPayload: {} })).toBe(true)
    expect(isVariableWeight('DANA', { name: 'КОНФЕТЫ ВЕСНА 200 Г', rawPayload: {} })).toBe(false)
    expect(isVariableWeight('FIX_PRICE', { name: 'Огурцы ВЕС', rawPayload: {} })).toBe(false)
  })
})

describe('isolateForPublish weight guard', () => {
  it('weighted item in a group with a piece item becomes its own card', () => {
    const out = isolateForPublish([{ members: [cucumberKg, cucumberPiece], method: 'ai', confidence: 0.97, review: 'approved' }])
    expect(out.map((c) => c.members.map((m) => m.product.sourceProductId))).toEqual([['dana_11'], ['10']])
    expect(out.every((c) => c.review === 'approved' && c.method === 'ai')).toBe(true)
  })
  it('two weighted items from different chains stay together', () => {
    const input: Cluster[] = [{ members: [cucumberKg, cucumberKg2], method: 'ai', confidence: 0.97, review: 'approved' }]
    expect(isolateForPublish(input)).toEqual(input)
  })
  it('several piece items stay together while the weighted one is split off', () => {
    const out = isolateForPublish([{ members: [cucumberKg, cucumberPiece, cucumberPiece2], method: 'ai', confidence: 0.97, review: 'approved' }])
    expect(out.map((c) => c.members.length).sort()).toEqual([1, 2])
  })
})
