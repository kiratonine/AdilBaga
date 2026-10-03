import type { MetadataRoute } from 'next'
import { absoluteUrl } from '../lib/site'

// Поиск не закрываем здесь: он отдаёт noindex, а закрытую в robots страницу поисковик не прочитает
// и noindex не увидит. Ссылки с неё на товары (follow) тоже полезны
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
