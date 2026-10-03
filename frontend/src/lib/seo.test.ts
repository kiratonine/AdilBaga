import { describe, expect, it } from 'vitest'
import type { ProductCardDto } from '../api/types'
import { localeAlternates, pageMetadata, productDescription } from './seo'

const product: ProductCardDto = {
  id: 'p1',
  name: 'Молоко 3,2% 1 л',
  brand: 'FoodMaster',
  category: { slug: 'milk', name: 'Молоко' },
  imageUrl: null,
  attributes: {},
  minPrice: 570,
  offers: [
    { storeCode: 'DINA', storeName: 'DINA', price: 570, oldPrice: null },
    { storeCode: 'DANA', storeName: 'DANA', price: 650, oldPrice: null },
  ],
  snapshotAt: '2026-09-24T06:00:00Z',
}

describe('seo', () => {
  it('points canonical to the page in its own language and lists every language plus x-default', () => {
    expect(localeAlternates('kk', '/collections/milk')).toEqual({
      canonical: '/kk/collections/milk',
      languages: { ru: '/ru/collections/milk', kk: '/kk/collections/milk', 'x-default': '/ru/collections/milk' },
    })
    expect(localeAlternates('kk', '/').canonical).toBe('/kk')
  })

  it('builds page metadata with Open Graph in the page language and the default image', () => {
    const metadata = pageMetadata({ lang: 'kk', path: '/catalog', title: 'Каталог', description: 'Сипаттама' })
    expect(metadata.title).toBe('Каталог')
    expect(metadata.description).toBe('Сипаттама')
    expect(metadata.openGraph).toMatchObject({
      locale: 'kk_KZ',
      alternateLocale: ['ru_KZ'],
      url: '/kk/catalog',
      images: [{ url: '/og/kk.png', width: 1200, height: 630 }],
    })
  })

  it('uses the brand title on pages without their own and the product photo when there is one', () => {
    expect(pageMetadata({ lang: 'ru', path: '/', description: '' }).title).toEqual({
      absolute: 'Adil Bağa — сравнение цен в Актау',
    })
    const metadata = pageMetadata({ lang: 'ru', path: '/products/p1', title: 'Молоко', description: '', image: 'https://cdn/1.jpg' })
    expect(metadata.openGraph?.images).toEqual([{ url: 'https://cdn/1.jpg', alt: 'Молоко' }])
  })

  it('describes a product by its lowest price, store and snapshot date', () => {
    expect(productDescription('ru', product)).toBe(
      'Молоко 3,2% 1 л — от 570 ₸ в DINA. Сравнение цен в магазинах Актау на 24.09.2026.',
    )
    expect(productDescription('ru', { ...product, offers: product.offers.slice(0, 1) })).toBe(
      'Молоко 3,2% 1 л — 570 ₸ в DINA. Цена в магазинах Актау на 24.09.2026.',
    )
  })
})
