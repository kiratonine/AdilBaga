import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useProductPages } from '../api/queries'
import { SortSelect } from '../components/catalog/SortSelect'
import { ProductGrid } from '../components/product/ProductGrid'
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { readSort, withSort } from '../lib/filterParams'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/** /search?q= — поиск по всем категориям. Запрос в URL пишет SearchBox в шапке */
export function SearchPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const sort = readSort(params)
  const products = useProductPages({ search: q, sort }, { enabled: q !== '' })
  const items = products.data?.pages.flat() ?? []
  const title = q ? t('search.titleFor', { query: q }) : t('search.title')
  useDocumentTitle(title)

  return (
    <>
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em] break-words md:text-[34px]">
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
              <SortSelect value={sort} onChange={(next) => setParams(withSort(params, next), { replace: true })} />
            </div>
          )}

          {products.isPending && <LoadingState />}
          {products.isError && <ErrorState onRetry={() => products.refetch()} />}
          {products.isSuccess && items.length === 0 && (
            <EmptyState
              title={t('search.empty', { query: q })}
              hint={t('search.emptyHint')}
              action={
                <Link to="/catalog" className="font-medium text-accent underline underline-offset-4">
                  {t('state.toCatalog')}
                </Link>
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
