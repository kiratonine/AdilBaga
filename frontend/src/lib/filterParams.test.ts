import { describe, expect, it } from 'vitest'
import type { FilterDto } from '../api/types'
import { countActive, readFilters, readSort, withFilter, withoutFilters, withSort } from './filterParams'

const filters: FilterDto[] = [
  { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 1000] },
  { key: 'lactoseFree', label: 'Без лактозы', type: 'boolean' },
]

describe('filterParams', () => {
  it('reads only known keys and valid options', () => {
    const params = new URLSearchParams('volumeMl=500&volumeMl=777&volumeMl=500&lactoseFree=yes&other=1')
    expect(readFilters(params, filters)).toEqual({ volumeMl: ['500'] })
  })

  it('reads boolean filters', () => {
    expect(readFilters(new URLSearchParams('lactoseFree=true'), filters)).toEqual({ lactoseFree: ['true'] })
  })

  it('falls back to price_asc for unknown sort', () => {
    expect(readSort(new URLSearchParams('sort=cheapest'))).toBe('price_asc')
    expect(readSort(new URLSearchParams('sort=name_asc'))).toBe('name_asc')
  })

  it('repeats params for multi-values and keeps others', () => {
    const next = withFilter(new URLSearchParams('sort=price_desc'), 'volumeMl', ['500', '1000'])
    expect(next.toString()).toBe('sort=price_desc&volumeMl=500&volumeMl=1000')
    expect(withoutFilters(next, filters).toString()).toBe('sort=price_desc')
  })

  it('omits default sort from the URL', () => {
    expect(withSort(new URLSearchParams('sort=name_asc'), 'price_asc').toString()).toBe('')
  })

  it('counts active values', () => {
    expect(countActive({ volumeMl: ['500', '1000'], lactoseFree: ['true'] })).toBe(3)
  })
})
