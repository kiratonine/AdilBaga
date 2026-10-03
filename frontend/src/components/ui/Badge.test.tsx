import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it.each([
    ['discount', 'bg-accent'],
    ['best', 'bg-accent-soft'],
    ['neutral', 'bg-surface'],
  ] as const)('%s tone uses %s', (tone, cls) => {
    render(<Badge tone={tone}>−8%</Badge>)
    const badge = screen.getByText('−8%')
    expect(badge.className.split(' ')).toContain(cls)
    expect(badge.className).toContain('rounded-full')
  })
})
