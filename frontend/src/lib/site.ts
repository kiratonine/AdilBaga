const FALLBACK_SITE_URL = 'http://localhost:3000'

/**
 * Публичный адрес сайта — база для абсолютных URL в canonical, hreflang, Open Graph, JSON-LD и sitemap.
 * Домена пока нет: задаётся env NEXT_PUBLIC_SITE_URL при сборке, без него — localhost
 * (next build предупреждает об этом — next.config.ts)
 */
export const SITE_URL = new URL(process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL)

/** '/ru/catalog' → 'https://<домен>/ru/catalog' */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}
