import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DictionarySchema, canonicalKey, readDictionary, writeDictionary, type Dictionary } from '../src/mapping/dictionary.js'
import { OverridesSchema, applyOverrides, readOverrides } from '../src/mapping/overrides.js'

const card = (name: string, category: string, review: 'approved' | 'pending' = 'approved') =>
  ({ name, brand: 'B', category, attributes: { weightGrams: 1000 }, method: 'ai', confidence: 0.9, review })
const multi = canonicalKey(['DANA:1', 'DINA:1', 'FIX_PRICE:1'])
const dict = (): Dictionary => DictionarySchema.parse({
  version: 1, generatedAt: '2026-10-06T00:00:00.000Z',
  canonicals: { [multi]: card('Соль 1 кг', 'sugar', 'pending'), c_other: card('Сахар 1 кг', 'sugar') },
  products: { 'DANA:1': multi, 'DINA:1': multi, 'FIX_PRICE:1': multi, 'DINA:9': 'c_other' }, storeCategories: {},
})
const ov = (o: object) => OverridesSchema.parse({ version: 1, ...o })

describe('applyOverrides', () => {
  it('moves category and approves', () => {
    const d = applyOverrides(dict(), ov({ moveCategory: [{ key: multi, to: 'salt', reason: 'salt' }], approve: [{ key: multi, reason: 'checked' }] }))
    expect(d.canonicals[multi]).toMatchObject({ category: 'salt', review: 'approved' })
  })
  it('split without ids isolates every member, each id points to an existing card', () => {
    const d = applyOverrides(dict(), ov({ split: [{ key: multi, reason: 'false group' }] }))
    for (const id of ['DANA:1', 'DINA:1', 'FIX_PRICE:1']) {
      const key = d.products[id]!
      expect(key).toBe(canonicalKey([id]))
      expect(d.canonicals[key]).toMatchObject({ name: 'Соль 1 кг', brand: 'B', category: 'sugar', method: 'deterministic', confidence: 1, review: 'approved', attributes: { weightGrams: 1000 } })
    }
    expect(Object.keys(d.canonicals)).toHaveLength(4)
  })
  it('split with ids keeps the remainder together (rekeyed on collision)', () => {
    const d = applyOverrides(dict(), ov({ split: [{ key: multi, ids: ['DANA:1'], reason: 'weight-vs-piece' }] }))
    expect(d.products['DANA:1']).toBe(canonicalKey(['DANA:1']))
    expect(d.products['DINA:1']).toBe(d.products['FIX_PRICE:1'])
    expect(d.products['DINA:1']).not.toBe(d.products['DANA:1'])
    for (const k of Object.values(d.products)) expect(d.canonicals[k]).toBeDefined()
  })
  it('is idempotent', () => {
    const o = ov({ moveCategory: [{ key: 'c_other', to: 'salt', reason: 'salt' }], split: [{ key: multi, ids: ['DANA:1'], reason: 'weight' }], approve: [{ key: 'c_other', reason: 'okay' }] })
    const once = applyOverrides(dict(), o)
    expect(applyOverrides(once, o)).toEqual(once)
    const dir = mkdtempSync(join(tmpdir(), 'ov-'))
    writeDictionary(join(dir, 'a.json'), once); writeDictionary(join(dir, 'b.json'), applyOverrides(readDictionary(join(dir, 'a.json')), o))
    expect(readDictionary(join(dir, 'b.json'))).toEqual(readDictionary(join(dir, 'a.json')))
  })
  it('unknown key is an error', () => {
    expect(() => applyOverrides(dict(), ov({ moveCategory: [{ key: 'c_nope', to: 'salt', reason: 'x1x' }] }))).toThrow(/unknown canonical/)
    expect(() => applyOverrides(dict(), ov({ split: [{ key: 'c_nope', reason: 'x1x' }] }))).toThrow(/unknown canonical/)
    expect(() => applyOverrides(dict(), ov({ approve: [{ key: 'c_nope', reason: 'x1x' }] }))).toThrow(/unknown canonical/)
  })
  it('rejects ids that are not members', () => {
    expect(() => applyOverrides(dict(), ov({ split: [{ key: multi, ids: ['DINA:9'], reason: 'oops' }] }))).toThrow(/not a member/)
  })
  it('overrides file requires a reason', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'ov-')), 'o.json')
    writeFileSync(p, JSON.stringify({ version: 1, moveCategory: [{ key: 'k', to: 'salt' }] }))
    expect(() => readOverrides(p)).toThrow()
  })
})
