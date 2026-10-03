import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpAdapter, toSearchParams } from './httpAdapter'
import { ApiError } from './types'

describe('toSearchParams', () => {
  it('repeats multi-select values and skips empty search', () => {
    const params = toSearchParams({
      category: 'milk',
      search: '  ',
      filters: { volumeMl: ['500', '1000'], lactoseFree: ['true'] },
      sort: 'price_asc',
      limit: 24,
      offset: 0,
    })
    expect(params.toString()).toBe(
      'category=milk&volumeMl=500&volumeMl=1000&lactoseFree=true&sort=price_asc&limit=24&offset=0',
    )
  })
})

describe('http adapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls /api under the base url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])))
    vi.stubGlobal('fetch', fetchMock)
    await createHttpAdapter('http://api.test/').getProducts({ category: 'milk', limit: 24, offset: 0 })
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/products?category=milk&limit=24&offset=0')
  })

  it('joins NestJS validation messages', async () => {
    const body = { statusCode: 400, message: ['sort must be one of price_asc, price_desc, name_asc'], error: 'Bad Request' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })))
    const error = await createHttpAdapter('http://api.test').getCategories().catch((e) => e)
    expect(error).toMatchObject({ status: 400, message: body.message[0] })
  })

  it('maps NestJS errors to ApiError', async () => {
    const body = { statusCode: 404, message: 'Product not found', error: 'Not Found' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 404 })))
    const error = await createHttpAdapter('http://api.test').getProduct('1').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Product not found' })
  })
})
