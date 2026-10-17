'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { analyticsIds } from '../../lib/analytics'
import { ensureAnalytics } from '../../lib/analytics-browser'

export function Analytics() {
  const pathname = usePathname()
  const { ga, metrika } = analyticsIds(process.env.NEXT_PUBLIC_GA_ID, process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID)
  const [active, setActive] = useState(false)
  useEffect(() => {
    // Queue init + first view before Script is allowed to insert a loader.
    if (ensureAnalytics()) setActive(true)
  }, [pathname, ga, metrika])

  if (!active) return null
  return <>
    {ga && <Script id="aktau-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />}
    {metrika && <Script id="aktau-metrika" src="https://mc.yandex.ru/metrika/tag.js" strategy="afterInteractive" />}
  </>
}
