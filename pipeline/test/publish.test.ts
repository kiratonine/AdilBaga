import { describe, expect, it } from 'vitest'
import type { Cluster } from '../src/agent/match.js'
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
