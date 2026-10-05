import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { Bundle } from '../agent/bundle.js'
import { isCategorySlug, type CategorySlug } from '../agent/taxonomy.js'
import type { StoreCode } from '../types.js'

const Slug = z.string().refine(isCategorySlug, 'unknown category').transform((s) => s as CategorySlug)
const Canonical = z.object({
  name: z.string().min(1), brand: z.string().nullable(), category: Slug, attributes: z.record(z.number()),
  method: z.enum(['deterministic', 'ai']), confidence: z.number().min(0).max(1), review: z.enum(['approved', 'pending']),
})
export const DictionarySchema = z.object({
  version: z.literal(1), generatedAt: z.string().datetime(),
  canonicals: z.record(Canonical), products: z.record(z.string()), storeCategories: z.record(Slug),
})
export type Dictionary = z.infer<typeof DictionarySchema>
export type DictionaryCanonical = z.infer<typeof Canonical>

export const identity = (store: StoreCode, sourceProductId: string) => `${store}:${sourceProductId}`
export const storeCategoryKey = (store: StoreCode, path: string[] | string | null) =>
  `${store}|${Array.isArray(path) ? path.join(' / ') : path ?? ''}`

/** Ключ задаётся один раз при создании карточки и дальше не пересчитывается — новые участники его не меняют */
export function canonicalKey(memberIds: string[]): string {
  const first = [...memberIds].sort()[0]
  if (!first) throw new Error('canonical without members')
  return `c_${createHash('sha256').update(first).digest('hex').slice(0, 16)}`
}

export function buildDictionary(bundle: Bundle): Dictionary {
  const d = { version: 1 as const, generatedAt: bundle.generatedAt, canonicals: {} as Record<string, unknown>,
    products: {} as Record<string, string>, storeCategories: {} as Record<string, string> }
  const votes = new Map<string, Map<string, number>>()
  for (const g of bundle.canonicalProducts) {
    const ids = g.members.map((m) => identity(m.rawProduct.storeCode, m.rawProduct.sourceProductId))
    const key = canonicalKey(ids)
    if (d.canonicals[key]) throw new Error(`canonical key collision ${key}`)
    const first = g.members[0]!
    d.canonicals[key] = { name: g.canonicalName, brand: g.brand, category: g.category, attributes: g.attributes,
      method: first.matchMethod, confidence: first.matchConfidence, review: first.reviewStatus }
    g.members.forEach((m, i) => {
      d.products[ids[i]!] = key
      if (!m.rawProduct.category) return
      const k = storeCategoryKey(m.rawProduct.storeCode, m.rawProduct.category)
      const v = votes.get(k) ?? new Map<string, number>()
      v.set(g.category, (v.get(g.category) ?? 0) + 1)
      votes.set(k, v)
    })
  }
  for (const [k, v] of votes) d.storeCategories[k] = [...v.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0]
  return DictionarySchema.parse(d)
}

/** Одна запись — одна строка, ключи отсортированы: diff в git показывает ровно изменённые товары */
function lines(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort()
  return keys.length ? `{\n${keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(',\n')}\n  }` : '{}'
}

export function writeDictionary(path: string, d: Dictionary): void {
  const v = DictionarySchema.parse(d)
  const text = `{\n  "version": 1,\n  "generatedAt": ${JSON.stringify(v.generatedAt)},\n  "canonicals": ${lines(v.canonicals)},\n` +
    `  "products": ${lines(v.products)},\n  "storeCategories": ${lines(v.storeCategories)}\n}\n`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, text, 'utf8')
  renameSync(`${path}.tmp`, path)
}

export function readDictionary(path: string): Dictionary {
  const d = DictionarySchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  for (const [id, key] of Object.entries(d.products)) if (!d.canonicals[key]) throw new Error(`${id}: missing canonical ${key}`)
  return d
}
