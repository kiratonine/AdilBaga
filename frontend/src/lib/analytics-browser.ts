import { analyticsIds, analyticsPage, entryAttribution } from './analytics'
import { SITE_NAME } from './brand'

type Command = (...args: unknown[]) => void
type Yandex = Command & { a?: IArguments[]; l?: number }
type Counter = { id: string | number; path: string }
declare global {
  interface Window {
    dataLayer?: IArguments[]
    gtag?: Command
    ym?: Yandex
    // Document-local state only. Search dedup keys are never provider payloads.
    __aktauPageviews?: { ga?: Counter; metrika?: Counter; entry?: ReturnType<typeof entryAttribution>; path?: string; visit?: number; events?: Set<string> }
  }
}

function pageview(pathname: string, url: string, ids: ReturnType<typeof analyticsIds>) {
  const state = window.__aktauPageviews ??= {}
  state.entry ??= entryAttribution(window.location.href, document.referrer)
  if (state.path !== pathname) {
    state.path = pathname
    state.visit = (state.visit ?? 0) + 1
    state.events = new Set()
  }
  if (ids.ga && (state.ga?.id !== ids.ga || state.ga.path !== pathname)) {
    try {
      window.dataLayer ??= []
      window.gtag ??= function () { window.dataLayer!.push(arguments) }
      const fields = { page_location: !state.ga && state.entry.campaign ? `${url}?${state.entry.campaign}` : url, page_path: pathname, page_title: SITE_NAME,
        page_referrer: state.ga ? new URL(state.ga.path, url).href : state.entry.referrer }
      if (state.ga?.id !== ids.ga) {
        window.gtag('js', new Date())
        window.gtag('config', ids.ga, { ...fields, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false })
      }
      state.ga = { id: ids.ga, path: pathname }
      window.gtag('set', fields)
      window.gtag('event', 'page_view', { ...fields, send_to: ids.ga })
    } catch { /* Blocked third-party code must not break page rendering/navigation. */ }
  }
  if (ids.metrika && (state.metrika?.id !== ids.metrika || state.metrika.path !== pathname)) {
    try {
      window.ym ??= function () { (window.ym!.a ??= []).push(arguments) }
      window.ym.l ??= Date.now()
      if (state.metrika?.id !== ids.metrika) window.ym(ids.metrika, 'init', {
        defer: true, webvisor: false, clickmap: false, trackLinks: false, trackHash: false,
        accurateTrackBounce: false, ecommerce: false, sendTitle: false,
      })
      const referer = state.metrika ? new URL(state.metrika.path, url).href : state.entry.referrer
      const location = !state.metrika && state.entry.campaign ? `${url}?${state.entry.campaign}` : url
      state.metrika = { id: ids.metrika, path: pathname }
      window.ym(ids.metrika, 'hit', location, { referer, title: SITE_NAME })
    } catch { /* No logging, retries or dependency on a successful analytics hit. */ }
  }
}

// Shared queue initialization also covers child effects before the layout effect.
// This does not insert scripts or create a second tracker initialization path.
export function ensureAnalytics() {
  if (typeof window === 'undefined') return
  const pathname = window.location.pathname
  const url = analyticsPage(process.env.NEXT_PUBLIC_SITE_URL ?? '', window.location.origin, pathname)
  const ids = analyticsIds(process.env.NEXT_PUBLIC_GA_ID, process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID)
  if (!url || (!ids.ga && !ids.metrika)) return
  pageview(pathname, url, ids)
  return { ids, pathname, url, state: window.__aktauPageviews! }
}
