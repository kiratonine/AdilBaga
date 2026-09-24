import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { useCategories, useCategoryFilters, useProductPages } from '../api/queries'
import { ApiError } from '../api/types'
import { DynamicFilters } from '../components/catalog/DynamicFilters'
import { SortSelect } from '../components/catalog/SortSelect'
import { ProductGrid } from '../components/product/ProductGrid'
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { countActive, readFilters, readSort, withFilter, withoutFilters, withSort } from '../lib/filterParams'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NotFoundPage } from './NotFoundPage'

export function CategoryPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)

  const categories = useCategories()
  const schema = useCategoryFilters(slug)
  const filters = schema.data?.filters ?? []
  const values = readFilters(params, filters)
  const sort = readSort(params)
  const activeCount = countActive(values)

  // Ждём schema: без неё не понять, какие параметры URL — фильтры
  const products = useProductPages({ category: slug, filters: values, sort }, { enabled: schema.isSuccess })

  const update = (next: URLSearchParams) => setParams(next, { replace: true, preventScrollReset: true })
  const resetFilters = () => update(withoutFilters(params, filters))

  const category = categories.data?.find((c) => c.slug === slug)
  const notFound = schema.error instanceof ApiError && schema.error.status === 404
  // Заголовок ставим здесь и для 404: эффект родителя срабатывает после эффекта NotFoundPage
  useDocumentTitle(notFound ? t('state.notFound') : category?.name)

  if (notFound) return <NotFoundPage />
  const items = products.data?.pages.flat() ?? []
  const hasFilters = filters.length > 0

  return (
    <>
      <nav aria-label={t('category.breadcrumbs')} className="text-sm text-muted">
        <Link to="/" className="hover:text-ink">
          {t('nav.home')}
        </Link>
      </nav>
      <h1 className="mt-1 min-h-[1.2em] text-[28px] leading-tight font-semibold tracking-[-0.01em] md:text-[34px]">
        {category?.name}
      </h1>

      {schema.isPending && <LoadingState />}
      {schema.isError && <ErrorState onRetry={() => schema.refetch()} />}

      {schema.isSuccess && (
        <div className={`mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 ${hasFilters ? 'md:grid-cols-[232px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10' : ''}`}>
          <div className={`flex items-center justify-between gap-3 ${hasFilters ? 'md:col-start-2 md:row-start-1' : ''}`}>
            {hasFilters && (
              <button
                type="button"
                aria-expanded={filtersOpen}
                aria-controls="category-filters"
                onClick={() => setFiltersOpen((open) => !open)}
                className="flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 text-sm font-medium md:hidden"
              >
                {t('category.filters')}
                {activeCount > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-ink text-xs text-page tabular">
                    {activeCount}
                  </span>
                )}
              </button>
            )}
            <div className="ml-auto">
              <SortSelect value={sort} onChange={(next) => update(withSort(params, next))} />
            </div>
          </div>

          {hasFilters && (
            <aside
              id="category-filters"
              aria-label={t('category.filters')}
              className={`${filtersOpen ? 'block' : 'hidden'} rounded-[var(--radius-card)] bg-surface p-4 md:col-start-1 md:row-span-2 md:row-start-1 md:block md:self-start md:bg-transparent md:p-0`}
            >
              <DynamicFilters
                filters={filters}
                values={values}
                onChange={(key, next) => update(withFilter(params, key, next))}
              />
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-6 text-sm font-medium text-muted underline underline-offset-4 hover:text-ink"
                >
                  {t('category.reset')}
                </button>
              )}
            </aside>
          )}

          <section aria-label={t('category.results')} className={hasFilters ? 'md:col-start-2' : ''}>
            {products.isPending && <LoadingState />}
            {products.isError && <ErrorState onRetry={() => products.refetch()} />}
            {products.isSuccess && items.length === 0 && (
              <EmptyState
                title={t(activeCount > 0 ? 'category.emptyFiltered' : 'category.empty')}
                hint={activeCount > 0 ? t('category.emptyFilteredHint') : undefined}
                action={activeCount > 0 && <Button onClick={resetFilters}>{t('category.reset')}</Button>}
              />
            )}
            {items.length > 0 && (
              <div
                aria-busy={products.isPlaceholderData}
                className={`transition-opacity ${products.isPlaceholderData ? 'opacity-50' : ''}`}
              >
                <ProductGrid products={items} wide={!hasFilters} />
              </div>
            )}
            {products.hasNextPage && (
              <div className="mt-8 flex justify-center">
                <Button
                  onClick={() => products.fetchNextPage()}
                  disabled={products.isFetchingNextPage}
                  testId="load-more"
                >
                  {t(products.isFetchingNextPage ? 'state.loading' : 'category.loadMore')}
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}
