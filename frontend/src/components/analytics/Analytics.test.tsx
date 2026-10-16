// @vitest-environment-options {"url":"https://aktau.market/ru/catalog"}
import { act, render } from '@testing-library/react'
import Script from 'next/script'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigation } from '../../test/navigation'
import { Analytics } from './Analytics'

// Never load a third-party library or send a hit. Test only the command queues.
vi.mock('next/script', () => ({ default: vi.fn(() => null) }))
const ga = () => (window.dataLayer ?? []).map(args => Array.from(args))
const ym = () => (window.ym?.a ?? []).map(args => Array.from(args))
const views = () => ga().filter(args => args[0] === 'event')
const hits = () => ym().filter(args => args[1] === 'hit')
const loaders = () => vi.mocked(Script).mock.calls.map(call => call[0])

describe('analytics initial/SPA pageviews without network', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://aktau.market')
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST123456')
    vi.stubEnv('NEXT_PUBLIC_YANDEX_METRIKA_ID', '12345678')
    delete window.dataLayer; delete window.gtag; delete window.ym; delete window.__aktauPageviews
    vi.clearAllMocks()
    navigation.setUrl('/ru/catalog?sessionId=private#private')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('queues one init and initial view per provider before loading, including StrictMode', () => {
    render(<StrictMode><Analytics /></StrictMode>)
    expect(views()).toHaveLength(1); expect(hits()).toHaveLength(1)
    expect(ga().filter(args => args[0] === 'config')).toHaveLength(1)
    expect(ga().find(args => args[0] === 'config')?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false })
    expect(ym().filter(args => args[1] === 'init')).toHaveLength(1)
    expect(ym()[0][2]).toEqual({ defer: true, webvisor: false, clickmap: false, trackLinks: false, trackHash: false, accurateTrackBounce: false, ecommerce: false, sendTitle: false })
    expect(views()[0][2]).toMatchObject({ page_location: 'https://aktau.market/ru/catalog', page_path: '/ru/catalog', page_title: 'Aktau Market', page_referrer: 'https://aktau.market/' })
    expect(hits()[0].slice(2)).toEqual(['https://aktau.market/ru/catalog', { referer: 'https://aktau.market/', title: 'Aktau Market' }])
    expect(loaders().every(p => p.strategy === 'afterInteractive')).toBe(true)
    expect(new Set(loaders().map(p => p.src))).toEqual(new Set(['https://www.googletagmanager.com/gtag/js?id=G-TEST123456', 'https://mc.yandex.ru/metrika/tag.js']))
    expect(JSON.stringify([...ga(), ...ym()])).not.toContain('private')
    expect(window.ym?.l).toBeTypeOf('number')
  })
  it('one view on each RU/KK pathname transition, including history traversal; no query/hash/re-render/remount duplicates', () => {
    const tree = render(<Analytics />)
    for (const url of ['/ru/dashboard', '/kk/catalog', '/ru/dashboard', '/kk/catalog']) act(() => navigation.setUrl(url))
    expect(views()).toHaveLength(5); expect(hits()).toHaveLength(5)
    act(() => navigation.setUrl('/kk/catalog?q=private#private'))
    tree.rerender(<Analytics />); tree.unmount(); render(<Analytics />)
    expect(views()).toHaveLength(5); expect(hits()).toHaveLength(5)
    expect(views().map(v => (v[2] as { page_path: string }).page_path)).toEqual(['/ru/catalog', '/ru/dashboard', '/kk/catalog', '/ru/dashboard', '/kk/catalog'])
    expect(ga().filter(args => args[0] === 'config')).toHaveLength(1)
    expect(ym().filter(args => args[1] === 'init')).toHaveLength(1)
    expect(JSON.stringify([...ga(), ...ym()])).not.toContain('private')
  })
  for (const [gaId, ymId, gaCount, ymCount] of [
    ['', '', 0, 0], ['G-TEST123456', '', 1, 0], ['', '12345678', 0, 1],
    ['<script>', 'invalid', 0, 0], ['G-TEST123456', 'invalid', 1, 0], ['invalid', '12345678', 0, 1],
  ] as const) it(`independent validated provider activation ${gaCount}/${ymCount}`, () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', gaId); vi.stubEnv('NEXT_PUBLIC_YANDEX_METRIKA_ID', ymId)
    render(<Analytics />)
    expect(views()).toHaveLength(gaCount); expect(hits()).toHaveLength(ymCount)
    expect(new Set(loaders().map(p => p.src)).size).toBe(gaCount + ymCount)
  })
  it('noncanonical origin never initializes or inserts scripts even with valid IDs', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://another.invalid')
    render(<Analytics />)
    expect(views()).toHaveLength(0); expect(hits()).toHaveLength(0); expect(loaders()).toHaveLength(0)
  })
  it('a blocked script leaves queues intact; a throwing provider cannot break navigation or the other tracker', () => {
    const fail = vi.fn(() => { throw Error('blocked') }); window.gtag = fail
    const tree = render(<Analytics />)
    expect(hits()).toHaveLength(1)
    act(() => navigation.setUrl('/ru/dashboard'))
    tree.rerender(<Analytics />)
    expect(hits()).toHaveLength(2)
    expect(fail).toHaveBeenCalled()
  })
})
