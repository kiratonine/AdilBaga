import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../src/agent/taxonomy.js'
import { DictionarySchema, canonicalKey } from '../src/mapping/dictionary.js'
import { OverridesSchema, applyOverrides } from '../src/mapping/overrides.js'
import { DEFAULT_PUBLISH_CATEGORIES } from '../src/mapping/scope.js'

const SALT = /(?<![а-яәіңғүұқөһ])(соль|соли|тұз)(?![а-яәіңғүұқөһ])/i
const SUGAR = /сахар/i
const card = (name: string) => ({ name, brand: null, category: 'sugar', attributes: { weightGrams: 1000 }, method: 'deterministic', confidence: 1, review: 'approved' })
const names = ['Сахар песок 1 кг', 'Соль поваренная 1 кг', 'Соль морская Сахара 500 г', 'Тұз йодированный 1 кг']

describe('salt is separated from sugar', () => {
  const keys = names.map((n, i) => canonicalKey([`DINA:${i}`]))
  const base = DictionarySchema.parse({ version: 1, generatedAt: '2026-10-06T00:00:00.000Z',
    canonicals: Object.fromEntries(names.map((n, i) => [keys[i], card(n)])),
    products: Object.fromEntries(names.map((_, i) => [`DINA:${i}`, keys[i]!])), storeCategories: {} })
  const moves = names.flatMap((n, i) => SALT.test(n) && !/сахар\b/i.test(n.replace(/Сахара/i, '')) ? [{ key: keys[i]!, to: 'salt', reason: 'salt product' }] : [])
  const d = applyOverrides(base, OverridesSchema.parse({ version: 1, moveCategory: moves }))

  it('no sugar card looks like salt unless the name says sugar', () => {
    for (const c of Object.values(d.canonicals).filter((c) => c.category === 'sugar')) expect(!SALT.test(c.name) || SUGAR.test(c.name.replace(/Сахара/i, ''))).toBe(true)
  })
  it('salt cards get the salt category', () => {
    expect(Object.values(d.canonicals).filter((c) => c.category === 'salt').map((c) => c.name)).toEqual(['Соль поваренная 1 кг', 'Соль морская Сахара 500 г', 'Тұз йодированный 1 кг'])
  })
  it('salt is a category but is not published', () => {
    expect(CATEGORIES.map((c) => c.slug)).toContain('salt')
    expect(DEFAULT_PUBLISH_CATEGORIES).not.toContain('salt')
  })
})
