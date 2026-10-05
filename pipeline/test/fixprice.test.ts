import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapFixPriceItem } from '../src/scrapers/fixprice.js'

const items = JSON.parse(readFileSync(new URL('./fixtures/fixprice-products.json', import.meta.url), 'utf8'))

describe('fix price', () => {
  it('maps captured items to source products with absolute urls', () => {
    const p = mapFixPriceItem(items[0])!
    expect(p.sourceProductId).toMatch(/^fp_/)
    expect(p.price).toBeGreaterThan(0)
    expect(p.sourceUrl).toMatch(/^https:\/\/fix-price\.kz\/ru\/catalog\//)
    expect(p.imageUrl === null || p.imageUrl.startsWith('https://')).toBe(true)
  })
  it('uses special price as price and regular as oldPrice', () => {
    const p = mapFixPriceItem({ id: 7, title: 'Т', url: 'a/b', price: '500', specialPrice: { price: '400' }, images: [], brand: null })!
    expect(p).toMatchObject({ price: 400, oldPrice: 500 })
  })
  it('maps the real captured special-price item', () => {
    expect(mapFixPriceItem(items[1])).toMatchObject({ price: 224, oldPrice: 299 })
  })
})
