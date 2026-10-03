'use client'

import { useTranslation } from 'react-i18next'
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../i18n'
import { localePath } from './paths'

/** Язык страницы — из экземпляра i18next, который Providers создал по префиксу URL */
export function useLang(): Language {
  const { i18n } = useTranslation()
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}

/** Хелпер для ссылок: href('/catalog') → '/kk/catalog' на казахской версии */
export function useHref(): (path: string) => string {
  const lang = useLang()
  return (path) => localePath(lang, path)
}
