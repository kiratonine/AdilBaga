import { describe, expect, it } from 'vitest'
import type { OfferDto } from '../api/types'
import { discountPercent, topOffers } from './offers'

const offer = (storeName: string, price: number, oldPrice: number | null = null): OfferDto => ({
  storeCode: 'DINA',
  storeName,
  price,
  oldPrice,
})

describe('topOffers', () => {
  it('shows all offers sorted by price when there are no more than the limit', () => {
    const result = topOffers([offer('C', 650), offer('A', 570), offer('B', 620)], 3)
    expect(result.shown.map((o) => o.storeName)).toEqual(['A', 'B', 'C'])
    expect(result.hiddenCount).toBe(0)
    expect(result.maxPrice).toBe(650)
  })

  it('cuts to the cheapest offers and reports the hidden ones with the max price', () => {
    const result = topOffers([offer('E', 900), offer('A', 500), offer('D', 800), offer('B', 600), offer('C', 700)], 3)
    expect(result.shown.map((o) => o.storeName)).toEqual(['A', 'B', 'C'])
    expect(result.hiddenCount).toBe(2)
    expect(result.maxPrice).toBe(900)
  })

  it('handles a single offer', () => {
    expect(topOffers([offer('A', 210)], 3)).toEqual({ shown: [offer('A', 210)], hiddenCount: 0, maxPrice: 210 })
  })
})

describe('discountPercent', () => {
  it('rounds the discount down', () => {
    expect(discountPercent(offer('A', 570, 620))).toBe(8)
    expect(discountPercent(offer('A', 570, 660))).toBe(13)
  })

  it('is null without a real old price or below one percent', () => {
    expect(discountPercent(offer('A', 570))).toBeNull()
    expect(discountPercent(offer('A', 570, 570))).toBeNull()
    expect(discountPercent(offer('A', 570, 500))).toBeNull()
    expect(discountPercent(offer('A', 995, 1000))).toBeNull()
    expect(discountPercent(undefined)).toBeNull()
  })
})
