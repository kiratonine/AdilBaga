import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Chip, chipClass } from './Chip'

describe('Chip', () => {
  it('is a toggle with aria-pressed when pressed is given', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <Chip pressed={false} onClick={onClick}>
        3,2%
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: '3,2%' })
    expect(chip).toHaveAttribute('type', 'button')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <Chip pressed onClick={onClick}>
        3,2%
      </Chip>,
    )
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip.className).toContain('bg-ink')
  })

  it('is a plain pill button without pressed', () => {
    render(<Chip testId="open-filters">Фильтры · 2</Chip>)
    const chip = screen.getByTestId('open-filters')
    expect(chip).not.toHaveAttribute('aria-pressed')
    expect(chip.className).toContain('rounded-full')
  })

  it('pressed and idle looks differ', () => {
    expect(chipClass(true)).toContain('text-card')
    expect(chipClass(false)).toContain('bg-card')
  })
})
