'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { SortValue } from '../api/types'
import { ensureAnalytics } from './analytics-browser'

type Event =
  | { name: 'view_item' | 'offers_expand'; productId: string; category: string }
  | { name: 'category_view' | 'filter_reset'; category: string }
  | { name: 'filter_apply'; category: string; filterKey: string }
  | { name: 'sort_change'; sort: SortValue; category?: string }
  | { name: 'search' | 'search_no_results'; length: number; visibleCount: number }

const slug = (value: string) => /^[a-z0-9-]{1,64}$/.test(value)
const id = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value)

// Raw query keys never belong on window. The document-local state is only the
// weak identity: remounts reuse it, new documents/states get independent sets,
// and this module does not keep an abandoned state alive.
const searchDedup = new WeakMap<object, Set<string>>()

/** Reconstruct a fixed payload: no arbitrary caller fields/strings are forwarded. */
export function eventFields(event: Event): Record<string, unknown> | undefined {
  switch (event.name) {
    case 'view_item': case 'offers_expand':
      if (!id(event.productId) || !slug(event.category)) return
      return { items: [{ item_id: event.productId, item_category: event.category }] }
    case 'category_view': case 'filter_reset':
      if (!slug(event.category)) return
      return { category_slug: event.category }
    case 'filter_apply':
      if (!slug(event.category) || !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(event.filterKey)) return
      return { category_slug: event.category, filter_key: event.filterKey }
    case 'sort_change':
      if (!['price_asc', 'price_desc', 'name_asc'].includes(event.sort) || event.category && !slug(event.category)) return
      return { sort_type: event.sort, ...(event.category ? { category_slug: event.category } : {}) }
    case 'search': case 'search_no_results':
      if (!Number.isSafeInteger(event.length) || event.length < 1 || !Number.isSafeInteger(event.visibleCount) || event.visibleCount < 0) return
      return { query_class: 'redacted', length_bucket: event.length <= 3 ? '1-3' : event.length <= 10 ? '4-10' : '11+',
        visible_count: Math.min(event.visibleCount, 24), has_results: event.visibleCount > 0 }
  }
}

/** Only explicit UI handlers or confirmed-data effects call this adapter. */
export function trackProductEvent(event: Event, onceKey?: string) {
  const fields = eventFields(event)
  if (!fields) return
  const context = ensureAnalytics()
  if (!context) return
  const { state, ids, pathname, url } = context
  // Search history restoration is not a new search intent. Keep its bounded
  // dedup across pathname visits, while real product/category revisits count once.
  const search = event.name === 'search' || event.name === 'search_no_results'
  let seen: Set<string>
  if (search) {
    seen = searchDedup.get(state) ?? new Set<string>()
    searchDedup.set(state, seen)
  } else seen = state.events ??= new Set<string>()
  if (search && onceKey) onceKey = `${pathname}:${onceKey}`
  if (onceKey && (seen.has(onceKey) || seen.size >= 512)) return
  if (onceKey) seen.add(onceKey)
  const payload = { ...fields, language: pathname.split('/')[1] }
  // Reset location after an attributed entry view; never propagate UTM or q to events.
  try { if (ids.ga) window.gtag?.('event', event.name, { ...payload, send_to: ids.ga,
    page_location: url, page_path: pathname, page_referrer: '' }) } catch { /* Analytics is non-critical. */ }
  try { if (ids.metrika) window.ym?.(ids.metrika, 'reachGoal', event.name, payload) } catch { /* No retry/logging. */ }
}

export function useProductView(productId: string, category: string) {
  const pathname = usePathname()
  useEffect(() => { trackProductEvent({ name: 'view_item', productId, category }, `item:${productId}`) }, [productId, category, pathname])
}

export function useCategoryView(category: string, successful: boolean) {
  const pathname = usePathname()
  useEffect(() => {
    if (successful) trackProductEvent({ name: 'category_view', category }, `category:${category}`)
  }, [category, successful, pathname])
}

// An input edit cancels settlement immediately, before the existing URL debounce.
const SEARCH_EDIT = 'aktau:search-edit'
export const searchEdited = () => window.dispatchEvent(new Event(SEARCH_EDIT))
export const SEARCH_SETTLE_MS = 1000

export function useSearchResult(query: string, visibleCount: number, ready: boolean) {
  useEffect(() => {
    if (!query || !ready) return
    const visit = ensureAnalytics()?.state.visit
    if (visit === undefined) return
    const timer = setTimeout(() => {
      if (window.__aktauPageviews?.visit !== visit) return
      // Raw query is local dedup state only, never put in a provider payload.
      trackProductEvent({ name: 'search', length: query.length, visibleCount }, `search:${query}`)
      if (visibleCount === 0) trackProductEvent({ name: 'search_no_results', length: query.length, visibleCount }, `empty:${query}`)
    }, SEARCH_SETTLE_MS)
    const cancel = () => clearTimeout(timer)
    window.addEventListener(SEARCH_EDIT, cancel)
    return () => { cancel(); window.removeEventListener(SEARCH_EDIT, cancel) }
  }, [query, visibleCount, ready])
}
