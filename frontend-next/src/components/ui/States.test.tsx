import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState, ErrorState } from './States'

describe('ErrorState', () => {
  it('is a card with an icon, the message and a secondary retry button', async () => {
    const retry = vi.fn()
    render(<ErrorState onRetry={retry} />)
    const state = screen.getByTestId('error-state')
    expect(state).toHaveAttribute('role', 'alert')
    expect(state).toHaveClass('bg-card')
    expect(state.querySelector('svg[aria-hidden]')).not.toBeNull()
    const button = within(state).getByRole('button', { name: 'Повторить' })
    expect(button).toHaveClass('bg-card')
    await userEvent.click(button)
    expect(retry).toHaveBeenCalledOnce()
  })

  it('has no button without a retry handler', () => {
    render(<ErrorState />)
    expect(within(screen.getByTestId('error-state')).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('shows the title, hint, action and a decorative icon in a card', () => {
    render(<EmptyState title="Пусто" hint="Подсказка" action={<button type="button">Сбросить</button>} />)
    const state = screen.getByTestId('empty-state')
    expect(state).toHaveClass('bg-card')
    expect(state).toHaveTextContent('ПустоПодсказкаСбросить')
    expect(state.querySelector('svg[aria-hidden]')).not.toBeNull()
  })
})
