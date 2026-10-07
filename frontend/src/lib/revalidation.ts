import { createHmac, timingSafeEqual } from 'node:crypto'

export const REVALIDATION_BODY = '{"event":"snapshot_published"}'
export const MAX_REVALIDATION_BYTES = 128

/** Server-only webhook authentication; never export through client modules. */
export function authenticated(secret: string, timestamp: string | null, signature: string | null, body: Uint8Array, now = Date.now()): boolean {
  if (Buffer.byteLength(secret) < 32 || !timestamp || !/^[0-9]{1,12}$/.test(timestamp)
    || !signature || !/^v1=[0-9a-f]{64}$/.test(signature)) return false
  const seconds = Number(timestamp)
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > 300) return false
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(body).digest()
  return timingSafeEqual(expected, Buffer.from(signature.slice(3), 'hex'))
}

export async function boundedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_REVALIDATION_BYTES) { await reader.cancel(); return null }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } catch { return null }
  finally { reader.releaseLock() }
}
