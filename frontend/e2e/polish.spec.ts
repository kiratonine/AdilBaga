import { expect, test } from '@playwright/test'

test('language switch to Kazakh is applied and remembered', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveTitle('Аналитика цен — Adil Bağa')

  await page.getByRole('button', { name: 'Қаз' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Баға талдауы')
  await expect(page).toHaveTitle('Баға талдауы — Adil Bağa')
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')

  // После перезагрузки язык сохраняется
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Бүгін қай жерде тиімдірек')
  await expect(page.getByTestId('snapshot-date').first()).toHaveText('24.09.2026 күнгі баға')
})

test('unknown product shows not found', async ({ page }) => {
  await page.goto('/products/does-not-exist')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Такой страницы нет')
  await expect(page).toHaveTitle('Такой страницы нет — Adil Bağa')
  await page.getByRole('link', { name: 'Перейти в каталог' }).click()
  await expect(page.getByTestId('category-card').first()).toBeVisible()
})

test('search without results offers a way back', async ({ page }) => {
  await page.goto('/search?q=абракадабра')
  await expect(page.getByTestId('empty-state')).toContainText('По запросу «абракадабра» ничего не нашлось')
  await expect(page.getByTestId('sort-select')).toHaveCount(0)

  // Очистка поля убирает запрос и показывает подсказку
  await page.getByTestId('search-input').fill('')
  await expect(page).toHaveURL(/\/search$/)
  await expect(page.getByTestId('empty-state')).toContainText('Что ищем?')
})

test('skip link moves focus to the main content', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Tab-навигация — только на desktop')
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Перейти к содержимому' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})
