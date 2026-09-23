import { describe, expect, it } from 'vitest'
import { mockProducts as all } from '../mocks'
import { createMockAdapter, queryProducts } from './mockAdapter'
import { ApiError } from './types'

const api = createMockAdapter({ delayMs: 0 })

describe('queryProducts', () => {
  it('sorts by min price ascending by default', () => {
    const prices = queryProducts(all, { category: 'milk' }).map((p) => p.minPrice)
    expect(prices.length).toBeGreaterThan(0)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('applies OR within a filter and AND between filters', () => {
    const result = queryProducts(all, {
      category: 'milk',
      filters: { volumeMl: ['500', '1000'], fatPercent: ['3.2'] },
    })
    expect(result.length).toBeGreaterThan(0)
    for (const p of result) {
      expect([500, 1000]).toContain(p.attributes.volumeMl)
      expect(p.attributes.fatPercent).toBe(3.2)
    }
  })

  it('handles boolean filters both ways', () => {
    const sliced = queryProducts(all, { category: 'bread', filters: { sliced: ['true'] } })
    const whole = queryProducts(all, { category: 'bread', filters: { sliced: ['false'] } })
    expect(sliced.length).toBeGreaterThan(0)
    expect(whole.length).toBeGreaterThan(0)
    expect(sliced.every((p) => p.attributes.sliced === true)).toBe(true)
    expect(whole.every((p) => p.attributes.sliced === false)).toBe(true)
  })

  it('searches across categories by name and brand, case-insensitive', () => {
    expect(queryProducts(all, { search: 'FOODMASTER' }).length).toBe(3)
    expect(queryProducts(all, { search: 'шедевр' }).every((p) => p.category.slug === 'oil')).toBe(true)
  })
})

describe('mock adapter', () => {
  it('paginates with limit/offset; the last page is shorter than limit', async () => {
    const first = await api.getProducts({ limit: 24, offset: 0 })
    const last = await api.getProducts({ limit: 24, offset: 24 })
    expect(first).toHaveLength(24)
    expect(last).toHaveLength(all.length - 24)
    expect(last[0].id).not.toBe(first[0].id)
  })

  it('does not rely on optional contract fields', async () => {
    const dashboard = await api.getDashboard()
    expect(all.some((p) => p.offers.some((o) => 'inStock' in o))).toBe(false)
    expect(dashboard.locations.some((l) => 'id' in l)).toBe(false)
    expect(dashboard.priceSpreads.some((s) => 'imageUrl' in s || 'minStoreName' in s)).toBe(false)
  })

  it('keeps offers sorted by price and minPrice equal to the first offer', () => {
    for (const p of all) {
      expect(p.minPrice).toBe(p.offers[0].price)
      const prices = p.offers.map((o) => o.price)
      expect(prices).toEqual([...prices].sort((a, b) => a - b))
    }
  })

  it('rejects unknown ids with ApiError 404', async () => {
    await expect(api.getProduct('nope')).rejects.toBeInstanceOf(ApiError)
    await expect(api.getCategoryFilters('nope')).rejects.toMatchObject({ status: 404 })
  })
})
