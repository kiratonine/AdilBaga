import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Footer } from '../../components/layout/Footer'
import { SkipLink } from '../../components/layout/Main'
import { Providers } from '../../components/Providers'
import { getI18n, isLanguage, LANGUAGES } from '../../i18n'
import '../globals.css'

export const generateStaticParams = () => LANGUAGES.map((lang) => ({ lang }))

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  const { t } = getI18n(lang)
  // Страницы задают только своё название, бренд дописывает шаблон
  return { title: { default: t('brand.title'), template: `%s — ${t('brand.name')}` } }
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
