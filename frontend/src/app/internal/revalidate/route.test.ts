// @vitest-environment node
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticated, REVALIDATION_BODY } from '../../../lib/revalidation'
import { POST } from './route'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
import { revalidatePath, revalidateTag } from 'next/cache'
const secret = 'part16-synthetic-test-secret-00000000'
const timestamp = '1700000000'
function request(body = REVALIDATION_BODY, headers: Record<string, string> = {}, query = '') {
  const signedTimestamp = headers['X-Adilbaga-Timestamp'] ?? timestamp
  const signature = 'v1=' + createHmac('sha256', secret).update(signedTimestamp + '.').update(body).digest('hex')
  return new Request('http://localhost/internal/revalidate' + query, { method: 'POST', body,
    headers: { 'X-Adilbaga-Timestamp': timestamp, 'X-Adilbaga-Signature': signature, ...headers } })
}
describe('fixed authenticated revalidation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Number(timestamp) * 1000); vi.stubEnv('REVALIDATE_HMAC_SECRET', secret); vi.clearAllMocks() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
  it('shares the Go synthetic golden vector', () => {
    expect(authenticated(secret, timestamp, 'v1=ce184df67d6068a4432905181f4a60b6365d1d8dc6e119cfdbc7a84892a31e4b', Buffer.from(REVALIDATION_BODY))).toBe(true)
  })
  it('immediately expires only fixed catalog tag and product ISR pattern', async () => {
    const response = await POST(request())
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('catalog-data', { expire: 0 })
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/[lang]/(site)/products/[id]', 'page')
  })
  it.each([-300, 300])('accepts a correctly signed timestamp at replay-window boundary %d', async (skew) => {
    expect((await POST(request(REVALIDATION_BODY, { 'X-Adilbaga-Timestamp': String(Number(timestamp) + skew) }))).status).toBe(204)
  })
  it.each<Record<string, string>>([
    { 'X-Adilbaga-Signature': '' },
    { 'X-Adilbaga-Signature': 'v1=' + '0'.repeat(64) },
    { 'X-Adilbaga-Signature': 'malformed' },
    { 'X-Adilbaga-Timestamp': '' },
    { 'X-Adilbaga-Timestamp': 'invalid' },
    { 'X-Adilbaga-Timestamp': String(Number(timestamp) - 301) },
    { 'X-Adilbaga-Timestamp': String(Number(timestamp) + 301) },
  ])('rejects authentication without invalidation or disclosure (%#)', async (headers) => {
    const response = await POST(request(REVALIDATION_BODY, headers))
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('')
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('rejects changed bytes after signing', async () => {
    const signed = request()
    const modified = new Request(signed.url, { method: 'POST', headers: signed.headers, body: REVALIDATION_BODY + ' ' })
    expect((await POST(modified)).status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
  it.each(['', 'short'])('fails closed for missing/short server secret', async (value) => {
    vi.stubEnv('REVALIDATE_HMAC_SECRET', value)
    expect((await POST(request())).status).toBe(503)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
  it('rejects even correctly signed caller tag/path and query', async () => {
    expect((await POST(request('{"event":"snapshot_published","tag":"arbitrary","path":"/"}'))).status).toBe(400)
    expect((await POST(request(REVALIDATION_BODY, {}, '?path=/'))).status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
  it('bounds chunked bodies without trusting content-length', async () => {
    expect((await POST(request('x'.repeat(129)))).status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
  it('does not export a GET action', async () => {
    const handlers = await import('./route')
    expect(handlers).not.toHaveProperty('GET')
  })
})
