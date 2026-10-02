import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGE_COOKIE, LANGUAGES, type Language } from './i18n/languages'

/** Accept-Language → первый из поддерживаемых языков по убыванию q ('kk-KZ' считается 'kk') */
export function languageFromHeader(header: string | null): Language | undefined {
  if (!header) return undefined
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...attrs] = part.trim().toLowerCase().split(';')
      const q = attrs.map((a) => a.trim()).find((a) => a.startsWith('q='))
      return { base: tag.split('-')[0], q: q ? Number(q.slice(2)) : 1, index }
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
  return ranked.map((entry) => entry.base).find((base): base is Language => LANGUAGES.includes(base as Language))
}

export function preferredLanguage(request: NextRequest): Language {
  const cookie = request.cookies.get(LANGUAGE_COOKIE)?.value
  if (isLanguage(cookie)) return cookie
  return languageFromHeader(request.headers.get('accept-language')) ?? DEFAULT_LANGUAGE
}

/**
 * Все страницы живут под /ru и /kk. `/` ведёт на язык пользователя (временный редирект — ответ зависит от него),
 * старые адреса без префикса (/catalog, /products/1 из SPA) — постоянный редирект, query сохраняется
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const first = pathname.split('/')[1]
  if (isLanguage(first)) return NextResponse.next()

  const url = request.nextUrl.clone()
  const lang = preferredLanguage(request)
  url.pathname = pathname === '/' ? `/${lang}` : `/${lang}${pathname}`
  return NextResponse.redirect(url, pathname === '/' ? 307 : 308)
}

export const config = {
  // Служебное (_next), API и файлы с расширением (icon.svg, robots.txt, sitemap.xml) — мимо
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
}
