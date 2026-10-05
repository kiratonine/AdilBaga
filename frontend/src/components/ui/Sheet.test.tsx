import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Фильтры
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Фильтры" testId="filters-sheet" footer={<button type="button">Показать</button>}>
        <p>Тело шторки</p>
      </Sheet>
    </>
  )
}

const sheet = () => screen.getByTestId('filters-sheet') as HTMLDialogElement

describe('Sheet', () => {
  it('opens as a labelled dialog with body and footer', () => {
    render(<Harness />)
    expect(sheet().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    expect(sheet().open).toBe(true)
    expect(sheet()).toHaveAccessibleName('Фильтры')
    expect(screen.getByText('Тело шторки')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Показать' })).toBeInTheDocument()
  })

  it('closes with the close button', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(sheet().open).toBe(false)
  })

  it('syncs parent state when the browser closes it (Esc) and can reopen', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    // Esc: браузер сам закрывает dialog и шлёт close
    act(() => sheet().close())
    expect(sheet().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры', hidden: true }))
    expect(sheet().open).toBe(true)
  })

  it('closes on backdrop click but not on content click', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    fireEvent.click(screen.getByText('Тело шторки'))
    expect(sheet().open).toBe(true)
    // Клик по затемнению приходит на сам <dialog>
    fireEvent.click(sheet())
    expect(sheet().open).toBe(false)
  })

  it('calls onClose exactly once for close button and backdrop', () => {
    const onClose = vi.fn()
    function Counted() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Фильтры
          </button>
          <Sheet
            open={open}
            onClose={() => {
              onClose()
              setOpen(false)
            }}
            title="Фильтры"
            testId="filters-sheet"
          >
            <p>Тело шторки</p>
          </Sheet>
        </>
      )
    }
    render(<Counted />)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sheet().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры', hidden: true }))
    expect(sheet().open).toBe(true)
    act(() => {
      fireEvent.click(sheet())
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(sheet().open).toBe(false)
  })
})
