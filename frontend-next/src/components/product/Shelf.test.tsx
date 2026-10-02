import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductCardDto } from '../../api/types'
import { Shelf } from './Shelf'

const product = (id: string): ProductCardDto => ({
  id,
  name: `Товар ${id}`,
  brand: null,
  category: { slug: 'milk', name: 'Молоко' },
  imageUrl: null,
  attributes: {},
  minPrice: 500,
  offers: [
    { storeCode: 'DINA', storeName: 'Dina', price: 500, oldPrice: null },
    { storeCode: 'DANA', storeName: 'Dana', price: 600, oldPrice: null },
  ],
  snapshotAt: '2026-09-24T00:00:00.000Z',
})

const products = ['a', 'b', 'c', 'd'].map(product)

/** jsdom не считает раскладку — задаём размеры ряда сами и шлём scroll */
function layout(row: HTMLElement, { scrollLeft = 0, clientWidth = 400, scrollWidth = 1000 } = {}) {
  Object.defineProperties(row, {
    scrollLeft: { configurable: true, value: scrollLeft },
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
  })
  fireEvent.scroll(row)
}

afterEach(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollBy
})

describe('Shelf', () => {
  it('renders a titled section with compact cards', () => {
    render(<Shelf title="Самая большая разница в цене" products={products} />)
    const shelf = screen.getByTestId('shelf')
    expect(within(shelf).getByRole('heading', { level: 2 })).toHaveTextContent('Самая большая разница в цене')
    expect(shelf).toHaveAccessibleName('Самая большая разница в цене')
    expect(within(shelf).getAllByTestId('product-card')).toHaveLength(4)
    expect(within(shelf).queryByTestId('offer-list')).not.toBeInTheDocument()
  })

  it('hides the scroll buttons when everything fits', () => {
    render(<Shelf title="Полка" products={products} />)
    layout(screen.getByRole('list'), { clientWidth: 1000, scrollWidth: 1000 })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('scrolls by the visible width and disables the button at each edge', () => {
    const scrollBy = vi.fn()
    HTMLElement.prototype.scrollBy = scrollBy
    render(<Shelf title="Полка" products={products} />)
    const row = screen.getByRole('list')
    layout(row)

    const back = screen.getByRole('button', { name: 'Прокрутить назад' })
    const forward = screen.getByRole('button', { name: 'Прокрутить вперёд' })
    expect(back).toBeDisabled()
    expect(forward).toBeEnabled()
    expect(forward).toHaveAttribute('aria-controls', row.id)

    fireEvent.click(forward)
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 400 }))

    layout(row, { scrollLeft: 600 })
    expect(back).toBeEnabled()
    expect(forward).toBeDisabled()
    fireEvent.click(back)
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -400 }))
  })

  it('shows children instead of the row while there are no products', () => {
    render(
      <Shelf title="Полка">
        <p>Загрузка</p>
      </Shelf>,
    )
    expect(screen.getByText('Загрузка')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
