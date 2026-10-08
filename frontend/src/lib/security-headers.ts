import { httpUrl } from './config'

// Image origins in the committed prepared dataset. No store API/script access.
const productImageOrigins = ['https://backend.dinamarket.kz', 'https://dana-market.kz', 'https://fix-price.kz']
const tileOrigins = ['https://a.tile.openstreetmap.org', 'https://b.tile.openstreetmap.org', 'https://c.tile.openstreetmap.org']

/** Production-only policy: dev HMR is outside this policy. No HSTS before HTTPS rollout. */
export function securityHeaders(apiBaseUrl?: string, testMocks = false) {
  const apiOrigin = apiBaseUrl === undefined ? '' : new URL(httpUrl(apiBaseUrl, 'NEXT_PUBLIC_API_BASE_URL')).origin
  const imageOrigins = [...productImageOrigins, ...tileOrigins, ...(testMocks ? ['https://example.invalid'] : [])]
  const policy = [
    "default-src 'self'",
    // App Router streams inline bootstrap/flight scripts. Nonce migration needs
    // separate cache/rendering review; no external scripts or unsafe-eval allowed.
    "script-src 'self' 'unsafe-inline'",
    // Next inlineCss and Leaflet positioning use inline styles/style attributes.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: ${imageOrigins.join(' ')}`,
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ')
  return [
    { key: 'Content-Security-Policy', value: policy },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  ]
}
