import { isLanguage, type Language } from '../i18n/languages'

/** Путь с префиксом языка: localePath('kk', '/catalog') → '/kk/catalog', localePath('ru', '/') → '/ru' */
export function localePath(lang: Language, path: string): string {
  return path === '/' ? `/${lang}` : `/${lang}${path}`
}

/** Тот же путь на другом языке: '/ru/products/1' → '/kk/products/1' */
export function switchLanguagePath(pathname: string, lang: Language): string {
  return localePath(lang, stripLanguage(pathname))
}

/** Путь без префикса языка: '/ru/catalog' → '/catalog', '/ru' → '/' */
export function stripLanguage(pathname: string): string {
  const [, first, ...rest] = pathname.split('/')
  if (!isLanguage(first)) return pathname
  return `/${rest.join('/')}`
}

export type NavSection = 'catalog' | 'search' | 'dashboard'

/** Раздел навигации страницы. Категории и товары — часть каталога */
export function navSection(pathname: string): NavSection | null {
  const [, first] = stripLanguage(pathname).split('/')
  if (first === 'catalog' || first === 'collections' || first === 'products') return 'catalog'
  if (first === 'search' || first === 'dashboard') return first
  return null
}
