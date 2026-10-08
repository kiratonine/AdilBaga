import { siteUrl } from './config'

/**
 * Публичный адрес сайта — база для абсолютных URL в canonical, hreflang, Open Graph, JSON-LD и sitemap.
 * В production адрес обязателен; ошибка конфигурации останавливает сборку.
 */
export const SITE_URL = siteUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV)

/** '/ru/catalog' → 'https://<домен>/ru/catalog' */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}
