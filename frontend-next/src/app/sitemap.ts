import type { MetadataRoute } from 'next'
import { catalogApi } from '../api/catalogApi'
import type { ProductCardDto } from '../api/types'
import { LANGUAGES } from '../i18n/languages'
import { localePath } from '../lib/paths'
import { hreflangPaths } from '../lib/seo'
import { absoluteUrl } from '../lib/site'

// Как каталог: строится при сборке (в http-режиме — с запросами в API) и обновляется раз в час
export const revalidate = 3600

const PAGE_SIZE = 100
/** Предел на случай, если API игнорирует offset: 50 страниц × 100 товаров × 2 языка — в лимите sitemap (50 000) */
const MAX_PAGES = 50

async function allProducts(): Promise<ProductCardDto[]> {
  const products: ProductCardDto[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await catalogApi.getProducts({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
    products.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return products
}

/** Каждая страница — на всех языках, с hreflang-альтернативами (как в <head>) */
function localized(path: string, extra: Omit<MetadataRoute.Sitemap[number], 'url'>): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(Object.entries(hreflangPaths(path)).map(([l, href]) => [l, absoluteUrl(href)]))
  return LANGUAGES.map((lang) => ({ url: absoluteUrl(localePath(lang, path)), alternates: { languages }, ...extra }))
}

// Поиск не включён — он noindex
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, dashboard, products] = await Promise.all([
    catalogApi.getCategories(),
    catalogApi.getDashboard(),
    allProducts(),
  ])
  const snapshot = dashboard.summary.snapshotAt

  return [
    ...localized('/', { lastModified: snapshot, priority: 1 }),
    ...localized('/catalog', { lastModified: snapshot, changeFrequency: 'daily', priority: 0.9 }),
    ...localized('/dashboard', { lastModified: snapshot, changeFrequency: 'daily', priority: 0.6 }),
    ...categories.flatMap((category) =>
      localized(`/collections/${category.slug}`, { lastModified: snapshot, changeFrequency: 'daily', priority: 0.8 }),
    ),
    ...products.flatMap((product) =>
      localized(`/products/${product.id}`, {
        lastModified: product.snapshotAt,
        changeFrequency: 'daily',
        priority: 0.7,
        ...(product.imageUrl && { images: [product.imageUrl] }),
      }),
    ),
  ]
}
