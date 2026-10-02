'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useProductPages } from '../api/queries'
import { SortSelect } from '../components/catalog/SortSelect'
import { ProductGrid } from '../components/product/ProductGrid'
import { Button } from '../components/ui/Button'
import { ProductGridSkeleton } from '../components/ui/Skeleton'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { readSort, withSort } from '../lib/filterParams'
import { replaceQuery } from '../lib/urlState'
import { useHref } from '../lib/useLang'

/** /search?q= — поиск по всем категориям, целиком на клиенте (страница в индекс не идёт). Запрос в URL пишет SearchBox в шапке */
export function SearchPage() {
  const { t } = useTranslation()
  const href = useHref()
  const pathname = usePathname()
  const params = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const sort = readSort(params)
  const products = useProductPages({ search: q, sort }, { enabled: q !== '' })
  const items = products.data?.pages.flat() ?? []
  const title = q ? t('search.titleFor', { query: q }) : t('search.title')

  return (
    <>
      <h1 className="text-h1 break-words">
        {title}
      </h1>

      {!q && (
        <div className="mt-6">
          <EmptyState title={t('search.promptTitle')} hint={t('search.promptHint')} />
        </div>
      )}

      {q && (
        <section aria-label={t('category.results')} className="mt-6">
          {items.length > 0 && (
            <div className="mb-4 flex justify-end">
              <SortSelect value={sort} onChange={(next) => replaceQuery(pathname, withSort(params, next))} />
            </div>
          )}

          {products.isPending && (
            <LoadingState>
              <ProductGridSkeleton count={8} wide />
            </LoadingState>
          )}
          {products.isError && <ErrorState onRetry={() => products.refetch()} />}
          {products.isSuccess && items.length === 0 && (
            <EmptyState
              title={t('search.empty', { query: q })}
              hint={t('search.emptyHint')}
              action={
                <Button href={href('/catalog')} variant="secondary">
                  {t('state.toCatalog')}
                </Button>
              }
            />
          )}
          {items.length > 0 && (
            <div
              aria-busy={products.isPlaceholderData}
              className={`transition-opacity ${products.isPlaceholderData ? 'opacity-50' : ''}`}
            >
              <ProductGrid products={items} wide />
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
      )}
    </>
  )
}

/** Пока не известен запрос из URL (статичная оболочка /search): заголовок и сетка-скелетон */
export function SearchPageFallback() {
  const { t } = useTranslation()
  return (
    <>
      <h1 className="text-h1">{t('search.title')}</h1>
      <div className="mt-6">
        <LoadingState>
          <ProductGridSkeleton count={8} wide />
        </LoadingState>
      </div>
    </>
  )
}
