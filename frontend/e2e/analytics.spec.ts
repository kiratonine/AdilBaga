import { expect, test, type Page, type Route } from '@playwright/test'

// All apparent canonical-origin traffic is fulfilled from our loopback server.
// Analytics libraries and collectors are synthetic/intercepted, NEVER contacted.
test.skip(process.env.NEXT_PUBLIC_GA_ID !== 'G-TEST123456' || process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID !== '12345678'
  || process.env.NEXT_PUBLIC_SITE_URL !== 'https://aktau.market', 'requires explicit dummy-ID local build')
const pending = new WeakMap<Page, Set<Promise<void>>>()
async function routeAll(page: Page, handle: (route: Route) => Promise<void>) {
  const jobs = new Set<Promise<void>>()
  pending.set(page, jobs)
  await page.route('**/*', async route => {
    const job = handle(route)
    jobs.add(job)
    try { await job } finally { jobs.delete(job) }
  })
}
// Playwright removes the server handler before its client-side unroute wait.
// Quiesce the document and drain fetch/fulfill FIRST, then remove interception.
// No ignored route errors and no change to production prefetch behavior.
test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
  const jobs = pending.get(page)
  while (jobs?.size) await Promise.all([...jobs])
  await page.unrouteAll({ behavior: 'wait' })
})

async function intercept(page: Page, blocked = false) {
  const collected: { provider: string; payload: unknown }[] = [], loads: string[] = [], csp: string[] = [], errors: string[] = []
  page.on('console', message => { if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) csp.push('csp_violation') })
  page.on('pageerror', () => errors.push('page_error'))
  await routeAll(page, async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'https://aktau.market') {
      try {
        const response = await route.fetch({ url: `http://127.0.0.1:3100${url.pathname}${url.search}`, maxRedirects: 0 })
        return await route.fulfill({ status: response.status(), headers: response.headers(), body: await response.body() })
      } catch (error) {
        // App Router can cancel RSC prefetch during traversal. Only a cancelled
        // browser request is ignorable; active document/asset failures still fail.
        if (route.request().failure() && route.request().headers().rsc === '1') return
        throw error
      }
    }
    if (url.href === 'https://www.googletagmanager.com/gtag/js?id=G-TEST123456' || url.href === 'https://mc.yandex.ru/metrika/tag.js') {
      if (blocked) return route.abort('blockedbyclient')
      const google = url.hostname === 'www.googletagmanager.com'; loads.push(google ? 'ga' : 'ym')
      // Deliberately slow loader: init/hits must remain queued until it executes.
      await new Promise(resolve => setTimeout(resolve, 100))
      const script = google
        ? `const q=window.dataLayer; const emit=a=>{if(a[0]==='event')fetch('https://www.google-analytics.com/g/collect',{method:'POST',body:JSON.stringify(Array.from(a))})};q.forEach(emit);const push=q.push.bind(q);q.push=a=>{emit(a);return push(a)};`
        : `const q=window.ym.a||[];window.ym=function(){if(['hit','reachGoal'].includes(arguments[1]))fetch('https://mc.yandex.ru/watch/12345678',{method:'POST',body:JSON.stringify(Array.from(arguments))})};q.forEach(a=>window.ym.apply(null,a));`
      return route.fulfill({ contentType: 'application/javascript', body: `{${script}}` })
    }
    if (url.href === 'https://www.google-analytics.com/g/collect' || url.href === 'https://mc.yandex.ru/watch/12345678') {
      collected.push({ provider: url.hostname === 'mc.yandex.ru' ? 'ym' : 'ga', payload: route.request().postDataJSON() })
      return route.fulfill({ status: 204 })
    }
    // Includes images/map tiles: no inherited external network permitted.
    return route.abort('blockedbyclient')
  })
  return { collected, loads, csp, errors }
}

