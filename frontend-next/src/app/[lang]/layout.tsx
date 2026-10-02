import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { Footer } from '../../components/layout/Footer'
import { SkipLink } from '../../components/layout/Main'
import { Providers } from '../../components/Providers'
import { getI18n, isLanguage, LANGUAGES } from '../../i18n'
import { SITE_URL } from '../../lib/site'
import '../globals.css'

// cover — чтобы env(safe-area-inset-*) работал: таб-бар над полоской «домой» iPhone
export const viewport: Viewport = { viewportFit: 'cover' }

export const generateStaticParams = () => LANGUAGES.map((lang) => ({ lang }))

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  const { t } = getI18n(lang)
  return {
    // Относительные URL в canonical, hreflang и Open Graph дополняются адресом сайта
    metadataBase: SITE_URL,
    // Страницы задают только своё название, бренд дописывает шаблон
    title: { default: t('brand.title'), template: `%s — ${t('brand.name')}` },
    description: t('brand.tagline'),
    // Картинку и тексты карточки X берёт из Open Graph страницы
    twitter: { card: 'summary_large_image' },
  }
}

// Корневой layout: язык — из префикса URL, на него завязаны <html lang>, i18n и все ссылки
export default async function RootLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params
  if (!isLanguage(lang)) notFound()

  return (
    <html lang={lang}>
      <body className="flex min-h-dvh flex-col">
        <Providers lang={lang}>
          <SkipLink />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
