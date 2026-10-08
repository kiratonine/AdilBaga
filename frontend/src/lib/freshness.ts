import { useEffect, useState } from 'react'

/** Порог устаревания совпадает с SYNC_MAX_SOURCE_AGE_HOURS в pipeline */
export const STALE_AFTER_HOURS = 36

export function isPriceStale(snapshotAt: string, now: Date = new Date()): boolean {
  const at = Date.parse(snapshotAt)
  if (Number.isNaN(at)) return false
  const age = now.getTime() - at
  return age > 0 && age > STALE_AFTER_HOURS * 3_600_000
}

/**
 * Страница кэшируется (revalidate), поэтому «устарело» нельзя считать при рендере:
 * серверный HTML и клиент разошлись бы. На сервере и при первом клиентском рендере — false.
 */
export function usePriceStale(snapshotAt: string): boolean {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    setStale(isPriceStale(snapshotAt))
  }, [snapshotAt])
  return stale
}
