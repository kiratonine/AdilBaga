import { revalidatePath, revalidateTag } from 'next/cache'
import { authenticated, boundedBody, REVALIDATION_BODY } from '../../../lib/revalidation'

export const runtime = 'nodejs'

function reject(status: number) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_HMAC_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) return reject(503)
  const body = await boundedBody(request)
  if (!body || !authenticated(secret, request.headers.get('X-Adilbaga-Timestamp'), request.headers.get('X-Adilbaga-Signature'), body)) return reject(401)
  if (new URL(request.url).search || Buffer.from(body).toString('utf8') !== REVALIDATION_BODY) return reject(400)
  revalidateTag('catalog-data', { expire: 0 })
  // Explicitly expire previously generated product ISR pages (all languages/IDs).
  revalidatePath('/[lang]/(site)/products/[id]', 'page')
  // Sitemap is dynamic; its tagged API requests expire with catalog-data.
  return reject(204)
}
