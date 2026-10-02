'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { TOP_DEALS, topDealIds, useCategories, useDashboard, useProductsByIds } from '../api/queries'
import { ProductGrid } from '../components/product/ProductGrid'
import { ChipsSkeleton, ProductGridSkeleton } from '../components/ui/Skeleton'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useHref } from '../lib/useLang'

export function CatalogPage() {
  const { t } = useTranslation()
  const href = useHref()
  const categories = useCategories()

  return (
    <>
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em] md:text-[34px]">{t('home.title')}</h1>

      <section aria-labelledby="categories-title" className="mt-8">
        <h2 id="categories-title" className="text-lg font-semibold">
          {t('home.categories')}
        </h2>
        {categories.isPending && (
          <LoadingState>
            <ChipsSkeleton />
          </LoadingState>
        )}
        {categories.isError && <ErrorState onRetry={() => categories.refetch()} />}
        {categories.data && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.data.map((c) => (
              <li key={c.id}>
                <Link
                  href={href(`/collections/${c.slug}`)}
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

      <TopDeals />
    </>
  )
}

/** Товары с самой большой разницей цен между сетями (dashboard.priceSpreads) */
function TopDeals() {
  const { t } = useTranslation()
  const dashboard = useDashboard()
  const ids = topDealIds(dashboard.data)
  const products = useProductsByIds(ids)
  const loading = dashboard.isPending || (ids.length > 0 && products.isPending)

  return (
    <section aria-labelledby="deals-title" className="mt-12">
      <h2 id="deals-title" className="text-lg font-semibold">
        {t('home.deals')}
      </h2>
      <div className="mt-4">
        {loading && (
          <LoadingState>
            <ProductGridSkeleton count={TOP_DEALS} wide />
          </LoadingState>
        )}
        {dashboard.isError && <ErrorState onRetry={() => dashboard.refetch()} />}
        {products.isError && <ErrorState onRetry={products.refetch} />}
        {!loading && products.data.length > 0 && <ProductGrid products={products.data} wide />}
      </div>
    </section>
  )
}
