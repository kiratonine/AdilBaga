import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProductImage } from './ProductImage'

describe('ProductImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the price-tag placeholder without an image', () => {
    render(<ProductImage src={null} alt="Молоко" />)
    expect(screen.getByTestId('image-placeholder')).toHaveAccessibleName('Молоко')
  })

  it('shows the category icon as the placeholder when given one', () => {
    render(<ProductImage src={null} alt="Молоко" icon="milk" />)
    const placeholder = screen.getByTestId('image-placeholder')
    expect(placeholder).toHaveAccessibleName('Молоко')
    expect(placeholder.querySelector('svg')).toHaveClass('text-muted')
  })

  it('switches to the placeholder when the image failed before hydration', () => {
    // Браузер уже попытался загрузить картинку из серверного HTML: complete, но ширины нет
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    render(<ProductImage src="https://example.invalid/broken.jpg" alt="Молоко" />)
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Молоко' })).toBe(screen.getByTestId('image-placeholder'))
  })

  it('keeps an image that is still loading', () => {
    render(<ProductImage src="https://example.com/milk.jpg" alt="Молоко" />)
    expect(screen.getByRole('img', { name: 'Молоко' }).tagName).toBe('IMG')
  })
})
