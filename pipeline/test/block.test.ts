import { describe, expect, it } from 'vitest'
import { blockKey, buildBlocks } from '../src/agent/block.js'
import { cp } from './helpers.js'

describe('blocking', () => {
  it('key uses category, type and size', () => {
    expect(blockKey(cp('DINA', '1', 'м', { volumeMl: 1000, fatPercent: 3.2 }))).toBe('milk|молоко|1000ml')
  })
  it('splits by size and keeps unsized items in their own block', () => {
    const blocks = buildBlocks([cp('DINA', '1', 'a', { volumeMl: 1000 }), cp('DANA', '2', 'b', { volumeMl: 900 }), cp('DANA', '3', 'c', { volumeMl: 1000 })])
    expect(blocks.map((b) => b.length).sort()).toEqual([1, 2])
  })
})
