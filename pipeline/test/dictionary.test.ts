import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/agent/bundle.js'
import { buildDictionary, canonicalKey, identity, readDictionary, storeCategoryKey, writeDictionary } from '../src/mapping/dictionary.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const s = cp('DINA', '3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.sourceCategoryPath = ['Молоко, яйца, масло', 'Молоко']
b.product.sourceCategoryPath = ['Продукты питания']
s.product.sourceCategoryPath = ['Бакалея']
const sources = (['DINA', 'DANA', 'FIX_PRICE'] as const).map((x) => ({ storeCode: x, city: 'Aktau' as const, capturedAt: '2026-10-06T06:00:00.000Z', errorCount: 0, sourceStats: {} }))
const bundle = buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [s], method: 'deterministic', confidence: 1, review: 'approved' },
], sources, '2026-10-06T07:00:00.000Z')

describe('dictionary', () => {
  it('canonical key does not depend on member order', () => {
    expect(canonicalKey(['DINA:1', 'DANA:dana_2'])).toBe(canonicalKey(['DANA:dana_2', 'DINA:1']))
    expect(canonicalKey(['DINA:1'])).toMatch(/^c_[0-9a-f]{16}$/)
  })
  it('maps every bundle raw to its canonical, word order in names does not matter', () => {
    const d = buildDictionary(bundle)
    expect(Object.keys(d.products)).toHaveLength(3)
    expect(d.products[identity('DINA', '1')]).toBe(d.products[identity('DANA', 'dana_2')])
    const milk = d.canonicals[d.products[identity('DINA', '1')]!]!
    expect(milk).toMatchObject({ name: bundle.canonicalProducts[0]!.canonicalName, category: 'milk', method: 'ai', review: 'approved', attributes: { volumeMl: 1000, fatPercent: 3.2 } })
  })
  it('learns store category → slug', () => {
    const d = buildDictionary(bundle)
    expect(d.storeCategories[storeCategoryKey('DINA', ['Молоко, яйца, масло', 'Молоко'])]).toBe('milk')
    expect(d.storeCategories[storeCategoryKey('DINA', ['Бакалея'])]).toBe('sugar')
  })
  it('writes a deterministic, diff-friendly file and reads it back', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dict-')), 'dictionary.json')
    const d = buildDictionary(bundle)
    writeDictionary(path, d)
    const first = readFileSync(path, 'utf8')
    writeDictionary(path, readDictionary(path))
    expect(readFileSync(path, 'utf8')).toBe(first)
    expect(first.split('\n').filter((l) => l.includes('"DINA:1"'))).toHaveLength(1)
  })
  it('rejects a product pointing to a missing canonical', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dict-')), 'dictionary.json')
    const d = buildDictionary(bundle)
    d.products['DINA:999'] = 'c_0000000000000000'
    writeDictionary(path, d)
    expect(() => readDictionary(path)).toThrow(/missing canonical/)
  })
})
