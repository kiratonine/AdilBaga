import { expect, test } from '@playwright/test'

// Только серверный HTML и служебные файлы — так их видит поисковик, без JS
const MILK_ID = 'p0a1f000-0000-4000-8000-000000000001'

/** Адрес сайта зависит от NEXT_PUBLIC_SITE_URL при сборке — проверяем путь */
const link = (attrs: string, path: string) => new RegExp(`<link rel="${attrs}"[^>]* href="https?://[^"/]+${path}"`)

function jsonLd(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
}

test.describe('SEO', () => {
  test('product page: description, canonical, hreflang, Open Graph and JSON-LD', async ({ request }) => {
    const html = await (await request.get(`/kk/products/${MILK_ID}`)).text()
    expect(html).toMatch(/<meta name="description" content="Молоко FoodMaster 3,2% 1 л — [^"]+желісінде 570/)
    expect(html).toMatch(link('canonical', `/kk/products/${MILK_ID}`))
    expect(html).toMatch(link('alternate" hrefLang="ru', `/ru/products/${MILK_ID}`))
    expect(html).toMatch(link('alternate" hrefLang="kk', `/kk/products/${MILK_ID}`))
    expect(html).toMatch(link('alternate" hrefLang="x-default', `/ru/products/${MILK_ID}`))
    expect(html).toContain('<meta property="og:locale" content="kk_KZ"/>')
    expect(html).toMatch(/<meta property="og:image" content="[^"]+\/og\/kk\.png"\/>/)

    const [product, breadcrumbs] = jsonLd(html)
    expect(product).toMatchObject({
      '@type': 'Product',
      name: 'Молоко FoodMaster 3,2% 1 л',
      offers: { '@type': 'AggregateOffer', priceCurrency: 'KZT', lowPrice: 570, offerCount: 3 },
    })
    expect(breadcrumbs).toMatchObject({ '@type': 'BreadcrumbList' })
    expect((breadcrumbs.itemListElement as unknown[]).length).toBe(3)
  })

  test('category canonical drops filters and sort', async ({ request }) => {
    const html = await (await request.get('/ru/collections/milk?volumeMl=500&sort=price_desc')).text()
    expect(html).toMatch(link('canonical', '/ru/collections/milk'))
    expect(jsonLd(html)[0]).toMatchObject({ '@type': 'BreadcrumbList' })
  })

  test('landing, catalog and dashboard have descriptions and canonicals', async ({ request }) => {
    for (const path of ['/ru', '/kk/catalog', '/ru/dashboard']) {
      const html = await (await request.get(path)).text()
      expect(html, path).toMatch(/<meta name="description" content="[^"]{60,}"/)
      expect(html, path).toMatch(link('canonical', path))
    }
  })

  test('sitemap lists pages in both languages, robots points to it', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toMatch(/<loc>https?:\/\/[^<]+\/kk\/products\/p0a1f000-0000-4000-8000-000000000001<\/loc>/)
    expect(sitemap).toMatch(/<loc>https?:\/\/[^<]+\/ru\/collections\/milk<\/loc>/)
    expect(sitemap).toContain('hreflang="x-default"')
    expect(sitemap).not.toContain('/search')

    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/)
  })

  test('Open Graph image is served', async ({ request }) => {
    const response = await request.get('/og/ru.png')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
  })
})
