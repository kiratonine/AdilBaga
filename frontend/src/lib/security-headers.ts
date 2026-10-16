import { httpUrl } from './config'
import { analyticsIds } from './analytics'

// Image origins in the committed prepared dataset. No store API/script access.
const productImageOrigins = ['https://backend.dinamarket.kz', 'https://dana-market.kz', 'https://fix-price.kz']
const tileOrigins = ['https://tile.openstreetmap.org']

/** Production-only policy: dev HMR is outside this policy. No HSTS before HTTPS rollout. */
export function securityHeaders(apiBaseUrl?: string, testMocks = false, analytics: { ga?: string; metrika?: string } = {}) {
  const ids = analyticsIds(analytics.ga, analytics.metrika)
  const scripts = [...(ids.ga ? ['https://www.googletagmanager.com'] : []), ...(ids.metrika ? ['https://mc.yandex.ru'] : [])]
  const collectors = [...(ids.ga ? ['https://www.google-analytics.com', 'https://region1.google-analytics.com'] : []), ...(ids.metrika ? ['https://mc.yandex.ru'] : [])]
  const apiOrigin = apiBaseUrl === undefined ? '' : new URL(httpUrl(apiBaseUrl, 'NEXT_PUBLIC_API_BASE_URL')).origin
  const imageOrigins = [...productImageOrigins, ...tileOrigins, ...(testMocks ? ['https://example.invalid'] : []), ...collectors]
  const policy = [
    "default-src 'self'",
    // App Router streams inline bootstrap/flight scripts. Nonce migration needs
    // separate cache/rendering review. Only configured analytics loaders allowed.
    `script-src 'self' 'unsafe-inline'${scripts.length ? ` ${scripts.join(' ')}` : ''}`,
    // Next inlineCss and Leaflet positioning use inline styles/style attributes.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: ${imageOrigins.join(' ')}`,
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}${collectors.length ? ` ${collectors.join(' ')}` : ''}`,
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
