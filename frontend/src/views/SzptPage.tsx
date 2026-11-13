'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSzptGroups, useSzptPages } from '../api/queries'
import type { SzptSort } from '../api/types'
import { DynamicFilters } from '../components/catalog/DynamicFilters'
import { LoadMore } from '../components/catalog/LoadMore'
import { infiniteLoadMore } from '../lib/loadMore'
import { SortSelect } from '../components/catalog/SortSelect'
import { BackLink } from '../components/layout/BackLink'
import { ProductGrid } from '../components/product/ProductGrid'
import { Button } from '../components/ui/Button'
import { Chip, chipClass } from '../components/ui/Chip'
import { Icon } from '../components/ui/Icon'
import { Sheet } from '../components/ui/Sheet'
import { CategoryPageSkeleton, ProductGridSkeleton } from '../components/ui/Skeleton'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { szptGroupName } from '../lib/dataLabels'
import { formatDate } from '../lib/format'
import { readSzptState, sizeFilter, szptParams } from '../lib/szpt'
import { replaceQuery } from '../lib/urlState'
import { useHref } from '../lib/useLang'
import { CategoryHeader } from './CategoryPage'
import { NotFoundPage } from './NotFoundPage'

const SORTS: SzptSort[] = ['price_asc', 'unit_price_asc']

