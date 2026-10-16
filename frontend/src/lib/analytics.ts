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
