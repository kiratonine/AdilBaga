import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDanaPage, scrapeDana } from '../src/scrapers/dana.js'

const html = readFileSync(new URL('./fixtures/dana-page.html', import.meta.url), 'utf8')

describe('dana', () => {
  it('parses every card on a catalog page', () => {
    const items = parseDanaPage(html, ['Продукты питания', 'Крупы'])
    expect(items.length).toBe(20)
    for (const p of items) {
      expect(p.sourceProductId).toMatch(/^dana_\d+$/)
      expect(p.price).toBeGreaterThan(0)
      expect(p.sourceUrl).toMatch(/^https:\/\/dana-market\.kz\//)
      expect(p.sourceCategoryPath).toEqual(['Продукты питания', 'Крупы'])
    }
  })
  it('stops paging when a page brings no new ids', async () => {
    let calls = 0
    const fakeFetch = (async () => { calls++; return new Response(html, { status: 200 }) }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: [{ path: '/catalog/x/', name: 'X' }] })
    expect(calls).toBe(2) // page 1 новые, page 2 те же → стоп
    expect(file.products).toHaveLength(20)
  })
  it('treats 404 past the last page as end of section, not an error', async () => {
    const fakeFetch = (async (url: string) => String(url).endsWith('PAGEN_1=1') ? new Response(html) : new Response('', { status: 404 })) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: [{ path: '/catalog/x/', name: 'X' }] })
    expect(file.errorCount).toBe(0)
    expect(file.products).toHaveLength(20)
  })
})
