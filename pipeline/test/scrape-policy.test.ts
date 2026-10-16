import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertCompleteScrape, resolveDanaConcurrency, resolveDinaBatchPages } from '../src/scrape-policy.js'
import type { SourceFile, StoreCode } from '../src/types.js'

const file = (storeCode: StoreCode, errorCount: number, sourceStats: SourceFile['sourceStats']): SourceFile => ({
  storeCode, city: 'Aktau', capturedAt: '2026-10-13T06:00:00.000Z', errorCount, sourceStats, products: [],
})

describe('assertCompleteScrape', () => {
  const dinaBatch = (errors: number) => file('DINA', errors, { mode: 'batch', categories: 14, pages: 120, requests: 9, scoped: true })
  const fixScoped = (errors: number) => file('FIX_PRICE', errors, { mode: 'api', categories: 1, scoped: true })

  it('refuses a Dina batch scrape with errors, naming store and error count', () => {
    expect(() => assertCompleteScrape(dinaBatch(1), { all: false })).toThrow(/DINA.*1 error.*keeping previous file/)
  })

  it('accepts a Dina batch scrape without errors', () => {
    expect(() => assertCompleteScrape(dinaBatch(0), { all: false })).not.toThrow()
  })

  it('refuses a scoped Fix Price scrape with errors', () => {
    expect(() => assertCompleteScrape(fixScoped(2), { all: false })).toThrow(/FIX_PRICE.*2 error.*keeping previous file/)
    expect(() => assertCompleteScrape(fixScoped(0), { all: false })).not.toThrow()
  })

  it('refuses a Dana sections scrape with errors', () => {
    expect(() => assertCompleteScrape(file('DANA', 1, { mode: 'sections', pages: 100, sections: 7 }), { all: false })).toThrow(/DANA.*1 error.*keeping previous file/)
  })

  it('never throws for a Dana sections scrape under SCRAPE_ALL', () => {
    expect(() => assertCompleteScrape(file('DANA', 1, { mode: 'sections', pages: 100, sections: 7 }), { all: true })).not.toThrow()
  })

  it('keeps error tolerance for SCRAPE_ALL, legacy Dina roots, Dana and full Fix Price', () => {
    expect(() => assertCompleteScrape(dinaBatch(3), { all: true })).not.toThrow()
    expect(() => assertCompleteScrape(fixScoped(3), { all: true })).not.toThrow()
    expect(() => assertCompleteScrape(file('DINA', 3, { pages: 50, categories: 15, scoped: true }), { all: false })).not.toThrow()
    expect(() => assertCompleteScrape(file('DINA', 3, { pages: 500, categories: 40, scoped: false }), { all: false })).not.toThrow()
    expect(() => assertCompleteScrape(file('DANA', 3, { mode: 'roots', pages: 10, roots: 5 }), { all: false })).not.toThrow()
    expect(() => assertCompleteScrape(file('FIX_PRICE', 3, { mode: 'api', categories: 30, scoped: false }), { all: false })).not.toThrow()
    expect(() => assertCompleteScrape(file('FIX_PRICE', 0, { mode: 'har', responses: 4 }), { all: false })).not.toThrow()
  })
})

describe('resolveDinaBatchPages', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('defaults to 20 without a warning when unset or blank', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveDinaBatchPages(undefined)).toBe(20)
    expect(resolveDinaBatchPages('  ')).toBe(20)
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts integers from 1 to 20', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveDinaBatchPages('1')).toBe(1)
    expect(resolveDinaBatchPages(' 12 ')).toBe(12)
    expect(resolveDinaBatchPages('20')).toBe(20)
    expect(warn).not.toHaveBeenCalled()
  })

  it('clamps values above 20 to 20 with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveDinaBatchPages('50')).toBe(20)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to 20 with a warning for invalid, zero, negative or fractional values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const v of ['abc', '0', '-3', '2.5', 'NaN']) expect(resolveDinaBatchPages(v)).toBe(20)
    expect(warn).toHaveBeenCalledTimes(5)
  })
})

describe('resolveDanaConcurrency', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('defaults to 3 for unset or blank', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveDanaConcurrency(undefined)).toBe(3)
    expect(resolveDanaConcurrency('')).toBe(3)
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts 1..4 and clamps larger values to 4', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveDanaConcurrency('2')).toBe(2)
    expect(resolveDanaConcurrency('4')).toBe(4)
    expect(warn).not.toHaveBeenCalled()
    expect(resolveDanaConcurrency('9')).toBe(4)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[DANA]'))
  })

  it.each(['0', '-1', '1.5', 'abc'])('falls back to 3 with a warning for %s', raw => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveDanaConcurrency(raw)).toBe(3)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[DANA]'))
  })
})
