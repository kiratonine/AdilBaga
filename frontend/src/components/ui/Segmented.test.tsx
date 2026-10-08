import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Segmented, segmentClass } from './Segmented'

describe('Segmented', () => {
  it('is a labelled group', () => {
    render(
      <Segmented label="Язык интерфейса">
        <a href="/ru" className={segmentClass(true)}>
          Рус
        </a>
        <a href="/kk" className={segmentClass(false)}>
          Қаз
        </a>
      </Segmented>,
    )
    const group = screen.getByRole('group', { name: 'Язык интерфейса' })
    expect(group.className).toContain('rounded-full')
    expect(screen.getByRole('link', { name: 'Рус' }).className).toContain('bg-card')
    expect(screen.getByRole('link', { name: 'Қаз' }).className).toContain('text-muted')
    // Дорожка 44px на мобильном: сегмент 40px + отступы по 2px
    expect(segmentClass(false).split(' ')).toEqual(expect.arrayContaining(['h-10', 'md:h-9']))
  })
})
