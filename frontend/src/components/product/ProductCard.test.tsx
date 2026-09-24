import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { ProductCardDto } from '../../api/types'
import { ProductCard } from './ProductCard'

const product: ProductCardDto = {
  id: 'p1',
  name: 'Молоко FoodMaster 3,2% 1 л',
  brand: 'FoodMaster',
  category: { slug: 'milk', name: 'Молоко' },
  imageUrl: null,
  attributes: { volumeMl: 1000 },
  minPrice: 570,
  // Порядок намеренно нарушен: карточка сортирует сама
  offers: [
    { storeCode: 'FIX_PRICE', storeName: 'Fix Price', price: 650, oldPrice: null },
    { storeCode: 'DINA', storeName: 'Dina', price: 570, oldPrice: 660 },
    { storeCode: 'DANA', storeName: 'Dana', price: 620, oldPrice: null },
  ],
  snapshotAt: '2026-09-24T00:00:00.000Z',
}

function renderCard(p: ProductCardDto) {
  const router = createMemoryRouter([{ path: '/', element: <ProductCard product={p} /> }])
  return render(<RouterProvider router={router} />)
}

// Intl ставит неразрывные пробелы — сравниваем с обычными
const text = (el: Element) => el.textContent?.replace(/\s/g, ' ')

describe('ProductCard', () => {
  it('shows min price, old price and offers sorted by price', () => {
    renderCard(product)
    const card = screen.getByTestId('product-card')
    expect(text(within(card).getByTestId('min-price'))).toBe('570 ₸')
    expect(card.querySelector('s')?.textContent?.replace(/\s/g, ' ')).toBe('660 ₸')

    const rows = within(screen.getByTestId('offer-list')).getAllByRole('listitem')
    expect(rows.map(text)).toEqual(['Dina, самая низкая цена570 ₸', 'Dana620 ₸', 'Fix Price650 ₸'])
    expect(rows[0]).toHaveAttribute('data-best', 'true')
    expect(rows[1]).not.toHaveAttribute('data-best')
  })

  it('shows saving against the most expensive store and snapshot date', () => {
    renderCard(product)
    const saving = screen.getByText(/дешевле, чем в Fix Price/)
    expect(saving).toHaveTextContent(/^На 80\s₸ дешевле, чем в Fix Price$/)
    // Выделена только сумма, фраза — обычным цветом
    expect(saving).not.toHaveClass('text-accent')
    expect(within(saving).getByText(/^80\s₸$/)).toHaveClass('text-accent')
    expect(screen.getByTestId('snapshot-date')).toHaveTextContent('Цена на 24.09.2026')
  })

  it('links to the product page', () => {
    renderCard(product)
    expect(screen.getByRole('link', { name: product.name })).toHaveAttribute('href', '/products/p1')
  })

  it('renders a placeholder without image and no saving for a single offer', () => {
    renderCard({ ...product, brand: null, offers: [product.offers[1]] })
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument()
    expect(screen.queryByText(/дешевле, чем/)).not.toBeInTheDocument()
    // Сравнивать не с чем — единственное предложение не выделяется как самое дешёвое
    const [row] = within(screen.getByTestId('offer-list')).getAllByRole('listitem')
    expect(row).not.toHaveAttribute('data-best')
    expect(text(row)).toBe('Dina570 ₸')
  })

  it('falls back to the placeholder when the image fails to load', async () => {
    renderCard({ ...product, imageUrl: 'https://example.invalid/broken.jpg' })
    fireEvent.error(screen.getByRole('img', { name: product.name }))
    expect(await screen.findByTestId('image-placeholder')).toBeInTheDocument()
  })
})
