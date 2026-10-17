// @vitest-environment-options {"url":"https://aktau.market/ru/catalog"}
import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Analytics } from '../components/analytics/Analytics'
import { navigation } from '../test/navigation'
import { entryAttribution } from './analytics'
import { eventFields, searchEdited, trackProductEvent, useCategoryView, useProductView, useSearchResult } from './pilot-analytics'

const ga = () => (window.dataLayer ?? []).map(a => Array.from(a))
const ym = () => (window.ym?.a ?? []).map(a => Array.from(a))
const events = (name: string) => ga().filter(a => a[0] === 'event' && a[1] === name)

// JSON.stringify alone misses Set contents and non-enumerable/symbol properties.
function reachableStrings(value: unknown, visited = new WeakSet<object>()): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object' || visited.has(value)) return []
  visited.add(value)
  const nested = value instanceof Set ? [...value] : value instanceof Map ? [...value.entries()] : []
  return [...nested.flatMap(item => reachableStrings(item, visited)), ...Reflect.ownKeys(value).flatMap(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    return [String(key), ...('value' in descriptor ? reachableStrings(descriptor.value, visited) : [])]
  })]
}

function Views({ ready = true }: { ready?: boolean }) {
  useProductView('p-123', 'milk')
  useCategoryView('milk', ready)
  return <Analytics />
}
function Search({ query = 'private@example.com', count = 0, ready = true }) {
  useSearchResult(query, count, ready)
  return <Analytics />
}

