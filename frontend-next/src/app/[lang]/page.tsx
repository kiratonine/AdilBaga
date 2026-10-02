import type { Metadata } from 'next'
import { Main } from '../../components/layout/Main'
import { getI18n, isLanguage } from '../../i18n'
import { pageMetadata } from '../../lib/seo'
import { LandingPage } from '../../views/LandingPage'

export async function generateMetadata({ params }: PageProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params
  return isLanguage(lang) ? pageMetadata({ lang, path: '/', description: getI18n(lang).t('meta.landing') }) : {}
}

// Лендинг — без шапки сайта (она в группе (site)), выбор языка — в самой странице. Тексты статичные, API не нужен
export default function Page() {
  return (
    <Main>
      <LandingPage />
    </Main>
  )
}
