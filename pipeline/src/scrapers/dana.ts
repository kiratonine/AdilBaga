import * as cheerio from 'cheerio'
import { politeFetch } from '../http.js'
import { mapPool } from '../pool.js'
import { DANA_CONCURRENCY } from '../scrape-policy.js'
import type { SourceFile, SourceProduct } from '../types.js'

const BASE = 'https://dana-market.kz'
export const DANA_ROOTS = [
  { path: '/catalog/produkty_pitaniya_/', name: 'Продукты питания' },
  { path: '/catalog/bytovaya_khimiya/', name: 'Бытовая химия' },
  { path: '/catalog/detskie_tovary/', name: 'Детские товары' },
  { path: '/catalog/kosmetika_i_gigiena_/', name: 'Косметика и гигиена' },
  { path: '/catalog/tovary_dlya_doma/', name: 'Товары для дома' },
]
/** Публикуем только продукты питания (scope сайта); остальные корни — SCRAPE_ALL=1 */
export const DANA_SCOPE_ROOTS = DANA_ROOTS.slice(0, 1)
const MAX_PAGES_PER_ROOT = 500

const digits = (s: string) => { const d = s.replace(/[^0-9]/g, ''); return d ? parseInt(d, 10) : 0 }
const abs = (u: string | undefined) => (!u ? null : u.startsWith('http') ? u : `${BASE}${u}`)

export function parseDanaPage(html: string, sectionPath: string[]): SourceProduct[] {
  const $ = cheerio.load(html)
  const out: SourceProduct[] = []
  $('.catalog_item_wrapp').each((_, el) => {
    const card = $(el)
    const rawId = card.attr('data-id') || card.find('[data-id]').attr('data-id') || card.attr('id')?.replace(/[^0-9]/g, '')
    const title = card.find('.item-title a').first()
    const name = title.text().trim()
    const price = digits(card.find('.price_value').first().text())
    if (!rawId || !name || price <= 0) return
    const old = digits(card.find('.price_old .price_value').first().text())
    const img = card.find('.image_wrapper_block img, picture img').first()
    // В «хлебных крошках» карточки Bitrix пишет раздел; если его нет — путь корня
    const crumb = card.find('.item-section, .section-name').first().text().trim()
    out.push({
      sourceProductId: `dana_${rawId}`,
      name,
      price,
      oldPrice: old > price ? old : null,
      imageUrl: abs(img.attr('data-src') || img.attr('src')),
      sourceUrl: abs(title.attr('href')),
      brand: null,
      sourceCategoryPath: crumb ? [...sectionPath, crumb] : sectionPath,
      rawPayload: { rawId, name, price, oldPrice: old || null, section: sectionPath.join(' / '), sections: [] as string[] },
    })
  })
  return out
}

/** Число страниц раздела: максимум PAGEN_1 в ссылках блока пагинации; нет блока — одна страница */
export function parseDanaPageCount(html: string): number {
  const $ = cheerio.load(html)
  let max = 1
  $('.module-pagination a[href]').each((_, a) => {
    const m = /PAGEN_1=(\d+)/.exec($(a).attr('href') ?? '')
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  })
  return max
}

