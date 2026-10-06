import { readFileSync } from 'node:fs'
import { politeFetch } from '../http.js'
import type { SourceFile, SourceProduct } from '../types.js'
import { extractJsonResponses, type Har } from './har.js'

const API = 'https://api.fix-price.kz/buyer/v1'
const SITE = 'https://fix-price.kz/ru/catalog/'
const PAGE = 24

export type FixPriceItem = {
  id: number | string; title: string; url: string; price: string | number
  specialPrice?: { price: string | number } | null; images?: { src: string }[]; brand?: { title: string } | null
  category?: { title?: string } | null
}

export function mapFixPriceItem(item: FixPriceItem): SourceProduct | null {
  const regular = Math.round(Number(item.price))
  const special = item.specialPrice ? Math.round(Number(item.specialPrice.price)) : NaN
  const price = Number.isFinite(special) && special > 0 && special < regular ? special : regular
  if (!item.title?.trim() || !Number.isFinite(price) || price <= 0) return null
  const img = item.images?.[0]?.src
  return {
    sourceProductId: `fp_${item.id}`,
    name: item.title.trim(),
    price,
    oldPrice: price < regular ? regular : null,
    imageUrl: img ? (img.startsWith('http') ? img : `https://img.fix-price.kz${img}`) : null,
    sourceUrl: `${SITE}${item.url.replace(/^\/+/, '')}`,
    brand: item.brand?.title?.trim() || null,
    sourceCategoryPath: item.category?.title ? [item.category.title] : [],
    rawPayload: item as unknown as Record<string, unknown>,
  }
}

function collect(lists: unknown[], stats: SourceFile['sourceStats'], errorCount: number): SourceFile {
  const products = new Map<string, SourceProduct>()
  for (const list of lists) for (const raw of Array.isArray(list) ? list : []) {
    const p = mapFixPriceItem(raw as FixPriceItem)
    if (p && !products.has(p.sourceProductId)) products.set(p.sourceProductId, p)
  }
  return { storeCode: 'FIX_PRICE', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount, sourceStats: stats, products: [...products.values()] }
}

/** Путь B: HAR, сохранённый из браузера с выбранным Актау */
export function loadFixPriceFromHar(harPath: string): SourceFile {
  const har = JSON.parse(readFileSync(harPath, 'utf8')) as Har
  const lists = extractJsonResponses(har, /\/buyer\/v1\/product\/in\//)
  return collect(lists, { mode: 'har', responses: lists.length }, 0)
}

/** Путь A: прямой API с контекстом города (заголовки и id — из FIXPRICE_SOURCE.md) */
export async function scrapeFixPrice(opts: { fetchImpl?: typeof fetch; delayMs?: number } = {}): Promise<SourceFile> {
  const city = process.env.FIXPRICE_CITY_ID
  if (!city) throw new Error('FIXPRICE_CITY_ID is not set (see docs/data/FIXPRICE_SOURCE.md)')
  const headers = { 'x-city': city, 'x-country': process.env.FIXPRICE_COUNTRY_ID || '3', 'x-language': 'ru', 'content-type': 'application/json' }
  const http = { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 }
  const menu = (await (await politeFetch(`${API}/category/menu`, { headers }, http)).json()) as { alias: string }[]
  const lists: unknown[] = []
  let errorCount = 0
  for (const { alias } of menu) {
    for (let page = 1; ; page++) {
      try {
        const res = await politeFetch(`${API}/product/in/${alias}?page=${page}&limit=${PAGE}&sort=sold`, {
          method: 'POST', headers, body: JSON.stringify({ category: alias, brand: [], price: [], isDividedPrice: false, isNew: false, isHit: false, isSpecialPrice: false }),
        }, http)
        const list = (await res.json()) as unknown[]
        lists.push(list)
        if (!Array.isArray(list) || list.length < PAGE) break
      } catch (err) { errorCount++; console.warn(`[FIX_PRICE] ${alias} p${page}: ${(err as Error).message}`); break }
    }
  }
  return collect(lists, { mode: 'api', categories: menu.length }, errorCount)
}
