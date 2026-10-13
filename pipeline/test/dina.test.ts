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

describe('dina scope roots', () => {
  it('walks only the listed root categories and does not enqueue foreign sub-categories', async () => {
    requests.length = 0
    const file = await scrapeDina({ fetchImpl: fakeFetch, delayMs: 0, scopeRoots: ['Крупы'] })
    const used = requests.filter((r) => r.variables.categoryId).map((r) => r.variables.categoryId)
    expect(new Set(used)).toEqual(new Set(['7']))
    expect(file.sourceStats).toMatchObject({ categories: 1, scoped: true })
  })
  it('fails when the scope matches no category', async () => {
    await expect(scrapeDina({ fetchImpl: fakeFetch, delayMs: 0, scopeRoots: ['Нет такой'] })).rejects.toThrow(/scope filter/)
  })
})

// Батч-сервер: разбирает алиасы из body.query и отвечает по таблице { categoryId → товары }
const ALIAS_RE = /p(\d+): products\(shop_id: \d+, _page: (\d+), _limit: \d+, category_id: (\d+)\)/g
type Alias = { alias: string; page: number; categoryId: string }
const item = (id: string) => ({ id, name: `Товар ${id}`, slug: `t-${id}`, price: 100, price_type: 'piece' })
const items = (cat: string, n: number) => Array.from({ length: n }, (_, i) => item(`${cat}-${i}`))
function batchServer(table: Record<string, unknown[]>, opts: { fail?: (a: Alias) => boolean; total?: Record<string, number>; noTotal?: string[] } = {}) {
  const calls: Alias[][] = []
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (/shops\s*\{/.test(body.query)) return new Response(JSON.stringify({ data: { shops: [{ id: '28', name: 'Гипермаркет 301', city: { name: 'Актау' } }] } }))
    const aliases: Alias[] = [...String(body.query).matchAll(ALIAS_RE)].map((m) => ({ alias: `p${m[1]}`, page: Number(m[2]), categoryId: m[3]! }))
    if (aliases.length === 0) throw new Error(`unexpected query ${body.query}`)
    calls.push(aliases)
    const data: Record<string, unknown> = {}
    const errors: unknown[] = []
    for (const a of aliases) {
      if (opts.fail?.(a)) { data[a.alias] = null; errors.push({ message: `boom ${a.alias}`, path: [a.alias] }); continue }
      const all = table[a.categoryId] ?? []
      const edges = all.slice((a.page - 1) * 24, a.page * 24)
      data[a.alias] = opts.noTotal?.includes(a.categoryId) ? { edges } : { pageInfo: { total: opts.total?.[a.categoryId] ?? all.length }, edges }
    }
    return new Response(JSON.stringify(errors.length ? { data, errors } : { data }))
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}
const ids = (file: { products: { sourceProductId: string }[] }) => file.products.map((p) => p.sourceProductId).sort()

describe('dina batch mode', () => {
  it('fetches first pages of all categories in one request', async () => {
    const shared = item('shared')
    const srv = batchServer({ '1': [...items('1', 5), shared], '2': [...items('2', 24)], '3': [shared, ...items('3', 3)] })
    const file = await scrapeDina({ fetchImpl: srv.fetchImpl, delayMs: 0, categoryIds: ['1', '2', '3'], batchPages: 20 })
    expect(srv.calls).toHaveLength(1)
    expect(srv.calls[0]!.map((a) => `${a.categoryId}:${a.page}`)).toEqual(['1:1', '2:1', '3:1'])
    expect(ids(file)).toEqual([...items('1', 5), ...items('2', 24), ...items('3', 3), shared].map((i) => i.id).sort())
    expect(file.errorCount).toBe(0)
    expect(file.sourceStats).toMatchObject({ shopId: '28', shopCity: 'Актау', mode: 'batch', categories: 3, pages: 3, requests: 1, scoped: true })
  })
  it('requests remaining pages in mixed batches', async () => {
    const srv = batchServer({ '10': items('A', 60), '20': items('B', 30) })
    const file = await scrapeDina({ fetchImpl: srv.fetchImpl, delayMs: 0, categoryIds: ['10', '20'], batchPages: 2 })
    expect(srv.calls.map((c) => c.map((a) => `${a.categoryId}:${a.page}`))).toEqual([['10:1', '20:1'], ['10:2', '10:3'], ['20:2']])
    expect(file.products).toHaveLength(90)
    expect(file.sourceStats).toMatchObject({ requests: 3, pages: 5, categories: 2 })
  })
  it('skips empty categories', async () => {
    // '5' пустая (total 0), '6' отдала короткую страницу при завышенном total — обе закончены после страницы 1
    const srv = batchServer({ '4': items('4', 30), '5': [], '6': items('6', 5) }, { total: { '6': 100 } })
    const file = await scrapeDina({ fetchImpl: srv.fetchImpl, delayMs: 0, categoryIds: ['4', '5', '6'] })
    const later = srv.calls.flat().filter((a) => a.page > 1)
    expect(later.map((a) => `${a.categoryId}:${a.page}`)).toEqual(['4:2'])
    expect(file.products).toHaveLength(35)
    expect(file.sourceStats).toMatchObject({ requests: 2, pages: 4 })
  })
  it('counts partial alias failures', async () => {
    const srv = batchServer({ '1': items('1', 2), '2': items('2', 2), '3': items('3', 2) }, { fail: (a) => a.alias === 'p1' })
    const file = await scrapeDina({ fetchImpl: srv.fetchImpl, delayMs: 0, categoryIds: ['1', '2', '3'] })
    expect(file.errorCount).toBe(1)
    expect(ids(file)).toEqual([...items('1', 2), ...items('3', 2)].map((i) => i.id).sort())
  })
  it('does not request further pages of a category whose first page failed', async () => {
    const srv = batchServer({ '1': items('1', 50), '2': items('2', 50) }, { fail: (a) => a.categoryId === '1' && a.page === 1 })
    const file = await scrapeDina({ fetchImpl: srv.fetchImpl, delayMs: 0, categoryIds: ['1', '2'] })
    expect(srv.calls.flat().filter((a) => a.categoryId === '1').map((a) => a.page)).toEqual([1])
    expect(file.errorCount).toBe(1)
    expect(file.products).toHaveLength(50)
  })
  it('treats a first page without pageInfo.total as a page error', async () => {
    const srv = batchServer({ '1': items('1', 50), '2': items('2', 3) }, { noTotal: ['1'] })
    const file = await scrapeDina({ fetchImpl: srv.fetchImpl, delayMs: 0, categoryIds: ['1', '2'] })
    expect(srv.calls).toHaveLength(1)
    expect(file.errorCount).toBe(1)
    expect(ids(file)).toEqual(items('2', 3).map((i) => i.id).sort())
  })
  it('counts a failed HTTP batch as a page error and continues', async () => {
    const srv = batchServer({ '1': items('1', 2), '2': items('2', 2) })
    let n = 0
    const flaky = (async (url: string, init: RequestInit) => {
      if (/p0:/.test(String(init.body)) && n++ === 0) return new Response('bad', { status: 400 })
      return srv.fetchImpl(url, init)
    }) as unknown as typeof fetch
    const file = await scrapeDina({ fetchImpl: flaky, delayMs: 0, categoryIds: ['1', '2'], batchPages: 1 })
    expect(file.errorCount).toBe(1)
    expect(ids(file)).toEqual(items('2', 2).map((i) => i.id).sort())
    expect(file.sourceStats).toMatchObject({ requests: 2, pages: 1 })
  })
  it('aborts after more than 10 page errors', async () => {
    const cats = Array.from({ length: 11 }, (_, i) => String(100 + i))
    const srv = batchServer(Object.fromEntries(cats.map((c) => [c, items(c, 3)])), { fail: () => true })
    await expect(scrapeDina({ fetchImpl: srv.fetchImpl, delayMs: 0, categoryIds: cats, batchPages: 20 })).rejects.toThrow(/too many page errors/)
  })
  it('keeps legacy mode without categoryIds', async () => {
    requests.length = 0
    const file = await scrapeDina({ fetchImpl: fakeFetch, delayMs: 0, categoryIds: [] })
    expect(ids(file)).toEqual(['5865', '777', '900'])
    expect(file.sourceStats).not.toHaveProperty('mode')
    expect(requests.every((r) => !/p0:/.test(r.query))).toBe(true)
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
