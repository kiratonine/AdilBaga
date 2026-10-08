import type { ProductCardDto } from '../api/types'
import type { Language } from '../i18n/languages'
import { localePath } from './paths'
import { absoluteUrl } from './site'

// JSON-LD (schema.org) для поисковиков: цены товара и «хлебные крошки» в выдаче

type Crumb = { name: string; path: string }

/**
 * WebSite + Organization для главной (каталога): по ним Google показывает в выдаче название сайта
 * вместо домена. Один @graph — организация публикует сайт
 */
export function siteJsonLd(lang: Language, { name, description }: { name: string; description: string }) {
  const organizationId = absoluteUrl('/#organization')
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name,
        url: absoluteUrl('/'),
        logo: absoluteUrl('/icon.svg'),
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl(`${localePath(lang, '/')}#website`),
        name,
        description,
        url: absoluteUrl(localePath(lang, '/catalog')),
        inLanguage: lang,
        publisher: { '@id': organizationId },
      },
    ],
  }
}

/** BreadcrumbList: путь без префикса языка, URL — абсолютные на языке страницы */
export function breadcrumbJsonLd(lang: Language, crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(localePath(lang, crumb.path)),
    })),
  }
}

/** Product + AggregateOffer: диапазон цен по сетям и предложение каждой сети */
export function productJsonLd(lang: Language, product: ProductCardDto) {
  const prices = product.offers.map((offer) => offer.price)
  const url = absoluteUrl(localePath(lang, `/products/${product.id}`))
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url,
    url,
    sku: product.id,
    name: product.name,
    ...(product.imageUrl && { image: [product.imageUrl] }),
    ...(product.brand && { brand: { '@type': 'Brand', name: product.brand } }),
    category: product.category.name,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'KZT',
      lowPrice: prices.length ? Math.min(...prices) : product.minPrice,
      highPrice: prices.length ? Math.max(...prices) : product.minPrice,
      offerCount: product.offers.length,
      offers: product.offers.map((offer) => ({
        '@type': 'Offer',
        price: offer.price,
        priceCurrency: 'KZT',
        seller: { '@type': 'Organization', name: offer.storeName },
        // Наличия в контракте пока нет — без поля, а не «в наличии» наугад
        ...(offer.inStock !== undefined && {
          availability: offer.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        }),
      })),
    },
  }
}

/** JSON для <script type="application/ld+json">: `<` экранируется, чтобы название товара не закрыло тег */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
