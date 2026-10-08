import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  return render(<ProductCard product={p} />)
}

// Intl ставит неразрывные пробелы — сравниваем с обычными
const text = (el: Element) => el.textContent?.replace(/\s/g, ' ')

describe('ProductCard', () => {
  afterEach(() => vi.useRealTimers())

  it('warns about stale prices only when the snapshot is older than 36h', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-08T12:00:00Z') })
    const { unmount } = renderCard(product)
    expect(screen.getByTestId('price-stale')).toHaveTextContent('Цены могли измениться — обновляем данные')
    unmount()
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'))
    renderCard(product)
    expect(screen.queryByTestId('price-stale')).toBeNull()
  })

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
    expect(screen.getByRole('link', { name: product.name })).toHaveAttribute('href', '/ru/products/p1')
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

  it('shows a rounded-down discount badge for the best offer', () => {
    renderCard(product)
    // 570 при старой 660 — 13,6% → 13
    const badge = screen.getByText('−13%').parentElement!
    expect(badge).toHaveTextContent('Скидка 13%')
    expect(badge).toHaveClass('bg-accent')
  })

  it('has no discount badge without an old price', () => {
    renderCard({ ...product, offers: product.offers.map((o) => ({ ...o, oldPrice: null })) })
    expect(screen.queryByText(/^−\d+%$/)).not.toBeInTheDocument()
  })

  it('shows the three cheapest stores and sums up the rest', () => {
    renderCard({
      ...product,
      offers: [
        ...product.offers,
        { storeCode: 'DINA', storeName: 'Magnum', price: 700, oldPrice: null },
        { storeCode: 'DANA', storeName: 'Small', price: 900, oldPrice: null },
      ],
    })
    const rows = within(screen.getByTestId('offer-list')).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(text(screen.getByTestId('more-offers'))).toBe('ещё 2 сети · до 900 ₸')
  })

  it('has no "more offers" line with three stores or fewer', () => {
    renderCard(product)
    expect(screen.queryByTestId('more-offers')).not.toBeInTheDocument()
  })

  it('falls back to the placeholder when the image fails to load', async () => {
    renderCard({ ...product, imageUrl: 'https://example.invalid/broken.jpg' })
    fireEvent.error(screen.getByRole('img', { name: product.name }))
    expect(await screen.findByTestId('image-placeholder')).toBeInTheDocument()
  })
})
