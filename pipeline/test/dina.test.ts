import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertAktauShop, mapDinaItem, scrapeDina } from '../src/scrapers/dina.js'

const page = JSON.parse(readFileSync(new URL('./fixtures/dina-page.json', import.meta.url), 'utf8'))
const edges: unknown[] = page.data.products.edges
const hidden = { id: '777', name: 'Манка Мистраль 800 г', slug: 'manka', price: 450, price_type: 'piece', categories: [{ id: '70', name: 'Крупы' }] }
// Товар 777 виден только при запросе подкатегории 70, которую корневой фильтр не отдаёт
const byCategory: Record<string, unknown[]> = { '7': [edges[0], edges[1]], '1': [edges[1], edges[2]], '70': [hidden] }
const requests: { query: string; variables: Record<string, unknown> }[] = []
// Фейковый сервер: список категорий и товаров с фильтром category_id (как у реального API)
const fakeFetch = (async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body))
  requests.push(body)
  if (/shops\s*\{/.test(body.query)) return new Response(JSON.stringify({ data: { shops: [{ id: '28', name: 'Гипермаркет 301', city: { name: 'Актау' } }] } }))
  if (/categories\s*\(/.test(body.query)) return new Response(JSON.stringify({ data: { categories: [{ id: '7', name: 'Крупы' }, { id: '1', name: 'Овощи' }] } }))
  const list = byCategory[String(body.variables.categoryId)] ?? edges
  return new Response(JSON.stringify({ data: { products: { pageInfo: { total: 3 }, edges: list } } }))
}) as unknown as typeof fetch

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
  it('walks root and discovered sub-categories with category_id and dedupes shared products', async () => {
    requests.length = 0
    const file = await scrapeDina({ fetchImpl: fakeFetch, delayMs: 0 })
    expect(file.storeCode).toBe('DINA')
    expect(file.products.map((p) => p.sourceProductId).sort()).toEqual(['5865', '777', '900'])
    const used = requests.filter((r) => r.variables.categoryId).map((r) => r.variables.categoryId)
    expect(new Set(used)).toEqual(new Set(['7', '1', '70']))
    expect(file.sourceStats).toMatchObject({ total: 3, categories: 3, shopId: '28', shopCity: 'Актау' })
  })
})

describe('assertAktauShop', () => {
  it('accepts Aktau shop', () => {
    expect(() => assertAktauShop([{ id: '28', city: { name: 'Актау' } }], '28')).not.toThrow()
  })
  it('rejects non-Aktau shop', () => {
    expect(() => assertAktauShop([{ id: '28', city: { name: 'Актобе' } }], '28')).toThrow(/not in Aktau/)
  })
  it('rejects missing shop', () => {
    expect(() => assertAktauShop([{ id: '14', city: { name: 'Актобе' } }], '28')).toThrow(/not found/)
  })
})
