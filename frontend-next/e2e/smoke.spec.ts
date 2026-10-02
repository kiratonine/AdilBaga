import { expect, test } from '@playwright/test'

// Временная проверка каркаса; e2e старого фронта переносятся в сессии Next 5
test('server HTML already contains product cards with prices', async ({ request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('<html lang="ru"')
  expect(html).toContain('data-testid="product-card"')
  expect(html).toMatch(/data-testid="min-price"[^>]*>\d[\d\s]*₸/)
})

test('page hydrates without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.getByTestId('product-card').first()).toBeVisible()
  await expect(page.getByTestId('copyright')).toContainText(String(new Date().getFullYear()))

  // Ссылка карточки ведёт на страницу товара (сама страница — сессия Next 3)
  const href = await page.getByTestId('product-card').first().getByRole('link').getAttribute('href')
  expect(href).toMatch(/^\/products\//)
  expect(errors).toEqual([])
})