/** Подразделы первого уровня корня (`<rootPath><slug>/`), уникальные и отсортированные */
export function parseDanaSections(html: string, rootPath: string): string[] {
  const $ = cheerio.load(html)
  const escaped = rootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}[a-z0-9_]+/$`)
  const found = new Set<string>()
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') ?? ''
    if (re.test(href)) found.add(href)
  })
  return [...found].sort()
}

export type DanaMode = 'roots' | 'sections' | 'full'

type Target = { path: string; rootName: string; sectionPath: string | null }
type PageResult = { products: SourceProduct[]; count: number } | { end: true } | { error: string }

export async function scrapeDana(opts: {
  fetchImpl?: typeof fetch; delayMs?: number; concurrency?: number
  /** режим roots/full: какие корни обходить */
  roots?: typeof DANA_ROOTS
  /** режим sections: пути подразделов из scope-файла (все внутри DANA_SCOPE_ROOTS[0]) */
  sections?: string[]
  /** режим full: корни + аннотация подразделов для DANA_SCOPE_ROOTS */
  full?: boolean
} = {}): Promise<SourceFile> {
  const mode: DanaMode = opts.full ? 'full' : opts.sections ? 'sections' : 'roots'
  const concurrency = opts.concurrency ?? DANA_CONCURRENCY
  const fetchOpts = { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 }
  const menuRoot = DANA_SCOPE_ROOTS[0]!
  let errorCount = 0, pages = 0

  const fetchHtml = async (path: string, page: number) => {
    const res = await politeFetch(`${BASE}${path}?PAGEN_1=${page}`, {}, fetchOpts)
    pages++
    return res.text()
  }

  // Меню подразделов берём со стр. 1 корня продуктов питания (режимы sections и full)
  let menuHtml: string | null = null
  let menu: string[] = []
  if (mode !== 'roots') {
    try {
      menuHtml = await fetchHtml(menuRoot.path, 1)
      menu = parseDanaSections(menuHtml, menuRoot.path)
    } catch (err) {
      console.warn(`[DANA] ${menuRoot.path} menu: ${(err as Error).message}`)
    }
    if (menu.length === 0) {
      errorCount++
      console.warn(`[DANA] no sections found in the menu of ${menuRoot.path}`)
    }
  }

  const targets: Target[] = []
  if (mode === 'sections') {
    for (const path of opts.sections ?? []) {
      if (menu.length > 0 && !menu.includes(path)) {
        errorCount++
        console.warn(`[DANA] section missing from menu: ${path}`)
        continue
      }
      targets.push({ path, rootName: menuRoot.name, sectionPath: path })
    }
  } else {
    for (const root of opts.roots ?? DANA_ROOTS) targets.push({ path: root.path, rootName: root.name, sectionPath: null })
    if (mode === 'full') for (const path of menu) targets.push({ path, rootName: menuRoot.name, sectionPath: path })
  }

  const fetchPage = async (t: Target, page: number): Promise<PageResult> => {
    try {
      const reuse = page === 1 && t.path === menuRoot.path && menuHtml !== null
      const text = reuse ? menuHtml! : await fetchHtml(t.path, page)
      const products = parseDanaPage(text, [t.rootName])
      if (products.length === 0) {
        const error = 'no product cards on the page'
        console.warn(`[DANA] ${t.path} p${page}: ${error}`)
        return { error }
      }
      return { products, count: page === 1 ? Math.min(parseDanaPageCount(text), MAX_PAGES_PER_ROOT) : 1 }
    } catch (err) {
      const message = (err as Error).message
      // Bitrix отвечает 404 на страницу за последней — это конец раздела, а не сбой
      if (page > 1 && /^HTTP 404/.test(message)) return { end: true }
      console.warn(`[DANA] ${t.path} p${page}: ${message}`)
      return { error: message }
    }
  }

  // Фаза 1: стр. 1 каждой цели; фаза 2: стр. 2..N всех целей одной общей очередью
  const first = await mapPool(targets, concurrency, t => fetchPage(t, 1))
  const jobs: { ti: number; page: number }[] = []
  first.forEach((r, ti) => {
    if ('error' in r) { errorCount++; return }
    if ('products' in r) for (let page = 2; page <= r.count; page++) jobs.push({ ti, page })
  })
  const rest = await mapPool(jobs, concurrency, j => fetchPage(targets[j.ti]!, j.page))
  rest.forEach(r => { if ('error' in r) errorCount++ })

  // Слияние в детерминированном порядке: цель → страница → карточка; первая встреча побеждает
  const perTarget: PageResult[][] = targets.map((_, ti) => [first[ti]!])
  jobs.forEach((j, k) => perTarget[j.ti]!.push(rest[k]!))
  const products = new Map<string, SourceProduct>()
  const sectionsOf = new Map<string, Set<string>>()
  targets.forEach((t, ti) => {
    for (const r of perTarget[ti]!) {
      if (!('products' in r)) continue
      for (const p of r.products) {
        if (!products.has(p.sourceProductId)) { products.set(p.sourceProductId, p); sectionsOf.set(p.sourceProductId, new Set()) }
        if (t.sectionPath) sectionsOf.get(p.sourceProductId)!.add(t.sectionPath)
      }
    }
  })
  for (const [id, p] of products) p.rawPayload.sections = [...sectionsOf.get(id)!].sort()

  console.log(`[DANA] mode ${mode}: ${targets.length} targets, ${pages} pages, ${products.size} products`)
  return { storeCode: 'DANA', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount,
    sourceStats: { mode, pages, roots: mode === 'sections' ? 1 : (opts.roots ?? DANA_ROOTS).length,
      sections: targets.filter(t => t.sectionPath).length, concurrency },
    products: [...products.values()] }
}
