import { z } from 'zod'
import type { SourceProduct, StoreCode } from '../types.js'
import type { LlmCall } from './gemini.js'
import { CATEGORIES, isCategorySlug, type CategorySlug } from './taxonomy.js'
import { extractFat, extractSize } from './units.js'

export type Attributes = { volumeMl?: number; weightGrams?: number; packageCount?: number; fatPercent?: number }
export type ClassifiedProduct = { storeCode: StoreCode; product: SourceProduct; category: CategorySlug; productType: string
  brand: string | null; attributes: Attributes; displayName: string; flags: string[] }

const positive = z.number().positive().optional().nullable()
const Item = z.object({ id: z.string(), category: z.string(), productType: z.string().min(1), brand: z.string().nullable(),
  volumeMl: positive, weightGrams: positive, packageCount: positive, fatPercent: positive, displayName: z.string().min(1) })
const Reply = z.object({ items: z.array(Item) })

const SCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, category: { type: 'string', enum: CATEGORIES.map((c) => c.slug) },
  productType: { type: 'string' }, brand: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  volumeMl: { type: 'number' }, weightGrams: { type: 'number' }, packageCount: { type: 'number' }, fatPercent: { type: 'number' },
  displayName: { type: 'string' } }, required: ['id', 'category', 'productType', 'brand', 'displayName'] } } }, required: ['items'] }

const key = (i: { storeCode: StoreCode; product: SourceProduct }) => `${i.storeCode}:${i.product.sourceProductId}`

function prompt(items: { storeCode: StoreCode; product: SourceProduct }[]): string {
  return [
    'Ты классифицируешь товары продуктовых магазинов Актау (Казахстан). Верни строго JSON.',
    `Категории (slug — название): ${CATEGORIES.map((c) => `${c.slug} — ${c.name}`).join('; ')}.`,
    'Для каждого товара: category (slug), productType (короткий тип по-русски в нижнем регистре: «молоко», «кефир», «сахар-песок»),',
    'brand (производитель/торговая марка из названия или null), volumeMl/weightGrams/packageCount/fatPercent только если явно указаны в названии,',
    'displayName — аккуратное название: «Тип Бренд ключевые характеристики размер», например «Молоко FoodMaster 3.2% 1 л».',
    'Поле store — это магазин-продавец, НЕ бренд. Не выдумывай атрибуты.',
    JSON.stringify(items.map((i) => ({ id: key(i), store: i.storeCode, name: i.product.name, sourceCategory: i.product.sourceCategoryPath.join(' / ') }))),
  ].join('\n')
}

function fallback(i: { storeCode: StoreCode; product: SourceProduct }): ClassifiedProduct {
  const size = extractSize(i.product.name), fat = extractFat(i.product.name)
  return { ...i, category: 'other', productType: 'unknown', brand: i.product.brand, displayName: i.product.name,
    attributes: { ...size, ...(fat !== null ? { fatPercent: fat } : {}) }, flags: ['llm_fallback'] }
}

function merge(i: { storeCode: StoreCode; product: SourceProduct }, r: z.infer<typeof Item>): ClassifiedProduct {
  const flags: string[] = []
  const rx = extractSize(i.product.name)
  const attrs: Attributes = {}
  for (const k of ['volumeMl', 'weightGrams', 'packageCount'] as const) {
    const llm = r[k] ?? undefined, re = rx[k]
    if (re !== undefined && llm !== undefined && Math.round(llm) !== re) flags.push('size_conflict')
    const v = re ?? llm // regex — источник истины для размера
    if (v !== undefined) attrs[k] = Math.round(v)
  }
  const fat = extractFat(i.product.name) ?? r.fatPercent ?? null
  if (fat !== null) attrs.fatPercent = fat
  return { ...i, category: r.category as CategorySlug, productType: r.productType.trim().toLowerCase(),
    brand: r.brand?.trim() || i.product.brand, attributes: attrs, displayName: r.displayName.trim(), flags }
}

export async function classifyBatch(items: { storeCode: StoreCode; product: SourceProduct }[], llm: LlmCall): Promise<ClassifiedProduct[]> {
  const byKey = new Map(items.map((i) => [key(i), i]))
  const done = new Map<string, ClassifiedProduct>()
  for (let attempt = 0; attempt < 2 && done.size < items.length; attempt++) {
    const pending = items.filter((i) => !done.has(key(i)))
    try {
      const parsed = Reply.safeParse(await llm(prompt(pending), SCHEMA))
      if (!parsed.success) continue
      for (const r of parsed.data.items) {
        const src = byKey.get(r.id)
        if (!src || done.has(r.id) || !isCategorySlug(r.category)) continue
        done.set(r.id, merge(src, r))
      }
    } catch { /* ошибка провайдера — повтор */ }
  }
  return items.map((i) => done.get(key(i)) ?? fallback(i))
}
