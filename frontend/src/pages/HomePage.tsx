import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useCategories } from '../api/queries'
import { ErrorState, LoadingState } from '../components/ui/States'

// Каркас главной. Карточки товаров и «самая большая экономия» — сессия 2.
export function HomePage() {
  const { t } = useTranslation()
  const categories = useCategories()

  return (
    <>
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em] md:text-[34px]">{t('home.title')}</h1>
      <section aria-labelledby="categories-title" className="mt-8">
        <h2 id="categories-title" className="text-lg font-semibold">
          {t('home.categories')}
        </h2>
        {categories.isPending && <LoadingState />}
        {categories.isError && <ErrorState onRetry={() => categories.refetch()} />}
        {categories.data && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.data.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/collections/${c.slug}`}
                  data-testid="category-card"
                  className="flex h-11 items-center rounded-full border border-line px-4 font-medium hover:border-ink"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
