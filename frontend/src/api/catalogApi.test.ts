import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCatalogApi } from './catalogApi'

const env = {
  mode: 'http',
  publicBaseUrl: 'https://api.example.kz',
  serverBaseUrl: 'http://api:8080',
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>) {
  return String(fetchMock.mock.calls[0][0])
}

describe('createCatalogApi', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubFetch() {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('uses mocks only with explicit mode', async () => {
    const fetchMock = stubFetch()
    const categories = await createCatalogApi({ mode: 'mock' }, true).getCategories()
    expect(categories.length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the internal address on the server and the public one in the browser', async () => {
    const fetchMock = stubFetch()
    await createCatalogApi(env, true).getCategories()
    await createCatalogApi(env, false).getCategories()
    expect(requestedUrl(fetchMock)).toBe('http://api:8080/api/categories')
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://api.example.kz/api/categories')
  })

  it('falls back to the public address on the server', async () => {
    const fetchMock = stubFetch()
    await createCatalogApi({ ...env, serverBaseUrl: undefined }, true).getCategories()
    expect(requestedUrl(fetchMock)).toBe('https://api.example.kz/api/categories')
  })
})
