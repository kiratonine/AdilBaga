import { describe, expect, it } from 'vitest'
import { httpUrl, siteUrl, validateApiConfig } from './config'

const http = { mode: 'http', publicBaseUrl: 'https://api.example.test', nodeEnv: 'production' }

describe('fail-closed configuration', () => {
  it('accepts explicit HTTP and uses the public URL for server fallback', () => {
    expect(validateApiConfig(http)).toEqual({ mode: 'http', publicBaseUrl: http.publicBaseUrl, serverBaseUrl: http.publicBaseUrl })
  })
  it('accepts an explicit internal server URL', () => {
    expect(validateApiConfig({ ...http, serverBaseUrl: 'http://api:8080' })).toMatchObject({ serverBaseUrl: 'http://api:8080' })
  })
  it('requires the public URL even with an internal server URL', () => {
    expect(() => validateApiConfig({ ...http, publicBaseUrl: undefined, serverBaseUrl: 'http://api:8080' })).toThrow('NEXT_PUBLIC_API_BASE_URL is required')
  })
  it.each([undefined, '', 'httpp'])('rejects missing/unknown mode %s', (mode) => {
    expect(() => validateApiConfig({ ...http, mode })).toThrow('NEXT_PUBLIC_API_MODE')
  })
  it('rejects production mocks without exact test-only opt-in', () => {
    expect(() => validateApiConfig({ mode: 'mock', nodeEnv: 'production' })).toThrow('Production requires HTTP')
    expect(() => validateApiConfig({ mode: 'mock', nodeEnv: 'production', enableTestMocks: 'true' })).toThrow('Production requires HTTP')
  })
  it('allows explicit development mocks and opted-in test production builds', () => {
    expect(validateApiConfig({ mode: 'mock', nodeEnv: 'development' })).toEqual({ mode: 'mock' })
    expect(validateApiConfig({ mode: 'mock', nodeEnv: 'production', enableTestMocks: '1' })).toEqual({ mode: 'mock' })
  })
  it('requires production site URL without a localhost fallback', () => {
    expect(() => siteUrl(undefined, 'production')).toThrow('NEXT_PUBLIC_SITE_URL is required')
    expect(siteUrl('https://aktau.market', 'production').origin).toBe('https://aktau.market')
  })
  it.each(['not-a-url', 'file:///tmp/test', 'https://user:private@example.test'])('rejects unsafe URLs without echoing values', (value) => {
    expect(() => httpUrl(value, 'API_BASE_URL')).toThrow('API_BASE_URL')
    try { httpUrl(value, 'API_BASE_URL') } catch (error) { expect(String(error)).not.toContain(value) }
  })
})