/** Раздел СЗПТ: группы, фасовки, две сортировки. Группы и первая страница приходят с сервера */
export function SzptPage({ group: slug }: { group: string }) {
  const { t } = useTranslation()
  const href = useHref()
  const pathname = usePathname()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const params = useSearchParams()

  const groups = useSzptGroups()
  const group = groups.data?.find((g) => g.slug === slug)
  const state = group ? readSzptState(params, group) : { group: slug, sizes: [], sort: 'price_asc' as const }
  // Без группы (не загрузилась или неизвестна) запрос не нужен — уйдём в 404 или подождём список групп
  const products = useSzptPages({ group: state.group, sizes: state.sizes, sort: state.sort }, Boolean(group))

  if (groups.isSuccess && !group) return <NotFoundPage />
  if (groups.isPending)
    return (
      <LoadingState>
        <CategoryPageSkeleton />
      </LoadingState>
    )
  if (groups.isError || !group) return <ErrorState onRetry={() => groups.refetch()} />

  const update = (next: Pick<typeof state, 'sizes' | 'sort'>) => replaceQuery(pathname, szptParams(next))
  const resetSizes = () => update({ sizes: [], sort: state.sort })
  const changeSizes = (_key: string, next: string[]) => update({ sizes: next.map(Number), sort: state.sort })
  const filters = group.sizes.length > 0 ? [sizeFilter(group, t('szpt.size'))] : []
  const hasFilters = filters.length > 0
  const values = hasFilters ? { [filters[0].key]: state.sizes.map(String) } : {}
  const items = products.data?.pages.flat() ?? []
  const unit = t(`szpt.per.${group.unit}`)

  return (
    <>
      <div className="flex items-center gap-4">
        <BackLink fallbackHref={href('/catalog')} />
        <nav aria-label={t('category.breadcrumbs')} className="text-sm text-muted">
          <Link href={href('/catalog')} className="hover:text-ink">
            {t('nav.home')}
          </Link>
        </nav>
      </div>
      <h1 className="mt-3 text-h1">{t('szpt.title')}</h1>
      <p className="mt-2 text-sm text-muted">
        {t('szpt.subtitle')}
        {items[0] && <> {t('szpt.priceDate', { date: formatDate(items[0].snapshotAt) })}</>}
      </p>

      {/* Как в категории: ≥ lg — колонка слева (группы, затем фасовки карточками). Уже — группы строкой
          чипов с прокруткой (переключать продукт надо в один тап), фасовки — в шторке */}
      <div className="mt-6 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
        <aside className="mb-4 self-start lg:mb-0 lg:flex lg:flex-col lg:gap-2">
          <nav
            aria-labelledby="szpt-groups-title"
            className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0 lg:rounded-card lg:bg-card lg:p-4"
          >
            <h2 id="szpt-groups-title" className="sr-only text-sm font-semibold lg:not-sr-only lg:mb-2.5 lg:block">
              {t('szpt.groupsLabel')}
            </h2>
            <ul className="flex gap-2 md:flex-wrap">
              {groups.data.map((g) => (
                <li key={g.slug} className="shrink-0">
                  <Link
                    href={href(`/szpt/${g.slug}`)}
                    prefetch={false}
                    data-testid={`szpt-group-${g.slug}`}
                    aria-current={g.slug === slug ? 'page' : undefined}
                    className={chipClass(g.slug === slug)}
                  >
                    {szptGroupName(t, g)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {hasFilters && (
            <div aria-label={t('category.filters')} role="group" className="hidden lg:block">
              <DynamicFilters filters={filters} values={values} onChange={changeSizes} boxed />
              {state.sizes.length > 0 && (
                <button
                  type="button"
                  onClick={resetSizes}
                  className="mt-4 text-sm font-medium text-muted underline underline-offset-4 hover:text-ink"
                >
                  {t('category.reset')}
                </button>
              )}
            </div>
          )}
        </aside>

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
                {state.sizes.length > 0 && <span className="tabular">· {state.sizes.length}</span>}
              </Chip>
            )}
            <SortSelect
              value={state.sort}
              onChange={(sort) => update({ sizes: state.sizes, sort })}
              options={SORTS}
              optionLabel={(sort) => t(`szpt.sort.${sort}`, { unit })}
              className="md:ml-auto"
            />
          </div>

          {/* Скрытый h2, как в категории: группа и так видна в выбранном чипе */}
          <section aria-labelledby="szpt-results-title">
            <h2 id="szpt-results-title" className="sr-only">
              {szptGroupName(t, group)}
            </h2>
            {products.isPending && (
              <LoadingState>
                <ProductGridSkeleton count={6} />
              </LoadingState>
            )}
            {products.isError && <ErrorState onRetry={() => products.refetch()} />}
            {products.isSuccess && items.length === 0 && (
              <EmptyState
                title={t(state.sizes.length > 0 ? 'szpt.emptyFiltered' : 'szpt.empty')}
                icon={state.sizes.length > 0 ? 'sliders' : 'basket'}
                action={state.sizes.length > 0 && <Button onClick={resetSizes}>{t('szpt.resetSizes')}</Button>}
              />
            )}
            {items.length > 0 && (
              <div
                aria-busy={products.isPlaceholderData}
                className={`transition-opacity ${products.isPlaceholderData ? 'opacity-50' : ''}`}
              >
                <ProductGrid products={items} />
              </div>
            )}
            <LoadMore {...infiniteLoadMore(products)} />
          </section>
        </div>
      </div>

      {hasFilters && (
        <Sheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title={t('category.filters')}
          testId="filters-sheet"
          footer={
            <>
              <Button onClick={resetSizes} disabled={state.sizes.length === 0}>
                {t('category.resetShort')}
              </Button>
              <Button variant="primary" onClick={() => setFiltersOpen(false)}>
                {t('category.show')}
              </Button>
            </>
          }
        >
          {/* Только пока открыта: иначе в DOM два набора filter-<key> (сайдбар и шторка) */}
          {filtersOpen && <DynamicFilters filters={filters} values={values} onChange={changeSizes} />}
        </Sheet>
      )}
    </>
  )
}

/** Пока сервер готовит страницу группы (заглушка перехода): шапка раздела настоящая, ниже скелетон */
export function SzptPageLoading() {
  const { t } = useTranslation()
  return (
    <>
      <CategoryHeader name={t('szpt.title')} />
      <p className="mt-2 text-sm text-muted">{t('szpt.subtitle')}</p>
      <LoadingState>
        <CategoryPageSkeleton title={false} />
      </LoadingState>
    </>
  )
}
