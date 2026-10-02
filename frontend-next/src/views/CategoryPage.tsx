'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCategories, useCategoryFilters, useProductPages } from '../api/queries'
import { ApiError } from '../api/types'
import { DynamicFilters } from '../components/catalog/DynamicFilters'
import { BackLink } from '../components/layout/BackLink'
import { SortSelect } from '../components/catalog/SortSelect'
import { ProductGrid } from '../components/product/ProductGrid'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { Icon } from '../components/ui/Icon'
import { Sheet } from '../components/ui/Sheet'
import { CategoryPageSkeleton, ProductGridSkeleton } from '../components/ui/Skeleton'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { countActive, readFilters, readSort, withFilter, withoutFilters, withSort } from '../lib/filterParams'
import { replaceQuery } from '../lib/urlState'
import { useHref } from '../lib/useLang'
import { NotFoundPage } from './NotFoundPage'

/** Schema, категории и первая страница товаров (с фильтрами из URL) приходят с сервера */
export function CategoryPage({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const href = useHref()
  const pathname = usePathname()
  const params = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)

  const categories = useCategories()
  const schema = useCategoryFilters(slug)
  const filters = schema.data?.filters ?? []
  const values = readFilters(params, filters)
  const sort = readSort(params)
  const activeCount = countActive(values)

  // Ждём schema: без неё не понять, какие параметры URL — фильтры
  const products = useProductPages({ category: slug, filters: values, sort }, { enabled: schema.isSuccess })

  const update = (next: URLSearchParams) => replaceQuery(pathname, next)
  const resetFilters = () => update(withoutFilters(params, filters))
  const changeFilter = (key: string, next: string[]) => update(withFilter(params, key, next))

  const category = categories.data?.find((c) => c.slug === slug)
  if (schema.error instanceof ApiError && schema.error.status === 404) return <NotFoundPage />
  if (schema.isPending)
    return (
      <LoadingState>
        <CategoryPageSkeleton />
      </LoadingState>
    )

  const items = products.data?.pages.flat() ?? []
  const hasFilters = filters.length > 0

  return (
    <>
      {/* «Назад» — как на странице товара: пришли из поиска или с товара — туда, извне — в каталог */}
      <div className="flex items-center gap-4">
        <BackLink fallbackHref={href('/catalog')} />
        <nav aria-label={t('category.breadcrumbs')} className="text-sm text-muted">
          <Link href={href('/catalog')} className="hover:text-ink">
            {t('nav.home')}
          </Link>
        </nav>
      </div>
      <h1 className="mt-3 min-h-[1.2em] text-h1">{category?.name}</h1>

      {schema.isError && <ErrorState onRetry={() => schema.refetch()} />}

      {schema.isSuccess && (
        <div className={`mt-6 ${hasFilters ? 'lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8' : ''}`}>
          {/* ≥ lg — колонка карточек-фильтров; уже — те же фильтры в шторке */}
          {hasFilters && (
            <aside aria-label={t('category.filters')} className="hidden self-start lg:block">
              <DynamicFilters filters={filters} values={values} onChange={changeFilter} boxed />
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 text-sm font-medium text-muted underline underline-offset-4 hover:text-ink"
                >
                  {t('category.reset')}
                </button>
              )}
            </aside>
          )}

          <div>
            <div className="mb-4 flex items-center gap-2">
              {hasFilters && (
                <Chip
                  testId="filters-toggle"
                  aria-haspopup="dialog"
                  onClick={() => setFiltersOpen(true)}
                  className="lg:hidden"
                >
                  <Icon name="sliders" size={18} />
                  {t('category.filters')}
                  {activeCount > 0 && <span className="tabular">· {activeCount}</span>}
                </Chip>
              )}
              <SortSelect value={sort} onChange={(next) => update(withSort(params, next))} className="md:ml-auto" />
            </div>

            <section aria-label={t('category.results')}>
              {products.isPending && (
                <LoadingState>
                  <ProductGridSkeleton count={hasFilters ? 6 : 8} wide={!hasFilters} />
                </LoadingState>
              )}
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
                    className="w-full md:w-auto"
                  >
                    {t(products.isFetchingNextPage ? 'state.loading' : 'category.loadMore')}
                  </Button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {hasFilters && (
        <Sheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title={t('category.filters')}
          testId="filters-sheet"
          footer={
            <>
              <Button onClick={resetFilters} disabled={activeCount === 0}>
                {t('category.resetShort')}
              </Button>
              <Button variant="primary" onClick={() => setFiltersOpen(false)}>
                {t('category.show')}
              </Button>
            </>
          }
        >
          {/* Только пока открыта: иначе в DOM два набора filter-<key> (сайдбар и шторка) */}
          {filtersOpen && <DynamicFilters filters={filters} values={values} onChange={changeFilter} />}
        </Sheet>
      )}
    </>
  )
}
