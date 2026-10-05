import { expect, test } from '@playwright/test'

test('switch to Kazakh keeps the page, translates it and is remembered for /', async ({ page }) => {
  await page.goto('/ru/dashboard', { waitUntil: 'networkidle' })
  await expect(page).toHaveTitle('Аналитика цен — Adil Bağa')

  await page.getByRole('group', { name: 'Язык интерфейса' }).getByRole('link', { name: 'Қаз' }).click()
  await expect(page).toHaveURL(/\/kk\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Баға талдауы')
  await expect(page).toHaveTitle('Баға талдауы — Adil Bağa')
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')

  // Корень сайта ведёт на выбранный язык (cookie), а не на язык браузера
  await page.goto('/')
  await expect(page).toHaveURL(/\/kk\/catalog$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Бүгін қай жерде тиімдірек')
  await expect(page.getByTestId('snapshot-date').first()).toHaveText('24.09.2026 күнгі баға')
})

test('unknown product shows not found with a way to the catalog', async ({ page }) => {
  await page.goto('/ru/products/does-not-exist')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Такой страницы нет')
  await expect(page).toHaveTitle('Такой страницы нет — Adil Bağa')
  await page.getByRole('link', { name: 'Перейти в каталог' }).click()
  await expect(page).toHaveURL(/\/ru\/catalog$/)
  await expect(page.getByTestId('category-card').first()).toBeVisible()
})

test('search without results offers a way back', async ({ page }) => {
  await page.goto('/ru/search?q=абракадабра', { waitUntil: 'networkidle' })
  await expect(page.getByTestId('empty-state')).toContainText('По запросу «абракадабра» ничего не нашлось')
  await expect(page.getByTestId('sort-select')).toHaveCount(0)
  await expect(page.getByTestId('sort-chip')).toHaveCount(0)

  // Очистка поля убирает запрос и показывает подсказку
  await page.getByTestId('search-input').fill('')
  await expect(page).toHaveURL(/\/ru\/search$/)
  await expect(page.getByTestId('empty-state')).toContainText('Что ищем?')
})

test('skip link moves focus to the main content', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Tab-навигация — только на desktop')
  await page.goto('/ru/catalog', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Перейти к содержимому' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})
