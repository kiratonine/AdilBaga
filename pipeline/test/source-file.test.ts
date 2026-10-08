import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceFile, writeSourceFile } from '../src/source-file.js'
import type { SourceFile } from '../src/types.js'

const file = (products: SourceFile['products']): SourceFile => ({
  storeCode: 'DINA', city: 'Aktau', capturedAt: '2026-10-05T10:00:00.000Z', errorCount: 0,
  sourceStats: { pages: 1 }, products,
})
const milk = { sourceProductId: '1', name: 'Молоко 3,2% 1 л', price: 590, oldPrice: null,
  imageUrl: 'https://x/1.jpg', sourceUrl: null, brand: null, sourceCategoryPath: ['Молоко'], rawPayload: { id: 1 } }

describe('source file', () => {
  it('round-trips a valid file', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    writeSourceFile(path, file([milk]))
    expect(readSourceFile(path).products[0]?.name).toBe('Молоко 3,2% 1 л')
    expect(JSON.parse(readFileSync(path, 'utf8')).storeCode).toBe('DINA')
  })
  it('writeSourceFile rejects empty product list', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    expect(() => writeSourceFile(path, file([]))).toThrow(/no products/)
  })
  it('rejects non-positive and fractional prices', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    expect(() => writeSourceFile(path, file([{ ...milk, price: 0 }]))).toThrow()
    expect(() => writeSourceFile(path, file([{ ...milk, price: 10.5 }]))).toThrow()
  })
  it('rejects duplicate sourceProductId', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    expect(() => writeSourceFile(path, file([milk, milk]))).toThrow(/duplicate/)
  })
})
