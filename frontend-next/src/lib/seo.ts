import type { Metadata } from 'next'
import type { ProductCardDto } from '../api/types'
import { DEFAULT_LANGUAGE, getI18n, LANGUAGES, type Language } from '../i18n'
import { formatDate, formatPrice } from './format'
import { localePath } from './paths'

const OG_LOCALES: Record<Language, string> = { ru: 'ru_KZ', kk: 'kk_KZ' }

/** Картинка для соцсетей по умолчанию — public/og/<lang>.png (scripts/generate-og.mjs) */
export const defaultOgImage = (lang: Language) => ({ url: `/og/${lang}.png`, width: 1200, height: 630 })

/** hreflang → путь: страница на всех языках, x-default — русская версия (язык по умолчанию) */
export function hreflangPaths(path: string): Record<string, string> {
  const languages: Record<string, string> = {}
  for (const lang of LANGUAGES) languages[lang] = localePath(lang, path)
  languages['x-default'] = localePath(DEFAULT_LANGUAGE, path)
  return languages
}

/** canonical — страница на своём языке без query, плюс hreflang-альтернативы */
export function localeAlternates(lang: Language, path: string): NonNullable<Metadata['alternates']> {
  return { canonical: localePath(lang, path), languages: hreflangPaths(path) }
}

/** Описание товара для выдачи: самая низкая цена, сеть и дата снимка */
export function productDescription(lang: Language, product: ProductCardDto): string {
  const { t } = getI18n(lang)
  const cheapest = product.offers[0]
  return t(product.offers.length > 1 ? 'meta.product' : 'meta.productSingle', {
    name: product.name,
    price: formatPrice(cheapest?.price ?? product.minPrice),
    store: cheapest?.storeName ?? '',
    date: formatDate(product.snapshotAt),
  })
}

type PageSeo = {
  lang: Language
  /** Путь без префикса языка: '/catalog', '/products/1' */
  path: string
  /** Название страницы, бренд допишет шаблон из layout. Без него — бренд целиком */
  title?: string
  description: string
  /** Своя картинка (фото товара); без неё — картинка сайта */
  image?: string | null
}

/** Metadata индексируемой страницы: title, description, canonical, hreflang, Open Graph */
export function pageMetadata({ lang, path, title, description, image }: PageSeo): Metadata {
  const { t } = getI18n(lang)
  // В карточке соцсети шаблона из layout нет — бренд дописываем сами
  const socialTitle = title ? `${title} — ${t('brand.name')}` : t('brand.title')
  return {
    title: title ?? { absolute: t('brand.title') },
    description,
    alternates: localeAlternates(lang, path),
    // openGraph из layout не сливается с этим, а заменяется — поэтому поля целиком
    openGraph: {
      type: 'website',
      siteName: t('brand.name'),
      locale: OG_LOCALES[lang],
      alternateLocale: LANGUAGES.filter((l) => l !== lang).map((l) => OG_LOCALES[l]),
      url: localePath(lang, path),
      title: socialTitle,
      description,
      images: image ? [{ url: image, alt: title }] : [defaultOgImage(lang)],
    },
  }
}
