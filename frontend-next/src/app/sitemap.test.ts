// @vitest-environment node
import { describe, expect, it } from 'vitest'
import mockCategories from '../mocks/categories.json'
import mockProducts from '../mocks/products.json'
import robots from './robots'
import sitemap from './sitemap'

describe('sitemap', () => {
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
