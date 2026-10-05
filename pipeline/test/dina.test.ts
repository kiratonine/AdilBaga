import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapDinaItem, scrapeDina } from '../src/scrapers/dina.js'

const page = JSON.parse(readFileSync(new URL('./fixtures/dina-page.json', import.meta.url), 'utf8'))
const fakeFetch = (async () => new Response(JSON.stringify(page), { status: 200 })) as typeof fetch

describe('dina', () => {
  it('maps a piece item with category path and image', () => {
    const p = mapDinaItem(page.data.products.edges[0])!
    expect(p).toMatchObject({ sourceProductId: '5865', price: 361, imageUrl: 'https://cdn.dina/5865.jpg',
      sourceUrl: 'https://dinamarket.kz/product/krupa-promo-mannaya-700-g', sourceCategoryPath: ['Макароны, крупы, мука', 'Крупы'] })
  })
  it('converts per-gram weight price to per-kg integer tenge', () => {
    expect(mapDinaItem(page.data.products.edges[1])!.price).toBe(1200)
  })
  it('drops items without a name', () => {
    expect(mapDinaItem(page.data.products.edges[2])).toBeNull()
  })
  it('stops paging at pageInfo.total and records stats', async () => {
    const file = await scrapeDina({ fetchImpl: fakeFetch, delayMs: 0 })
    expect(file.storeCode).toBe('DINA')
    expect(file.products).toHaveLength(2)
    expect(file.sourceStats).toMatchObject({ total: 3, pages: 1, shopId: '28' })
  })
})
