import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button, buttonClass } from './Button'

describe('Button', () => {
  it('renders a non-submitting button that calls onClick', () => {
    const onClick = vi.fn()
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick} testId="b">
          Повторить
        </Button>
      </form>,
    )
    const button = screen.getByRole('button', { name: 'Повторить' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('data-testid', 'b')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('respects disabled', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Ещё
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Ещё' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders a link when href is given', () => {
    render(
      <Button href="/ru/catalog" variant="primary">
        Открыть каталог
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Открыть каталог' })
    expect(link).toHaveAttribute('href', '/ru/catalog')
    expect(link.className).toContain('bg-ink')
  })

  it('maps variants to classes; secondary is the default', () => {
    expect(buttonClass('primary')).toContain('bg-ink')
    expect(buttonClass('primary')).toContain('text-card')
    expect(buttonClass()).toBe(buttonClass('secondary'))
    expect(buttonClass('secondary')).toContain('bg-card')
    expect(buttonClass('ghost')).not.toContain('bg-card')
    expect(buttonClass('ghost', 'w-full')).toContain('w-full')
  })

  it('icon size is a round 44px button without horizontal padding', () => {
    const cls = buttonClass('ghost', '', 'icon')
    expect(cls).toContain('size-11')
    expect(cls).toContain('rounded-full')
    expect(cls).toContain('p-0')
    expect(cls).not.toContain('px-[18px]')
    expect(buttonClass('ghost')).toContain('h-11')
    expect(buttonClass('ghost')).toContain('px-[18px]')
  })

  it('renders an icon button with an accessible name', () => {
    render(
      <Button size="icon" variant="ghost" aria-label="Вперёд">
        ›
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Вперёд' })
    expect(button.className).toContain('size-11')
  })

  it('hover styles are not applied while disabled', () => {
    expect(buttonClass('primary')).toContain('not-disabled:hover:bg-ink/85')
    expect(buttonClass('primary')).not.toMatch(/(^|\s)hover:/)
  })
})
