// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogApi } from '../api/catalogApi'
import mockCategories from '../mocks/categories.json'
import mockProducts from '../mocks/products.json'
import robots from './robots'
import sitemap from './sitemap'

// Request-time Next API needs a request context; this pure sitemap test supplies it.
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(),
  connection: vi.fn(async () => undefined),
}))

describe('sitemap', () => {
  afterEach(() => vi.restoreAllMocks())

  it('bounds concurrent pagination and preserves exact RU/KK order and product lastmod', async () => {
    const base = await catalogApi.getProduct(mockProducts[0].id)
    let active = 0, peak = 0
    const requested: number[] = []
    vi.spyOn(catalogApi, 'getProducts').mockImplementation(async ({ offset = 0, limit }) => {
      expect(limit).toBe(100)
      requested.push(offset); peak = Math.max(peak, ++active)
      try {
        await new Promise(resolve => setTimeout(resolve, 5))
        return Array.from({ length: Math.max(0, Math.min(100, 350 - offset)) }, (_, i) => ({
          ...base, id: `page-${offset + i}`, snapshotAt: `2026-10-${(offset + i) % 2 ? '26' : '27'}T00:00:00.123Z`,
        }))
      } finally { active-- }
    })
    const entries = (await sitemap()).filter(e => e.url.includes('/products/'))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(4)
    expect(requested.length).toBeLessThanOrEqual(7) // at most three bounded speculative pages
    expect(entries).toHaveLength(700)
    for (let i = 0; i < 350; i++) {
      expect(entries[i * 2].url).toBe(`http://localhost:3000/ru/products/page-${i}`)
      expect(entries[i * 2 + 1].url).toBe(`http://localhost:3000/kk/products/page-${i}`)
      expect(entries[i * 2].lastModified).toBe(`2026-10-${i % 2 ? '26' : '27'}T00:00:00.123Z`)
    }
  })

  it('never requests beyond the fixed 50-page traversal or emits more than 5000 products', async () => {
    const base = await catalogApi.getProduct(mockProducts[0].id)
    const requested: number[] = []
    vi.spyOn(catalogApi, 'getProducts').mockImplementation(async ({ offset = 0 }) => {
      requested.push(offset)
      return Array.from({ length: 100 }, (_, i) => ({ ...base, id: `page-${offset + i}` }))
    })
    expect((await sitemap()).filter(e => e.url.includes('/products/'))).toHaveLength(10000)
    expect(requested).toHaveLength(50)
    expect(Math.max(...requested)).toBe(4900)
  })

  it('propagates page failures instead of emitting a successful partial sitemap', async () => {
    const base = await catalogApi.getProduct(mockProducts[0].id)
    vi.spyOn(catalogApi, 'getProducts').mockImplementation(async ({ offset = 0 }) => {
      if (offset === 200) throw Error('fixture_api_failure')
      return Array.from({ length: 100 }, (_, i) => ({ ...base, id: `page-${offset + i}` }))
    })
    await expect(sitemap()).rejects.toThrow('fixture_api_failure')
  })

  it('keeps a short first page to one products request', async () => {
    const base = await catalogApi.getProduct(mockProducts[0].id)
    const getProducts = vi.spyOn(catalogApi, 'getProducts').mockResolvedValue([base])
    expect((await sitemap()).filter(e => e.url.includes('/products/'))).toHaveLength(2)
    expect(getProducts).toHaveBeenCalledTimes(1)
  })

  it('lists static pages, every category and every product in both languages', async () => {
    const entries = await sitemap()
    expect(entries).toHaveLength(2 * (2 + mockCategories.length + mockProducts.length))

    const urls = entries.map((entry) => entry.url)
    expect(urls).not.toContain('http://localhost:3000/ru')
    expect(urls).toContain('http://localhost:3000/kk/catalog')
    expect(urls).toContain('http://localhost:3000/kk/collections/milk')
    expect(urls).toContain(`http://localhost:3000/ru/products/${mockProducts[0].id}`)
    expect(urls.some((url) => url.includes('/search'))).toBe(false)
  })

  it('links each language version to the others with hreflang', async () => {
    const entry = (await sitemap()).find((e) => e.url === 'http://localhost:3000/kk/collections/milk')
    expect(entry?.alternates?.languages).toEqual({
      ru: 'http://localhost:3000/ru/collections/milk',
      kk: 'http://localhost:3000/kk/collections/milk',
      'x-default': 'http://localhost:3000/ru/collections/milk',
    })
  })
})

describe('robots', () => {
  it('allows crawling and points to the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'http://localhost:3000/sitemap.xml',
    })
  })
})
