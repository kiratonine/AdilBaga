import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FilterDto } from '../../api/types'
import { DynamicFilters } from './DynamicFilters'

const filters: FilterDto[] = [
  { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 1000] },
  { key: 'breadType', label: 'Вид', type: 'multi-select', options: ['Ржаной'] },
  { key: 'lactoseFree', label: 'Без лактозы', type: 'boolean' },
]

describe('DynamicFilters', () => {
  it('renders every filter from the schema with formatted options', () => {
    render(<DynamicFilters filters={filters} values={{}} onChange={() => {}} />)
    const volume = screen.getByTestId('filter-volumeMl')
    expect(within(volume).getByText('Объём')).toBeInTheDocument()
    expect(within(volume).getAllByRole('button').map((b) => b.textContent?.replace(/\s/g, ' '))).toEqual([
      '500 мл',
      '1 л',
    ])
    expect(within(screen.getByTestId('filter-breadType')).getByRole('button', { name: 'Ржаной' })).toBeInTheDocument()
    expect(
      within(screen.getByTestId('filter-lactoseFree')).getByRole('button', { name: 'Без лактозы' }),
    ).toBeInTheDocument()
  })

  it('adds and removes multi-select values', async () => {
    const onChange = vi.fn()
    render(<DynamicFilters filters={filters} values={{ volumeMl: ['500'] }} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /^500/ })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: /^1\sл/ }))
    expect(onChange).toHaveBeenLastCalledWith('volumeMl', ['500', '1000'])

    await userEvent.click(screen.getByRole('button', { name: /^500/ }))
    expect(onChange).toHaveBeenLastCalledWith('volumeMl', [])
  })

  it('toggles boolean filter as key=true', async () => {
    const onChange = vi.fn()
    render(<DynamicFilters filters={filters} values={{}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Без лактозы' }))
    expect(onChange).toHaveBeenLastCalledWith('lactoseFree', ['true'])
  })
})
