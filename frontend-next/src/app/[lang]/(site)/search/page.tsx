import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getI18n, isLanguage } from '../../../../i18n'
import { SearchPage, SearchPageFallback } from '../../../../views/SearchPage'

// Результаты поиска в индекс не нужны (бесконечное число URL), страница — статичная оболочка.
// Запрос сервер не видит, поэтому во вкладке просто «Поиск»
export async function generateMetadata({ params }: PageProps<'/[lang]/search'>): Promise<Metadata> {
  const { lang } = await params
  return {
    title: isLanguage(lang) ? getI18n(lang).t('search.title') : undefined,
    robots: { index: false, follow: true },
  }
}

// Запрос читается из URL на клиенте (useSearchParams), поэтому в HTML — только оболочка со скелетоном
export default function Page() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPage />
    </Suspense>
  )
}
