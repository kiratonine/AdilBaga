import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'

describe('Icon', () => {
  it('is decorative by default', () => {
    const { container } = render(<Icon name="search" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg.querySelector('path, circle, rect')).not.toBeNull()
  })

  it('is an image with a name when labelled', () => {
    render(<Icon name="close" label="Закрыть" size={20} />)
    const svg = screen.getByRole('img', { name: 'Закрыть' })
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(svg).toHaveAttribute('width', '20')
  })
})
