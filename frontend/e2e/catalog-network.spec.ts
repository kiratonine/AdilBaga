import { expect, test } from '@playwright/test'

// Real Next production routing against the explicit local mock build only.
// No request to external analytics, stores, tiles or API origins is allowed.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'localhost'
    ? route.continue() : route.abort('blockedbyclient'))
})

for (const lang of ['ru', 'kk']) {
  test(`category navigation ${lang}: no background prefetch, normal GET and clicked RSC succeed`, async ({ page, request }) => {
    const prefetch: string[] = []
    const pageErrors: string[] = []
    page.on('pageerror', () => pageErrors.push('application_error'))
    page.on('request', req => {
      const u = new URL(req.url())
      if (u.pathname.startsWith(`/${lang}/collections/`) && req.headers()['next-router-prefetch'] === '1') prefetch.push(u.pathname)
    })
    await page.goto(`/${lang}/catalog`, { waitUntil: 'networkidle' })
    const tile = page.getByTestId('category-card').first()
    await expect(tile).toBeVisible()
    const href = await tile.getAttribute('href')
    expect(href).toMatch(new RegExp(`^/${lang}/collections/[a-z0-9-]+$`))
    await tile.hover()
    // Bounded hover observation: the production default schedules on viewport
    // and hover. This is not a retry or a delay hiding a stale assertion.
    await page.waitForTimeout(500)
    expect(prefetch).toEqual([])
    const html = await request.get(href!)
    expect(html.status()).toBe(200)
    expect(html.headers()['content-type']).toContain('text/html')
    const navigation = page.waitForResponse(res => new URL(res.url()).pathname === href
      && res.request().headers().rsc === '1' && !res.request().headers()['next-router-prefetch'])
    await tile.click()
    const response = await navigation
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/x-component')
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(page.getByTestId('product-card').first()).toBeVisible()
    expect(prefetch).toEqual([])
    expect(pageErrors).toEqual([])
  })
}

test('CSP keeps unapproved Yandex image and outbound iframe blocked, inbound framing denied', async ({ page }) => {
  await page.addInitScript(() => {
    const violations: { directive: string; origin: string }[] = []
    Object.assign(window, { __testCsp: violations })
    document.addEventListener('securitypolicyviolation', event => violations.push({
      directive: event.effectiveDirective, origin: new URL(event.blockedURI).origin,
    }))
  })
  const response = await page.goto('/ru/catalog')
  const policy = response!.headers()['content-security-policy']
  expect(policy).toContain("frame-ancestors 'none'")
  expect(response!.headers()['x-frame-options']).toBe('DENY')
  await page.evaluate(() => {
    const image = document.createElement('img')
    image.src = 'https://yandex.ru/an/mapuid/googledctssp/'
    const frame = document.createElement('iframe')
    frame.src = 'https://mc.yandex.ru/'
    document.body.append(image, frame)
  })
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testCsp: unknown[] }).__testCsp)).toEqual(expect.arrayContaining([
    { directive: 'img-src', origin: 'https://yandex.ru' },
    { directive: 'frame-src', origin: 'https://mc.yandex.ru' },
  ]))
})
