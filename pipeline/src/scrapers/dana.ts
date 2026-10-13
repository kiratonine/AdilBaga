import * as cheerio from 'cheerio'
import { politeFetch } from '../http.js'
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
      rawPayload: { rawId, name, price, oldPrice: old || null, section: sectionPath.join(' / ') },
    })
  })
  return out
}

export async function scrapeDana(opts: { fetchImpl?: typeof fetch; delayMs?: number; roots?: typeof DANA_ROOTS } = {}): Promise<SourceFile> {
  const products = new Map<string, SourceProduct>()
  let errorCount = 0, pages = 0
  for (const root of opts.roots ?? DANA_ROOTS) {
    for (let page = 1; page <= MAX_PAGES_PER_ROOT; page++) {
      let fresh = 0
      try {
        const res = await politeFetch(`${BASE}${root.path}?PAGEN_1=${page}`, {}, { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 })
        pages++
        for (const p of parseDanaPage(await res.text(), [root.name])) {
          if (!products.has(p.sourceProductId)) { products.set(p.sourceProductId, p); fresh++ }
        }
      } catch (err) {
        // Bitrix отвечает 404 на страницу за последней — это конец раздела, а не сбой
        if (page > 1 && /^HTTP 404/.test((err as Error).message)) break
        errorCount++
        console.warn(`[DANA] ${root.path} p${page}: ${(err as Error).message}`)
        break
      }
      // Bitrix на странице за пределами диапазона отдаёт последнюю страницу → новых id нет
      if (fresh === 0) break
    }
    console.log(`[DANA] ${root.name}: total ${products.size}`)
  }
  return { storeCode: 'DANA', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount,
    sourceStats: { pages, roots: (opts.roots ?? DANA_ROOTS).length }, products: [...products.values()] }
}