describe('typed pilot adapter and confirmed-data settlement (no network)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://aktau.market')
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST123456')
    vi.stubEnv('NEXT_PUBLIC_YANDEX_METRIKA_ID', '12345678')
    delete window.__aktauPageviews; delete window.dataLayer; delete window.gtag; delete window.ym
    navigation.setUrl('/ru/catalog')
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it('initializes one pair of queues from child effects, StrictMode/remount/refetch do not duplicate views', () => {
    const tree = render(<StrictMode><Views /></StrictMode>)
    tree.rerender(<StrictMode><Views /></StrictMode>)
    tree.unmount(); render(<Views />)
    expect(events('page_view')).toHaveLength(1)
    expect(events('view_item')).toHaveLength(1)
    expect(events('category_view')).toHaveLength(1)
    expect(ga().filter(a => a[0] === 'config')).toHaveLength(1)
    expect(ym().filter(a => a[1] === 'init')).toHaveLength(1)
    expect(ym().filter(a => a[1] === 'reachGoal')).toHaveLength(2)
  })
  it('waits for category success, then one event even if data is refetched', () => {
    const tree = render(<Views ready={false} />)
    expect(events('category_view')).toHaveLength(0)
    tree.rerender(<Views ready />)
    tree.rerender(<Views ready={false} />)
    tree.rerender(<Views ready />)
    expect(events('category_view')).toHaveLength(1)
  })
  it('RU/KK and actual history transitions each count once; query-only updates do not', () => {
    render(<Views />)
    act(() => navigation.setUrl('/kk/catalog'))
    act(() => navigation.setUrl('/ru/catalog'))
    act(() => navigation.setUrl('/ru/catalog?q=private'))
    expect(events('page_view')).toHaveLength(3)
    expect(events('view_item')).toHaveLength(3)
    expect(events('category_view')).toHaveLength(3)
  })
  it('settles only successful current results; local query is never in payload; no refetch/sort duplicates', () => {
    vi.useFakeTimers()
    const tree = render(<Search ready={false} />)
    act(() => vi.advanceTimersByTime(1200))
    expect(events('search')).toHaveLength(0)
    tree.rerender(<Search ready />)
    act(() => vi.advanceTimersByTime(999))
    expect(events('search')).toHaveLength(0)
    act(() => vi.advanceTimersByTime(1))
    expect(events('search')).toHaveLength(1)
    expect(events('search_no_results')).toHaveLength(1)
    tree.rerender(<Search count={3} />)
    act(() => vi.advanceTimersByTime(1200))
    expect(events('search')).toHaveLength(1)
    expect(JSON.stringify([...ga(), ...ym()])).not.toMatch(/private|example\.com|search_term/)
  })
  it('typing cancels before URL debounce, and changed/placeholder/error results cancel pending search', () => {
    vi.useFakeTimers()
    const tree = render(<Search />)
    act(() => vi.advanceTimersByTime(900))
    act(() => searchEdited())
    act(() => vi.advanceTimersByTime(200))
    expect(events('search')).toHaveLength(0)
    tree.rerender(<Search query="milk" count={3} />)
    act(() => vi.advanceTimersByTime(900))
    tree.rerender(<Search query="milk" count={3} ready={false} />)
    act(() => vi.advanceTimersByTime(200))
    expect(events('search')).toHaveLength(0)
    tree.rerender(<Search query="milk" count={3} />)
    act(() => vi.advanceTimersByTime(1000))
    expect(events('search')).toHaveLength(1)
    expect(events('search_no_results')).toHaveLength(0)
  })
  it('Back/Forward restoring the same search is not a new search intent', () => {
    vi.useFakeTimers()
    navigation.setUrl('/ru/search?q=milk')
    const tree = render(<Search query="milk" count={3} />)
    act(() => vi.advanceTimersByTime(1000))
    expect(events('search')).toHaveLength(1)
    tree.unmount()
    act(() => navigation.setUrl('/ru/dashboard'))
    const other = render(<Analytics />)
    other.unmount()
    act(() => navigation.setUrl('/ru/search?q=milk'))
    render(<Search query="milk" count={3} />)
    act(() => vi.advanceTimersByTime(1000))
    expect(events('search')).toHaveLength(1)
    expect(events('page_view')).toHaveLength(3)
  })
  for (const [kind, query] of [['email', 'synthetic.private@example.invalid'], ['telephone', '+77010000000']])
    it(`keeps ${kind} search out of every exposed pageview-state property and both providers`, () => {
      vi.useFakeTimers()
      render(<StrictMode><Search query={query} /></StrictMode>)
      act(() => vi.advanceTimersByTime(1000))
      expect(events('search')).toHaveLength(1)
      expect(events('search_no_results')).toHaveLength(1)
      expect(reachableStrings([...ga(), ...ym()]).some(value => value.includes(query))).toBe(false)
      expect(reachableStrings(window.__aktauPageviews).some(value => value.includes(query))).toBe(false)
      expect(Reflect.ownKeys(window.__aktauPageviews!)).not.toContain('searches')
    })
  it('caps private search dedup at512 across remounts; a fresh document-local state starts clean', () => {
    const event = { name: 'search', length: 4, visibleCount: 3 } as const
    for (let index = 0; index < 513; index++) trackProductEvent(event, `search:synthetic-${index}`)
    expect(events('search')).toHaveLength(512)
    render(<Analytics />).unmount()
    render(<Analytics />)
    trackProductEvent(event, 'search:synthetic-0')
    trackProductEvent(event, 'search:synthetic-513')
    expect(events('search')).toHaveLength(512)
    delete window.__aktauPageviews
    trackProductEvent(event, 'search:synthetic-0')
    expect(events('search')).toHaveLength(513)
    expect(Reflect.ownKeys(window.__aktauPageviews!)).not.toContain('searches')
  })
  for (const [gaId, ymId, g, y] of [['', '', 0, 0], ['G-TEST123456', '', 1, 0], ['', '12345678', 0, 1]] as const)
    it(`independent providers ${g}/${y}`, () => {
      vi.stubEnv('NEXT_PUBLIC_GA_ID', gaId); vi.stubEnv('NEXT_PUBLIC_YANDEX_METRIKA_ID', ymId)
      trackProductEvent({ name: 'sort_change', sort: 'name_asc' })
      expect(events('sort_change')).toHaveLength(g)
      expect(ym().filter(a => a[1] === 'reachGoal')).toHaveLength(y)
    })
  it('projects only typed fields; rejects malformed identifiers and never transmits filter values', () => {
    expect(eventFields({ name: 'filter_apply', category: 'milk', filterKey: 'fatPercent' })).toEqual({ category_slug: 'milk', filter_key: 'fatPercent' })
    expect(eventFields({ name: 'view_item', productId: '../private', category: 'milk' })).toBeUndefined()
    expect(eventFields({ name: 'sort_change', sort: 'price_asc', category: 'milk?private' })).toBeUndefined()
    expect(eventFields({ name: 'search', length: 8, visibleCount: 50 })).toEqual({ query_class: 'redacted', length_bucket: '4-10', visible_count: 24, has_results: true })
    expect(eventFields({ name: 'search', length: NaN, visibleCount: 0 })).toBeUndefined()
  })
  it('provider failure is isolated and offers only once per visit', () => {
    window.gtag = () => { throw Error('blocked') }
    for (let n = 0; n < 2; n++) trackProductEvent({ name: 'offers_expand', productId: 'p-1', category: 'milk' }, 'offers:p-1')
    expect(ym().filter(a => a[1] === 'reachGoal')).toHaveLength(1)
  })
  it('attribution applies only to entry pageviews, not SPA URLs or events; real external origin only', () => {
    navigation.setUrl('/ru/catalog?utm_source=telegram&utm_medium=social&utm_campaign=pilot&q=private#private')
    render(<Analytics />)
    expect(events('page_view')[0][2]).toMatchObject({ page_location: 'https://aktau.market/ru/catalog?utm_source=telegram&utm_medium=social&utm_campaign=pilot' })
    act(() => navigation.setUrl('/kk/dashboard?utm_source=google&q=private'))
    trackProductEvent({ name: 'sort_change', sort: 'price_desc' })
    expect(events('page_view')[1][2]).toMatchObject({ page_location: 'https://aktau.market/kk/dashboard' })
    expect(events('sort_change')[0][2]).toMatchObject({ page_location: 'https://aktau.market/kk/dashboard' })
    expect(JSON.stringify([...ga(), ...ym()])).not.toContain('private')
  })
})

describe('entry attribution fail closed allowlists', () => {
  it('retains approved campaign and strips external referrer path/query', () => {
    expect(entryAttribution('https://aktau.market/ru/catalog?utm_source=google&utm_medium=cpc&utm_campaign=pilot&q=private', 'https://www.google.com/search?q=private'))
      .toEqual({ campaign: 'utm_source=google&utm_medium=cpc&utm_campaign=pilot', referrer: 'https://www.google.com/' })
  })
  for (const value of ['private@example.com', '77011234567', 'https://private.invalid', '51.2,47.1', 'sessionId123', 'pilot&private', 'a'.repeat(100)])
    it('drops unapproved campaign token', () => expect(entryAttribution(`https://aktau.market/ru/catalog?utm_campaign=${encodeURIComponent(value)}`, '').campaign).toBe(''))
  for (const ref of ['http://www.google.com/', 'https://user:pass@www.google.com/', 'https://127.0.0.1/', 'https://private.invalid/', 'https://aktau.market/ru/search?q=private', 'invalid'])
    it('drops unsafe/internal referrer', () => expect(entryAttribution('https://aktau.market/ru/catalog', ref).referrer).toBe(''))
  it('drops duplicate UTM parameters rather than picking ambiguous attribution', () => {
    expect(entryAttribution('https://aktau.market/ru/catalog?utm_source=google&utm_source=yandex', '').campaign).toBe('')
  })
})
