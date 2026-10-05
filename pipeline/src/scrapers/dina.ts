import { politeFetch, type PoliteOptions } from '../http.js'
import type { SourceFile, SourceProduct } from '../types.js'

const ENDPOINT = 'https://backend.dinamarket.kz/api/v1.1/customer/graph'
const SHOP_ID = '28' // Гипермаркет 301 «Дина», Актау, 33 мкр
const PAGE_SIZE = 24 // сервер режет _limit до 24 (проверено 2026-10-05)

const QUERY = `query getProducts($shopId: ID!, $page: Int, $limit: Int) {
  products(shop_id: $shopId, _page: $page, _limit: $limit) {
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

export async function scrapeDina(opts: { fetchImpl?: typeof fetch; maxPages?: number; delayMs?: number } = {}): Promise<SourceFile> {
  const http: PoliteOptions = { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 }
  const products = new Map<string, SourceProduct>()
  let total = Infinity, page = 1, errorCount = 0
  while ((page - 1) * PAGE_SIZE < total && page <= (opts.maxPages ?? 1000)) {
    try {
      const res = await politeFetch(ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { shopId: SHOP_ID, page, limit: PAGE_SIZE } }),
      }, http)
      const body = (await res.json()) as { data?: { products?: { pageInfo?: { total?: number }; edges?: DinaItem[] } } }
      const edges = body.data?.products?.edges ?? []
      total = body.data?.products?.pageInfo?.total ?? total
      if (edges.length === 0) break
      for (const e of edges) {
        const p = mapDinaItem(e)
        if (p && !products.has(p.sourceProductId)) products.set(p.sourceProductId, p)
      }
    } catch (err) {
      errorCount++
      console.warn(`[DINA] page ${page}: ${(err as Error).message}`)
      if (errorCount > 10) throw new Error('DINA: too many page errors, aborting')
    }
    if (page % 25 === 0) console.log(`[DINA] page ${page}, products ${products.size}/${total}`)
    page++
  }
  return {
    storeCode: 'DINA', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount,
    sourceStats: { shopId: SHOP_ID, total: Number.isFinite(total) ? total : -1, pages: page - 1 },
    products: [...products.values()],
  }
}
