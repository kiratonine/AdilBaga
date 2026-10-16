import { describe, expect, it } from 'vitest'
import { mapPool } from '../src/pool.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('mapPool', () => {
  it('keeps result order', async () => {
    expect(await mapPool([30, 10, 20], 2, async (ms, i) => { await sleep(ms); return i })).toEqual([0, 1, 2])
  })

  it('never exceeds the limit', async () => {
    let active = 0, peak = 0
    await mapPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active++; peak = Math.max(peak, active)
      await sleep(5)
      active--
    })
    expect(peak).toBe(3)
  })

  it('handles a limit larger than the item count and an empty list', async () => {
    expect(await mapPool([1, 2], 5, async x => x * 2)).toEqual([2, 4])
    expect(await mapPool([], 3, async x => x)).toEqual([])
  })
})
