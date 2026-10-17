// Public build-time IDs only. Shared by the browser and CSP configuration.
export function analyticsIds(ga?: string, metrika?: string) {
  return {
    ga: ga && ga.trim() === ga && /^G-[A-Z0-9]{6,20}$/.test(ga) ? ga : undefined,
    metrika: metrika && metrika.trim() === metrika && /^[1-9][0-9]{0,11}$/.test(metrika) ? Number(metrika) : undefined,
  }
}

/** Track only public application paths, never arbitrary URL input or query/hash. */
export function analyticsPage(site: string, origin: string, pathname: string): string | undefined {
  try {
    const canonical = new URL(site)
    if (canonical.protocol !== 'https:' || canonical.username || canonical.password || canonical.origin !== origin
      || canonical.hostname === 'localhost' || canonical.hostname.endsWith('.localhost') || canonical.hostname.endsWith('.vercel.app')) return
    if (!/^\/(ru|kk)\/(catalog|dashboard|search|products\/[A-Za-z0-9_-]{1,128}|collections\/[a-z0-9-]{1,64})\/?$/.test(pathname)
      || pathname.includes('\n')) return
    return canonical.origin + pathname
  } catch { return undefined }
}
/** Conservative public campaign vocabulary, never arbitrary query values. */
const CAMPAIGNS = {
  utm_source: ['google', 'yandex', 'instagram', 'telegram', 'facebook', 'whatsapp', 'qr', 'siri'],
  utm_medium: ['organic', 'cpc', 'social', 'referral', 'email', 'qr', 'offline'],
  utm_campaign: ['pilot', 'pilot_2026', 'launch', 'aktau_market'],
} as const

export function entryAttribution(url: string, referrer: string) {
  const entry = new URL(url)
  const campaign = new URLSearchParams()
  for (const [key, allowed] of Object.entries(CAMPAIGNS)) {
    const values = entry.searchParams.getAll(key)
    if (values.length === 1 && (allowed as readonly string[]).includes(values[0])) campaign.set(key, values[0])
  }
  let externalReferrer = ''
  try {
    const ref = new URL(referrer)
    // Strict public search/social origins; don't export arbitrary/private host names.
    if (ref.protocol === 'https:' && !ref.username && !ref.password && !ref.port &&
      ['www.google.com', 'www.google.kz', 'yandex.ru', 'yandex.kz', 'www.instagram.com', 't.me', 'www.facebook.com'].includes(ref.hostname) &&
      ref.origin !== entry.origin) externalReferrer = ref.origin + '/'
  } catch { /* Missing/untrusted referrer is not attributed. */ }
  return { campaign: campaign.toString(), referrer: externalReferrer }
}
