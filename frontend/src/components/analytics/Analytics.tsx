'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { analyticsIds, analyticsPage } from '../../lib/analytics'
import { SITE_NAME } from '../../lib/brand'

type Command = (...args: unknown[]) => void
type Yandex = Command & { a?: IArguments[]; l?: number }
type Counter = { id: string | number; path: string }
declare global {
  interface Window {
    dataLayer?: IArguments[]
    gtag?: Command
    ym?: Yandex
    // Document lifetime state survives StrictMode and layout remounts. Paths only.
    __aktauPageviews?: { ga?: Counter; metrika?: Counter }
  }
}

function pageview(pathname: string, url: string, ids: ReturnType<typeof analyticsIds>) {
  const state = window.__aktauPageviews ??= {}
  if (ids.ga && (state.ga?.id !== ids.ga || state.ga.path !== pathname)) {
    try {
      window.dataLayer ??= []
      window.gtag ??= function () { window.dataLayer!.push(arguments) }
      const fields = { page_location: url, page_path: pathname, page_title: SITE_NAME,
        page_referrer: state.ga ? new URL(state.ga.path, url).href : new URL(url).origin + '/' }
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
      const referer = state.metrika ? new URL(state.metrika.path, url).href : new URL(url).origin + '/'
      state.metrika = { id: ids.metrika, path: pathname }
      window.ym(ids.metrika, 'hit', url, { referer, title: SITE_NAME })
    } catch { /* No logging, retries or dependency on a successful analytics hit. */ }
  }
}

export function Analytics() {
  const pathname = usePathname()
  const { ga, metrika } = analyticsIds(process.env.NEXT_PUBLIC_GA_ID, process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const url = analyticsPage(process.env.NEXT_PUBLIC_SITE_URL ?? '', window.location.origin, pathname)
    if (!url || (!ga && !metrika)) return
    // Queue init + first view before Script is allowed to insert a loader.
    pageview(pathname, url, { ga, metrika })
    setActive(true)
  }, [pathname, ga, metrika])

  if (!active) return null
  return <>
    {ga && <Script id="aktau-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />}
    {metrika && <Script id="aktau-metrika" src="https://mc.yandex.ru/metrika/tag.js" strategy="afterInteractive" />}
  </>
}
