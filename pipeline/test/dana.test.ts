import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDanaPage, parseDanaPageCount, parseDanaSections } from '../src/scrapers/dana.js'

const html = readFileSync(new URL('./fixtures/dana-page.html', import.meta.url), 'utf8')
const weightHtml = readFileSync(new URL('./fixtures/dana-weight.html', import.meta.url), 'utf8')
const rootHtml = readFileSync(new URL('./fixtures/dana-root.html', import.meta.url), 'utf8')

const card = (opts: { href?: string; id?: string; price?: string; old?: string; style?: string }) => `
<div class="product-item-container" id="${opts.id ?? 'bx_1_555_abc'}" data-entity="item"><div class="product-item">
  <span class="product-item-image-original" style="${opts.style ?? "background-image: url('/upload/a.jpg');"}"></span>
  <div class="product-item-title"><a href="${opts.href ?? '/catalog/489/555/'}">Товар</a></div>
  <span class="product-item-price-old">${opts.old ?? ''}</span>
  <span class="product-item-price-current">${opts.price ?? '1&nbsp;170 тенге'}</span>
</div></div>`

describe('dana', () => {
  it('parses every card on a catalog page', () => {
    const items = parseDanaPage(html, ['Продукты питания'])
    expect(items.length).toBe(20)
    for (const p of items) {
      expect(p.sourceProductId).toMatch(/^dana_\d+$/)
      expect(p.price).toBeGreaterThan(0)
      expect(p.sourceUrl).toMatch(/^https:\/\/dana-market\.kz\/catalog\/\d+\/\d+\/$/)
      expect(p.imageUrl).toMatch(/^https:\/\/dana-market\.kz\/upload\//)
      expect(p.sourceCategoryPath).toEqual(['Продукты питания'])
    }
  })

  it('reads id, price and image of a known card', () => {
    const p = parseDanaPage(html, ['Продукты питания']).find(x => x.sourceProductId === 'dana_17801')!
    expect(p).toMatchObject({ name: 'NEMOLOKO РИСОВЫЙ КЛАССИЧЕСКИЙ ЛАЙТ 1Л', price: 1170, oldPrice: null, sourceUrl: 'https://dana-market.kz/catalog/489/17801/' })
    expect(p.imageUrl).toBe('https://dana-market.kz/upload/iblock/7f3/wgbjb9nkewvpj3gi9sualynj027o43wg.jpg')
  })

  it('uses the per-kg price from the item JSON for weight goods, not the per-step card price', () => {
    const p = parseDanaPage(weightHtml, ['Продукты питания']).find(x => x.sourceProductId === 'dana_28878')!
    expect(p.name).toContain('НЕКТАРИН КРАСНЫЙ')
    expect(p.price).toBe(833) // карточка показывает «416.50 тенге» — цену шага 0,5 кг
    expect(p.oldPrice).toBeNull()
  })

  it('reads decimal card prices without gluing the fraction (no JSON → DOM fallback)', () => {
    expect(parseDanaPage(card({ price: '416.50 тенге' }), [])[0]!.price).toBe(417)
    expect(parseDanaPage(card({ price: '1&nbsp;170,00 тенге' }), [])[0]!.price).toBe(1170)
  })

  it('takes the id from the last numeric href segment, falling back to the container id', () => {
    expect(parseDanaPage(card({ href: '/catalog/489/17801/' }), [])[0]!.sourceProductId).toBe('dana_17801')
    expect(parseDanaPage(card({ href: '/catalog/489/17801/?x=1' }), [])[0]!.sourceProductId).toBe('dana_17801')
    expect(parseDanaPage(card({ href: '/catalog/489/nope/', id: 'bx_3966226736_777_deadbeef' }), [])[0]!.sourceProductId).toBe('dana_777')
  })

  it('keeps oldPrice only when it is above the current price', () => {
    expect(parseDanaPage(card({ old: '1&nbsp;500 тенге' }), [])[0]).toMatchObject({ price: 1170, oldPrice: 1500 })
    expect(parseDanaPage(card({ old: '1&nbsp;170 тенге' }), [])[0]!.oldPrice).toBeNull()
  })

  it('skips cards without a price and tolerates a missing image', () => {
    expect(parseDanaPage(card({ price: '' }), [])).toHaveLength(0)
    expect(parseDanaPage(card({ style: '' }), [])[0]!.imageUrl).toBeNull()
  })

  it('finds no cards in the old markup', () => {
    expect(parseDanaPage('<div class="catalog_item_wrapp" data-id="1"><div class="item-title"><a href="/x/">T</a></div><span class="price_value">10</span></div>', [])).toEqual([])
  })
})

describe('dana pagination and sections', () => {
  const ROOT = '/catalog/483/'
  it('reads the page count from the pagination block', () => {
    expect(parseDanaPageCount(html)).toBe(4)
    expect(parseDanaPageCount(rootHtml)).toBe(178)
    expect(parseDanaPageCount('<html><body></body></html>')).toBe(1)
  })
  it('lists first-level sections of a root from the menu, sorted and unique', () => {
    const sections = parseDanaSections(rootHtml, ROOT)
    expect(sections).toHaveLength(15)
    expect(sections).toContain('/catalog/488/')
    expect(sections).toContain('/catalog/500/')
    // листья (489 Молоко, 499 Яйца) и другие корни не попадают
    expect(sections).not.toContain('/catalog/489/')
    expect(sections).not.toContain('/catalog/589/')
    expect(sections).not.toContain(ROOT)
    expect(sections).toEqual([...sections].sort())
  })
  it('returns no sections for an unknown root', () => {
    expect(parseDanaSections(rootHtml, '/catalog/999999/')).toEqual([])
  })
})
