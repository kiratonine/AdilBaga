import { describe, expect, it } from 'vitest'
import { getI18n, LANGUAGES } from '../i18n'
import ru from '../i18n/ru.json'
import kk from '../i18n/kk.json'
import { SITE_NAME } from './brand'
import { pageMetadata } from './seo'
import { siteJsonLd } from './structuredData'

describe('public brand', () => {
  it('is a public constant with matching RU/KK dictionaries', () => {
    expect(SITE_NAME).toBe('Aktau Market')
    expect(ru.brand.name).toBe(SITE_NAME)
    expect(kk.brand.name).toBe(SITE_NAME)
  })

  for (const lang of LANGUAGES) {
    it(`uses the same name for ${lang} i18n, metadata and site JSON-LD`, () => {
      const { t } = getI18n(lang)
      expect(t('brand.name')).toBe(SITE_NAME)
      expect(t('brand.title')).toContain(`${SITE_NAME} — `)
      expect(t('brand.title')).not.toContain('{{')
      const meta = pageMetadata({ lang, path: '/catalog', description: t('brand.tagline') })
      expect(meta.openGraph).toMatchObject({ siteName: SITE_NAME, title: t('brand.title') })
      const graph = siteJsonLd(lang, { description: t('brand.tagline') })['@graph']
      expect(graph.map(node => node.name)).toEqual([SITE_NAME, SITE_NAME])
      for (const node of graph) {
        expect(node).not.toHaveProperty('legalName')
        expect(node).not.toHaveProperty('contactPoint')
        expect(node).not.toHaveProperty('email')
      }
      expect(JSON.stringify({ meta, graph })).not.toMatch(/Adil Bağa|Әділ баға/)
    })
  }
})
