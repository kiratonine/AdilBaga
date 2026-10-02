// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { languageFromHeader, proxy } from './proxy'

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'https://adilbaga.kz'), { headers })
}

const location = (response: Response) => response.headers.get('location')

describe('languageFromHeader', () => {
  it('picks the supported language with the highest q', () => {
    expect(languageFromHeader('kk-KZ,kk;q=0.9,ru;q=0.8')).toBe('kk')
    expect(languageFromHeader('ru-RU,ru;q=0.9,kk;q=0.8')).toBe('ru')
    expect(languageFromHeader('en-US,en;q=0.9,kk;q=0.5,ru;q=0.7')).toBe('ru')
    expect(languageFromHeader('ru;q=0,kk;q=0.1')).toBe('kk')
  })

  it('returns nothing for unsupported or missing languages', () => {
    expect(languageFromHeader('en-US,de')).toBeUndefined()
    expect(languageFromHeader(null)).toBeUndefined()
  })
})

describe('proxy', () => {
  it('sends / to the language from Accept-Language with a temporary redirect', () => {
    const response = proxy(request('/', { 'accept-language': 'kk-KZ,ru;q=0.5' }))
    expect(response.status).toBe(307)
    expect(location(response)).toBe('https://adilbaga.kz/kk')
  })

  it('defaults to Russian', () => {
    expect(location(proxy(request('/')))).toBe('https://adilbaga.kz/ru')
    expect(location(proxy(request('/', { 'accept-language': 'en' })))).toBe('https://adilbaga.kz/ru')
  })

  it('prefers the remembered choice over Accept-Language', () => {
    const response = proxy(request('/', { 'accept-language': 'ru', cookie: 'lang=kk' }))
    expect(location(response)).toBe('https://adilbaga.kz/kk')
    // Мусор в cookie игнорируется
    expect(location(proxy(request('/', { 'accept-language': 'kk', cookie: 'lang=en' })))).toBe('https://adilbaga.kz/kk')
  })

  it('permanently redirects old SPA URLs keeping the query', () => {
    const response = proxy(request('/collections/milk?volumeMl=1000&sort=price_desc'))
    expect(response.status).toBe(308)
    expect(location(response)).toBe('https://adilbaga.kz/ru/collections/milk?volumeMl=1000&sort=price_desc')
    expect(location(proxy(request('/dashboard', { cookie: 'lang=kk' })))).toBe('https://adilbaga.kz/kk/dashboard')
  })

  it('lets prefixed URLs through', () => {
    for (const path of ['/ru', '/kk', '/ru/catalog', '/kk/products/p1']) {
      expect(location(proxy(request(path)))).toBeNull()
    }
  })
})
