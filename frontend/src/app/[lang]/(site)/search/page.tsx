import type { Metadata } from 'next'
import { toSearchParams } from '../../../../api/server'
import { getI18n, isLanguage } from '../../../../i18n'
import { SearchPage } from '../../../../views/SearchPage'

// Результаты поиска в индекс не нужны (бесконечное число URL): noindex, но ссылки на товары — follow.
// Страница динамическая: запрос из URL известен серверу — во вкладке «Поиск: «…»», а HTML сразу в нужном
// состоянии (подсказка или скелетон), без скачка вёрстки. Сами результаты грузит клиент
export async function generateMetadata({ params, searchParams }: PageProps<'/[lang]/search'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  const { t } = getI18n(lang)
  const q = (toSearchParams(await searchParams).get('q') ?? '').trim()
  return {
    title: q ? t('search.titleFor', { query: q }) : t('search.title'),
    robots: { index: false, follow: true },
  }
}

export default async function Page({ searchParams }: PageProps<'/[lang]/search'>) {
  // Чтение searchParams делает рендер динамическим — useSearchParams на сервере видит запрос
  await searchParams
  return <SearchPage />
}
