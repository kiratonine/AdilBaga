import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'
import type { FilterSchemaDto } from '../../api/types'
import { getI18n } from '../../i18n'
import live from '../../test/fixtures/liveDairyFilters.json'
import { DynamicFilters } from './DynamicFilters'

// Снимок настоящей schema категории dairy с api.aktau.market (77 значений жирности, 228 брендов) —
// в моках таких длинных списков нет. Обновить: curl …/api/categories/dairy/filters > этот файл
const schema = live as FilterSchemaDto
const brands = schema.filters.find((f) => f.key === 'brand')!
const brandOptions = brands.type === 'multi-select' ? (brands.options ?? []).map(String) : []

const chipsOf = (key: string) =>
  within(screen.getByTestId(`filter-options-${key}`))
    .getAllByRole('button')
    .map((b) => b.textContent?.replace(/\s/g, ' '))

describe('DynamicFilters on the live dairy schema', () => {
  it('has the real-sized lists this test is about', () => {
    expect(brandOptions.length).toBeGreaterThan(200)
    expect(schema.filters.find((f) => f.key === 'fatPercent')).toMatchObject({ type: 'multi-select' })
  })

  it('every long filter gets a search field and a scroll box with all values', () => {
    render(<DynamicFilters filters={schema.filters} values={{}} onChange={() => {}} boxed />)
    for (const filter of schema.filters) {
      expect(screen.getByTestId(`filter-search-${filter.key}`)).toBeInTheDocument()
      const box = screen.getByTestId(`filter-options-${filter.key}`)
      expect(box).toHaveClass('max-h-64', 'overflow-y-auto')
      expect(within(box).getAllByRole('button')).toHaveLength(filter.type === 'multi-select' ? filter.options!.length : 0)
    }
  })

  it('finds fat values with either decimal separator', async () => {
    render(<DynamicFilters filters={schema.filters} values={{}} onChange={() => {}} />)
    await userEvent.type(screen.getByTestId('filter-search-fatPercent'), '3.2')
    expect(chipsOf('fatPercent')).toContain('3,2%')
    expect(chipsOf('fatPercent').every((text) => text?.includes('3,2'))).toBe(true)
  })

  it('finds every spelling of a brand regardless of case, and picks one', async () => {
    const onChange = vi.fn()
    render(<DynamicFilters filters={schema.filters} values={{}} onChange={onChange} />)
    await userEvent.type(screen.getByTestId('filter-search-brand'), '3 желания')
    const expected = brandOptions.filter((b) => b.toLocaleLowerCase('ru').includes('3 желания'))
    expect(expected.length).toBeGreaterThan(1)
    expect(chipsOf('brand')).toEqual(expected)

    await userEvent.click(screen.getByRole('button', { name: expected[0] }))
    expect(onChange).toHaveBeenLastCalledWith('brand', [expected[0]])
  })

  it('keeps a selected brand visible while searching for another one', async () => {
    const selected = brandOptions[brandOptions.length - 1]
    render(<DynamicFilters filters={schema.filters} values={{ brand: [selected] }} onChange={() => {}} />)
    await userEvent.type(screen.getByTestId('filter-search-brand'), 'actimel')
    const chips = chipsOf('brand')
    expect(chips).toContain(selected)
    expect(chips).toContain('Actimel')
    expect(screen.getByRole('button', { name: selected })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says nothing matched instead of showing an empty box', async () => {
    render(<DynamicFilters filters={schema.filters} values={{}} onChange={() => {}} />)
    await userEvent.type(screen.getByTestId('filter-search-brand'), 'zzzzzz')
    expect(within(screen.getByTestId('filter-options-brand')).queryAllByRole('button')).toHaveLength(0)
    expect(within(screen.getByTestId('filter-options-brand')).getByText('Ничего не нашлось')).toBeInTheDocument()
  })

  it('shows Kazakh labels and search placeholder on /kk', () => {
    render(
      <I18nextProvider i18n={getI18n('kk')}>
        <DynamicFilters filters={schema.filters} values={{}} onChange={() => {}} />
      </I18nextProvider>,
    )
    expect(within(screen.getByTestId('filter-fatPercent')).getByText('Майлылығы')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Іздеу: Майлылығы' })).toHaveAttribute('placeholder', 'Іздеу')
    expect(screen.queryByText('Жирность')).not.toBeInTheDocument()
  })
})
