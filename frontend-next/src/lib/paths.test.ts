import { describe, expect, it } from 'vitest'
import { localePath, stripLanguage, switchLanguagePath } from './paths'

describe('paths', () => {
  it('prefixes a path with the language', () => {
    expect(localePath('ru', '/')).toBe('/ru')
    expect(localePath('kk', '/catalog')).toBe('/kk/catalog')
    expect(localePath('kk', '/products/p1')).toBe('/kk/products/p1')
  })

  it('swaps the language prefix keeping the rest of the path', () => {
    expect(switchLanguagePath('/ru', 'kk')).toBe('/kk')
    expect(switchLanguagePath('/ru/collections/milk', 'kk')).toBe('/kk/collections/milk')
    expect(switchLanguagePath('/kk/search', 'ru')).toBe('/ru/search')
  })

  it('leaves paths without a language prefix as they are', () => {
    expect(stripLanguage('/catalog')).toBe('/catalog')
    expect(stripLanguage('/ru/catalog')).toBe('/catalog')
  })
})
