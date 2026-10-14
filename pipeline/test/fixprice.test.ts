import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { FIXPRICE_SCOPE_ALIASES, mapFixPriceItem, scrapeFixPrice } from '../src/scrapers/fixprice.js'

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

describe('fix price scrape scope', () => {
  beforeAll(() => { process.env.FIXPRICE_CITY_ID = '1'; process.env.FIXPRICE_COUNTRY_ID = '3' })

  const mkItems = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ ...items[0], id: 1000 + from + i }))
  const menu = [{ alias: 'produkty-i-napitki' }, { alias: 'dlya-doma' }]

  // Фейковый API: меню + товары по алиасу; xCount — значение заголовка x-count, pages — ответы по страницам
  function makeFetch(opts: { menu?: { alias: string }[]; xCount?: number; pages?: unknown[][] } = {}) {
    const urls: string[] = []
    const impl = (async (url: string) => {
      urls.push(String(url))
      if (String(url).endsWith('/category/menu')) return new Response(JSON.stringify(opts.menu ?? menu))
      const page = Number(new URL(String(url)).searchParams.get('page'))
      const list = (opts.pages ?? [mkItems(3)])[page - 1] ?? []
      const headers: Record<string, string> = opts.xCount !== undefined ? { 'x-count': String(opts.xCount) } : {}
      return new Response(JSON.stringify(list), { headers })
    }) as unknown as typeof fetch
    return { impl, urls }
  }

  it('walks only scope aliases', async () => {
    const { impl, urls } = makeFetch()
    const file = await scrapeFixPrice({ fetchImpl: impl, delayMs: 0, aliases: FIXPRICE_SCOPE_ALIASES })
    expect(urls.some((u) => u.includes('/product/in/produkty-i-napitki'))).toBe(true)
    expect(urls.some((u) => u.includes('/product/in/dlya-doma'))).toBe(false)
    expect(file.sourceStats).toMatchObject({ mode: 'api', categories: 1, scoped: true })
  })

  it('uses page size 28 and stops by x-count', async () => {
    const { impl, urls } = makeFetch({ xCount: 30, pages: [mkItems(28), mkItems(2, 28)] })
    const file = await scrapeFixPrice({ fetchImpl: impl, delayMs: 0, aliases: FIXPRICE_SCOPE_ALIASES })
    const productUrls = urls.filter((u) => u.includes('/product/in/produkty-i-napitki'))
    expect(productUrls).toHaveLength(2)
    expect(productUrls.every((u) => u.includes('limit=28'))).toBe(true)
    expect(file.products).toHaveLength(30)
  })

  it('stops by x-count even when the last page is full', async () => {
    const { impl, urls } = makeFetch({ xCount: 28, pages: [mkItems(28), mkItems(28, 28)] })
    await scrapeFixPrice({ fetchImpl: impl, delayMs: 0, aliases: FIXPRICE_SCOPE_ALIASES })
    expect(urls.filter((u) => u.includes('/product/in/'))).toHaveLength(1)
  })

  it('fails when a scope alias is missing from the menu', async () => {
    const { impl, urls } = makeFetch({ menu: [{ alias: 'dlya-doma' }] })
    await expect(scrapeFixPrice({ fetchImpl: impl, delayMs: 0, aliases: FIXPRICE_SCOPE_ALIASES }))
      .rejects.toThrow(/scope alias produkty-i-napitki not in category menu/)
    expect(urls.some((u) => u.includes('/product/in/'))).toBe(false)
  })

  it('walks the whole menu without aliases', async () => {
    const { impl, urls } = makeFetch()
    const file = await scrapeFixPrice({ fetchImpl: impl, delayMs: 0 })
    expect(urls.some((u) => u.includes('/product/in/produkty-i-napitki'))).toBe(true)
    expect(urls.some((u) => u.includes('/product/in/dlya-doma'))).toBe(true)
    expect(file.sourceStats).toMatchObject({ categories: 2, scoped: false })
  })
})
