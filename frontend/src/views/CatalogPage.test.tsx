import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../test/render'
import { CatalogPage } from './CatalogPage'

describe('CatalogPage', () => {
  it('shows top price spreads as a grid of full cards', async () => {
    renderPage(<CatalogPage />, '/ru/catalog')
    const cards = await screen.findAllByTestId('product-card', {}, { timeout: 3000 })
    expect(cards).toHaveLength(8)
    const link = within(cards[0]).getByRole('link')
    expect(link).toHaveTextContent('Молоко Lactel безлактозное 1% 900 мл')
    expect(link.getAttribute('href')).toMatch(/^\/ru\/products\//)
    expect(screen.getByRole('heading', { level: 2, name: 'Самая большая разница в цене' })).toBeInTheDocument()
    expect(within(cards[0]).getByTestId('offer-list')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/реальном времени/i)
  })

  it('loads the next price spreads with "show more" and hides it at the end of the list', async () => {
    renderPage(<CatalogPage />, '/ru/catalog')
    await screen.findAllByTestId('product-card', {}, { timeout: 3000 })
    await userEvent.click(screen.getByTestId('load-more'))
    // В моках 10 товаров с разбросом: догружаются последние 2, прежние 8 не пропадают
    await expect.poll(() => screen.getAllByTestId('product-card')).toHaveLength(10)
    expect(screen.getAllByTestId('product-card')[9]).toHaveTextContent('Яйца куриные С0 10 шт')
    expect(screen.queryByTestId('load-more')).not.toBeInTheDocument()
  })

  it('shows skeletons shaped like the content while loading', async () => {
    renderPage(<CatalogPage />, '/ru/catalog')
    const loading = screen.getAllByTestId('loading-state')
    expect(loading).toHaveLength(2)
    // Для скринридера — текст, сами скелетоны скрыты
    expect(within(loading[0]).getByText('Загружаем…')).toHaveClass('sr-only')
    expect(within(loading[1]).getByText('Загружаем…')).toHaveClass('sr-only')
    expect(within(loading[1]).getAllByTestId('product-card-skeleton')).toHaveLength(8)
    await screen.findAllByTestId('product-card', {}, { timeout: 3000 })
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
  })

  it('lists categories as tiles with language-prefixed links', async () => {
    renderPage(<CatalogPage />, '/kk/catalog')
    const categories = await screen.findAllByTestId('category-card')
    expect(categories).toHaveLength(5)
    for (const c of categories) {
      expect(c.getAttribute('href')).toMatch(/^\/kk\/collections\/[\w-]+$/)
      // Иконка декоративная — имя ссылки только название категории
      expect(c.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Бүгін қай жерде тиімдірек')
  })
})
