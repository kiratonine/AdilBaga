import { politeFetch, type PoliteOptions } from '../http.js'
import type { SourceFile, SourceProduct } from '../types.js'

const ENDPOINT = 'https://backend.dinamarket.kz/api/v1.1/customer/graph'
const CATEGORIES_QUERY = `query getCategories($shopId: ID!) { categories(shop_id: $shopId) { id name } }`
const SHOP_ID = '28' // Гипермаркет 301 «Дина», Актау, 33 мкр
const PAGE_SIZE = 24 // сервер режет _limit до 24 (проверено 2026-10-05)

// Глубокая пагинация без фильтра нестабильна (с ~8400-го товара страницы пересекаются),
// поэтому обходим каталог по category_id: в каждой категории < 8400 товаров.
const QUERY = `query getProducts($shopId: ID!, $page: Int, $limit: Int, $categoryId: ID) {
  products(shop_id: $shopId, _page: $page, _limit: $limit, category_id: $categoryId) {
    pageInfo { total }
    edges { id xid name slug price oldPrice price_type isWeightProduct
      preview { url } images { url } stock { amount } categories { id name } }
  }
}`

export type DinaItem = {
  id?: string; xid?: string; name?: string; slug?: string; price?: number; oldPrice?: number | null
  price_type?: string; isWeightProduct?: boolean; preview?: { url?: string } | null
  images?: { url?: string }[]; stock?: { amount?: number } | null; categories?: { id: string; name: string }[]
}

/** Весовой товар: API отдаёт цену за грамм → приводим к цене за кг (или за вес из названия) */
function weightMultiplier(name: string): number {
  const kg = name.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)/i)
  if (kg) return parseFloat(kg[1]!.replace(',', '.')) * 1000
  const g = name.match(/(\d+(?:[.,]\d+)?)\s*(?:г|гр|g)\b/i)
  if (g && parseFloat(g[1]!) > 50) return parseFloat(g[1]!)
  return 1000
}

export function mapDinaItem(item: DinaItem): SourceProduct | null {
  const name = item.name?.trim() ?? ''
  const raw = Number(item.price)
  if (!name || !Number.isFinite(raw) || raw <= 0) return null
  const weight = item.price_type === 'weight' || item.isWeightProduct === true
  const k = weight ? weightMultiplier(name) : 1
  const price = Math.round(raw * k)
  const old = item.oldPrice ? Math.round(Number(item.oldPrice) * k) : null
  if (price <= 0) return null
  return {
    sourceProductId: String(item.id ?? item.xid),
    name,
    price,
    oldPrice: old && old > price ? old : null,
    imageUrl: item.preview?.url || item.images?.find((i) => i.url)?.url || null,
    sourceUrl: item.slug ? `https://dinamarket.kz/product/${item.slug}` : null,
    brand: null,
    sourceCategoryPath: (item.categories ?? []).map((c) => c.name),
    rawPayload: { ...item, pricePerUnitMultiplier: k },
  }
}

type GraphResponse<T> = { data?: T }
type ProductsData = { products?: { pageInfo?: { total?: number }; edges?: DinaItem[] } }

export async function scrapeDina(opts: { fetchImpl?: typeof fetch; maxPages?: number; delayMs?: number } = {}): Promise<SourceFile> {
  const http: PoliteOptions = { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 }
  const graph = async <T>(query: string, variables: Record<string, unknown>) => {
    const res = await politeFetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) }, http)
    return ((await res.json()) as GraphResponse<T>).data
  }
  const categories = (await graph<{ categories?: { id: string; name: string }[] }>(CATEGORIES_QUERY, { shopId: SHOP_ID }))?.categories ?? []
  if (categories.length === 0) throw new Error('DINA: category list is empty')
  const total = (await graph<ProductsData>(QUERY, { shopId: SHOP_ID, page: 1, limit: 1, categoryId: null }))?.products?.pageInfo?.total ?? -1

  const products = new Map<string, SourceProduct>()
  let errorCount = 0, pages = 0
  // Корневой фильтр не отдаёт часть товаров, помеченных только подкатегорией, —
  // поэтому очередь пополняется категориями, найденными у самих товаров.
  const queue = categories.map((c) => ({ id: c.id, name: c.name }))
  const queued = new Set(queue.map((c) => c.id))
  for (let qi = 0; qi < queue.length; qi++) {
    const cat = queue[qi]!
    for (let page = 1; page <= (opts.maxPages ?? 1000); page++) {
      try {
        const data = await graph<ProductsData>(QUERY, { shopId: SHOP_ID, page, limit: PAGE_SIZE, categoryId: cat.id })
        pages++
        const edges = data?.products?.edges ?? []
        for (const e of edges) {
          const p = mapDinaItem(e)
          if (p && !products.has(p.sourceProductId)) products.set(p.sourceProductId, p)
          for (const c of e.categories ?? []) if (!queued.has(c.id)) { queued.add(c.id); queue.push(c) }
        }
        if (edges.length < PAGE_SIZE || page * PAGE_SIZE >= (data?.products?.pageInfo?.total ?? Infinity)) break
      } catch (err) {
        errorCount++
        console.warn(`[DINA] category ${cat.id} page ${page}: ${(err as Error).message}`)
        if (errorCount > 10) throw new Error('DINA: too many page errors, aborting')
        break
      }
    }
    if (qi % 20 === 0 || qi < categories.length) console.log(`[DINA] ${qi + 1}/${queue.length} ${cat.name}: total ${products.size}`)
  }
  return {
    storeCode: 'DINA', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount,
    sourceStats: { shopId: SHOP_ID, total, pages, categories: queue.length },
    products: [...products.values()],
  }
}
