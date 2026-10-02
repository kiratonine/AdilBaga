import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../test/render'
import { CatalogPage } from './CatalogPage'

describe('CatalogPage', () => {
  it('shows top price spreads on a shelf of compact cards', async () => {
    renderPage(<CatalogPage />, '/ru/catalog')
    const cards = await screen.findAllByTestId('product-card', {}, { timeout: 3000 })
    expect(cards).toHaveLength(8)
    const link = within(cards[0]).getByRole('link')
    expect(link).toHaveTextContent('Молоко Lactel безлактозное 1% 900 мл')
    expect(link.getAttribute('href')).toMatch(/^\/ru\/products\//)
    expect(within(screen.getByTestId('shelf')).getAllByTestId('product-card')).toHaveLength(8)
    expect(screen.getByRole('heading', { level: 2, name: 'Самая большая разница в цене' })).toBeInTheDocument()
    // Компактная карточка — без списка сетей и даты
    expect(within(cards[0]).queryByTestId('offer-list')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/реальном времени/i)
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

  it('lists categories from the API with language-prefixed links', async () => {
    renderPage(<CatalogPage />, '/kk/catalog')
    const categories = await screen.findAllByTestId('category-card')
    expect(categories).toHaveLength(5)
    for (const c of categories) expect(c.getAttribute('href')).toMatch(/^\/kk\/collections\/[\w-]+$/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Бүгін қай жерде тиімдірек')
  })
})
