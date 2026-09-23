import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'

const MILK_ID = 'p0a1f000-0000-4000-8000-000000000001'

describe('ProductPage', () => {
  it('shows the product with offers sorted by price and the cheapest highlighted', async () => {
    renderApp(`/products/${MILK_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Молоко FoodMaster 3,2% 1 л' })).toBeInTheDocument()
    expect(screen.getByTestId('min-price')).toHaveTextContent('570')
    expect(screen.getByText(/дешевле, чем в Fix Price/)).toHaveTextContent(/^На 150\s₸ дешевле, чем в Fix Price$/)

    const offers = within(screen.getByTestId('offer-list')).getAllByRole('listitem')
    expect(offers.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Dina Market.*570/),
      expect.stringMatching(/^Dana Market.*дороже на 90.*660/),
      expect.stringMatching(/^Fix Price.*дороже на 150.*720/),
    ])
    expect(offers[0]).toHaveAttribute('data-best')
    expect(offers[1]).not.toHaveAttribute('data-best')
    expect(screen.getByTestId('snapshot-date')).toHaveTextContent('Цена на 24.09.2026')
  })

  it('labels attributes from the category filter schema', async () => {
    renderApp(`/products/${MILK_ID}`)
    const attributes = await screen.findByTestId('product-attributes')
    const rows = within(attributes)
      .getAllByRole('term')
      .map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`.replace(/\s/g, ' '))
    expect(rows).toEqual(['Объём: 1 л', 'Жирность: 3,2%', 'Без лактозы: Нет'])
  })

  it('links back to the category', async () => {
    renderApp(`/products/${MILK_ID}`)
    const crumbs = await screen.findByRole('navigation', { name: 'Навигация' })
    expect(within(crumbs).getByRole('link', { name: 'Молоко' })).toHaveAttribute('href', '/collections/milk')
  })

  it('shows not found for an unknown product', async () => {
    renderApp('/products/nope')
    expect(await screen.findByText('Такой страницы нет')).toBeInTheDocument()
  })
})
