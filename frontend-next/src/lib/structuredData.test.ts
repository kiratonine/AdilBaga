import { describe, expect, it } from 'vitest'
import type { ProductCardDto } from '../api/types'
import { breadcrumbJsonLd, productJsonLd, serializeJsonLd, siteJsonLd } from './structuredData'

const product: ProductCardDto = {
  id: 'p1',
  name: 'Молоко 3,2% 1 л',
  brand: 'FoodMaster',
  category: { slug: 'milk', name: 'Молоко' },
  imageUrl: 'https://cdn.example/milk.jpg',
  attributes: {},
  minPrice: 570,
  offers: [
    { storeCode: 'DINA', storeName: 'DINA', price: 570, oldPrice: null },
    { storeCode: 'DANA', storeName: 'DANA', price: 650, oldPrice: 700, inStock: false },
  ],
  snapshotAt: '2026-09-24T06:00:00Z',
}

describe('structuredData', () => {
  it('describes a product with the price range across stores and an offer per store', () => {
    const data = productJsonLd('kk', product)
    expect(data).toMatchObject({
      '@type': 'Product',
      '@id': 'http://localhost:3000/kk/products/p1',
      url: 'http://localhost:3000/kk/products/p1',
      name: 'Молоко 3,2% 1 л',
      image: ['https://cdn.example/milk.jpg'],
      brand: { '@type': 'Brand', name: 'FoodMaster' },
      offers: { '@type': 'AggregateOffer', priceCurrency: 'KZT', lowPrice: 570, highPrice: 650, offerCount: 2 },
    })
    expect(data.offers.offers).toEqual([
      { '@type': 'Offer', price: 570, priceCurrency: 'KZT', seller: { '@type': 'Organization', name: 'DINA' } },
      {
        '@type': 'Offer',
        price: 650,
        priceCurrency: 'KZT',
        seller: { '@type': 'Organization', name: 'DANA' },
        availability: 'https://schema.org/OutOfStock',
      },
    ])
  })

  it('omits image and brand when the product has none', () => {
    const data = productJsonLd('ru', { ...product, imageUrl: null, brand: null })
    expect(data).not.toHaveProperty('image')
    expect(data).not.toHaveProperty('brand')
  })

  it('numbers breadcrumbs and makes their URLs absolute in the page language', () => {
    expect(
      breadcrumbJsonLd('kk', [
        { name: 'Каталог', path: '/catalog' },
        { name: 'Молоко', path: '/collections/milk' },
      ]).itemListElement,
    ).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Каталог', item: 'http://localhost:3000/kk/catalog' },
      { '@type': 'ListItem', position: 2, name: 'Молоко', item: 'http://localhost:3000/kk/collections/milk' },
    ])
  })

  it('publishes the site name as WebSite by the Organization, on the catalog of the page language', () => {
    const data = siteJsonLd('kk', { name: 'Adil Bağa', description: 'Бағаларды салыстыру' })
    expect(data['@graph']).toEqual([
      {
        '@type': 'Organization',
        '@id': 'http://localhost:3000/#organization',
        name: 'Adil Bağa',
        url: 'http://localhost:3000/',
        logo: 'http://localhost:3000/icon.svg',
      },
      {
        '@type': 'WebSite',
        '@id': 'http://localhost:3000/kk#website',
        name: 'Adil Bağa',
        description: 'Бағаларды салыстыру',
        url: 'http://localhost:3000/kk/catalog',
        inLanguage: 'kk',
        publisher: { '@id': 'http://localhost:3000/#organization' },
      },
    ])
  })

  it('escapes < so a product name cannot close the script tag', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(json).not.toContain('<')
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
