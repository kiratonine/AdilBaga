import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { isCategorySlug, type CategorySlug } from '../agent/taxonomy.js'
import { canonicalKey, DictionarySchema, type Dictionary, type DictionaryCanonical } from './dictionary.js'

const Slug = z.string().refine(isCategorySlug, 'unknown category').transform((s) => s as CategorySlug)
const reason = z.string().min(3)
export const OverridesSchema = z.object({
  version: z.literal(1),
  moveCategory: z.array(z.object({ key: z.string(), to: Slug, reason })).default([]),
  split: z.array(z.object({ key: z.string(), ids: z.array(z.string()).min(1).optional(), reason })).default([]),
  approve: z.array(z.object({ key: z.string(), reason })).default([]),
})
export type Overrides = z.infer<typeof OverridesSchema>

export const readOverrides = (path: string): Overrides => OverridesSchema.parse(JSON.parse(readFileSync(path, 'utf8')))

const membersOf = (d: Dictionary, key: string) => Object.entries(d.products).filter(([, k]) => k === key).map(([id]) => id)

/** Идемпотентно: повторное применение тех же правок возвращает тот же словарь */
export function applyOverrides(dict: Dictionary, overrides: Overrides): Dictionary {
  const d: Dictionary = DictionarySchema.parse(structuredClone(dict))
  const card = (key: string): DictionaryCanonical => {
    const c = d.canonicals[key]
    if (!c) throw new Error(`overrides: unknown canonical key ${key}`)
    return c
  }
  for (const m of overrides.moveCategory) card(m.key).category = m.to
  for (const s of overrides.split) {
    const original = d.canonicals[s.key]
    const alreadyIsolated = (id: string) => { const k = d.products[id]; return !!k && k === canonicalKey([id]) && membersOf(d, k).length === 1 }
    if (!original) {
      if (s.ids?.every(alreadyIsolated)) continue
      throw new Error(`overrides: unknown canonical key ${s.key}`)
    }
    const members = membersOf(d, s.key)
    const ids = s.ids ?? members
    for (const id of ids) if (d.products[id] !== s.key && !alreadyIsolated(id)) throw new Error(`overrides: ${id} is not a member of ${s.key}`)
    const moving = ids.filter((id) => d.products[id] === s.key)
    if (moving.length === 0) continue
    const remaining = members.filter((id) => !moving.includes(id))
    delete d.canonicals[s.key]
    if (remaining.length) {
      const newKey = canonicalKey(remaining)
      d.canonicals[newKey] = original
      for (const id of remaining) d.products[id] = newKey
    }
    for (const id of moving) {
      const key = canonicalKey([id])
      if (d.canonicals[key]) throw new Error(`overrides: canonical key collision ${key}`)
      d.canonicals[key] = { ...original, method: 'deterministic', confidence: 1, review: 'approved' }
      d.products[id] = key
    }
  }
  for (const a of overrides.approve) card(a.key).review = 'approved'
  return DictionarySchema.parse(d)
}
