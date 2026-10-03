import { describe, expect, it } from 'vitest'
import type { StoreLocationDto } from '../api/types'
import { groupByStore, locationKey, storeColor } from './stores'

const point = (storeCode: StoreLocationDto['storeCode'], address: string): StoreLocationDto => ({
  storeCode,
  storeName: storeCode,
  name: storeCode,
  address,
  latitude: 43.6,
  longitude: 51.1,
})

describe('stores', () => {
  it('groups points by chain in order of first appearance', () => {
    const groups = groupByStore([point('DANA', 'a'), point('DINA', 'b'), point('DANA', 'c')])
    expect(groups.map((g) => [g.storeCode, g.locations.map((l) => l.address)])).toEqual([
      ['DANA', ['a', 'c']],
      ['DINA', ['b']],
    ])
  })

  it('gives each known chain its own color and unknown ones a neutral gray', () => {
    const colors = new Set(['DINA', 'DANA', 'FIX_PRICE'].map(storeColor))
    expect(colors.size).toBe(3)
    expect(storeColor('SMALL')).toBe('#697178')
  })

  it('builds the marker key from chain and address', () => {
    expect(locationKey(point('DINA', '5-й микрорайон, 30'))).toBe('DINA:5-й микрорайон, 30')
  })
})
