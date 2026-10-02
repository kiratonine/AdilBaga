'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TOP_DEALS, topDealIds, useCategories, useDashboard, useProductsByIds } from '../api/queries'
import { CategoryTiles } from '../components/catalog/CategoryTiles'
import { ProductGrid } from '../components/product/ProductGrid'
import { Button } from '../components/ui/Button'
import { CategoryTilesSkeleton, ProductGridSkeleton } from '../components/ui/Skeleton'
import { ErrorState, LoadingState } from '../components/ui/States'

export function CatalogPage() {
  const { t } = useTranslation()
  const categories = useCategories()

  return (
    <>
      <h1 className="text-h1">{t('home.title')}</h1>

      <section aria-labelledby="categories-title" className="mt-6 md:mt-8">
        <h2 id="categories-title" className="sr-only">
          {t('home.categories')}
        </h2>
        {categories.isPending && (
          <LoadingState>
            <CategoryTilesSkeleton />
          </LoadingState>
        )}
        {categories.isError && <ErrorState onRetry={() => categories.refetch()} />}
        {categories.data && <CategoryTiles categories={categories.data} />}
      </section>

      <TopDeals />
    </>
  )
}

/**
 * Товары с самой большой разницей цен между сетями (dashboard.priceSpreads).
 * Серверной пагинации у блока нет: список целиком в дашборде, «Показать ещё» догружает следующие товары по id
 */
function TopDeals() {
  const { t } = useTranslation()
  const dashboard = useDashboard()
  const [count, setCount] = useState(TOP_DEALS)
  const ids = topDealIds(dashboard.data, count)
  const products = useProductsByIds(ids)
  // Пока догружаются новые — показываем прежний список целиком, а не карточки по одной
  const shownIds = products.isPending ? topDealIds(dashboard.data, count - TOP_DEALS) : ids
  const byId = new Map(products.data.map((p) => [p.id, p]))
  const shown = shownIds.flatMap((id) => byId.get(id) ?? [])
  const loading = dashboard.isPending || (shownIds.length === 0 && products.isPending)
  const hasMore = (dashboard.data?.priceSpreads.length ?? 0) > count

  return (
    <section aria-labelledby="deals-title" className="mt-8 md:mt-12">
      <h2 id="deals-title" className="text-h2">
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
        {shown.length > 0 && <ProductGrid products={shown} wide />}
        {shown.length > 0 && (hasMore || products.isPending) && (
          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => setCount((n) => n + TOP_DEALS)}
              disabled={products.isPending}
              testId="load-more"
              className="w-full md:w-auto"
            >
              {t(products.isPending ? 'state.loading' : 'category.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