test('real Next navigation: initial, RU/KK, Back/Forward, private query, loaders once', async ({ page }) => {
  const result = await intercept(page)
  await page.goto('https://aktau.market/ru/catalog?q=private#private')
  await expect.poll(() => result.collected.length).toBe(2)
  await page.locator('a[href="/ru/dashboard"]:visible').first().click()
  await expect.poll(() => result.collected.length).toBe(4)
  await page.locator('a[href="/kk/dashboard"]').first().click()
  await expect.poll(() => result.collected.length).toBe(6)
  await page.goBack()
  await expect.poll(() => result.collected.length).toBe(8)
  await page.goForward()
  await expect.poll(() => result.collected.length).toBe(10)
  // Next supports native history integration without adding a pathname view.
  await page.evaluate(() => history.replaceState(null, '', '?q=private#private'))
  await expect(page).toHaveURL(/\?q=private#private$/)
  expect(result.collected.filter(v => v.provider === 'ga')).toHaveLength(5)
  expect(result.collected.filter(v => v.provider === 'ym')).toHaveLength(5)
  expect(JSON.stringify(result.collected)).not.toContain('private')
  expect(result.loads.sort()).toEqual(['ga', 'ym'])
  expect(result.csp).toEqual([])
  expect(result.errors).toEqual([])
})

test('blocking both third-party scripts does not break application navigation', async ({ page }) => {
  const result = await intercept(page, true)
  await page.goto('https://aktau.market/ru/catalog')
  await page.locator('a[href="/ru/dashboard"]:visible').first().click()
  await expect(page).toHaveURL('https://aktau.market/ru/dashboard')
  await expect(page.locator('main')).toBeVisible()
  expect(result.collected).toEqual([])
  expect(result.errors).toEqual([])
})

test('pilot UI events, settled search and entry-only attribution without real hits', async ({ page, isMobile }) => {
  const result = await intercept(page)
  const events = (name: string, provider = 'ga') => result.collected.filter(v => v.provider === provider &&
    (v.payload as unknown[])[provider === 'ga' ? 1 : 2] === name)
  await page.goto('https://aktau.market/ru/collections/milk?utm_source=telegram&utm_medium=social&utm_campaign=pilot&q=private')
  await expect.poll(() => events('category_view').length).toBe(1)
  await expect.poll(() => events('category_view', 'ym').length).toBe(1)
  expect(events('filter_apply')).toHaveLength(0)
  expect(JSON.stringify(events('page_view'))).toContain('utm_source=telegram')
  if (isMobile) await page.getByTestId('filters-toggle').click()
  const filter = page.getByTestId('filter-volumeMl').filter({ visible: true })
  await filter.getByRole('button', { name: /^500/ }).click()
  await expect.poll(() => events('filter_apply').length).toBe(1)
  if (isMobile) {
    await page.getByTestId('filters-sheet').getByRole('button', { name: 'Сбросить', exact: true }).click()
    await page.getByTestId('filters-sheet').getByRole('button', { name: 'Показать' }).click()
    await page.getByTestId('sort-chip').click()
    await page.getByTestId('sort-sheet').getByRole('radio', { name: 'Сначала дорогие' }).click()
  } else {
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
    await page.getByTestId('sort-select').selectOption('price_desc')
  }
  await expect.poll(() => events('filter_reset').length).toBe(1)
  await expect.poll(() => events('sort_change').length).toBe(1)
  await page.getByTestId('product-card').first().getByRole('link').click()
  await expect.poll(() => events('view_item').length).toBe(1)
  await page.getByTestId('search-input').fill('ананас')
  await expect.poll(() => events('search_no_results').length).toBe(1)
  expect(events('search')).toHaveLength(1)
  expect(JSON.stringify(result.collected)).not.toMatch(/private|ананас|search_term/)
  expect(JSON.stringify(events('search'))).not.toContain('utm_')
  expect(result.csp).toEqual([])
  expect(result.errors).toEqual([])
  expect(result.loads.sort()).toEqual(['ga', 'ym'])
})

test('loopback page with a production canonical setting loads no analytics', async ({ page }) => {
  const external: string[] = []
  await routeAll(page, async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:3100') return route.continue()
    if (/google|yandex/.test(url.hostname)) external.push(url.hostname)
    return route.abort('blockedbyclient')
  })
  await page.goto('http://localhost:3100/ru/catalog')
  await page.locator('a[href="/ru/dashboard"]:visible').first().click()
  await expect(page.locator('main')).toBeVisible()
  expect(external).toEqual([])
})
