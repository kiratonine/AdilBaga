'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TOP_DEALS, topDealIds, useCategories, useDashboard, useProductsByIds, useSzptGroups } from '../api/queries'
import { CategoryTiles } from '../components/catalog/CategoryTiles'
import { ProductGrid } from '../components/product/ProductGrid'
import { LoadMore } from '../components/catalog/LoadMore'
import { AUTO_PAGES } from '../lib/loadMore'
import { CategoryTilesSkeleton, ProductGridSkeleton } from '../components/ui/Skeleton'
import { ErrorState, LoadingState } from '../components/ui/States'

export function CatalogPage() {
  const { t } = useTranslation()
  const categories = useCategories()
  // Ошибка /api/szpt только прячет плитку раздела — каталог от неё не зависит
  const szpt = useSzptGroups()

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
        {categories.data && <CategoryTiles categories={categories.data} szptGroup={szpt.data?.[0]?.slug ?? null} />}
      </section>

      <TopDeals />
    </>
  )
}

/**
 * Товары с самой большой разницей цен между сетями (dashboard.priceSpreads).
 * Серверной пагинации у блока нет: список целиком в дашборде, «Показать ещё» (и прокрутка, см. LoadMore) догружает следующие товары по id
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
        {shown.length > 0 && (
          <LoadMore
            wide
            hasMore={hasMore}
            loading={products.isPending}
            auto={count / TOP_DEALS < AUTO_PAGES && !products.isError}
            onLoad={() => setCount((n) => n + TOP_DEALS)}
          />
        )}
      </div>
    </section>
  )
}

/** Пока сервер готовит каталог (loading.tsx): заголовки настоящие, плитки и карточки — скелетоном */
export function CatalogPageLoading() {
  const { t } = useTranslation()
  return (
    <>
      <h1 className="text-h1">{t('home.title')}</h1>
      <LoadingState>
        <div className="mt-6 md:mt-8">
          <CategoryTilesSkeleton />
        </div>
      </LoadingState>
      <section className="mt-8 md:mt-12">
        <h2 className="text-h2">{t('home.deals')}</h2>
        <div className="mt-4" aria-hidden="true">
          <ProductGridSkeleton count={TOP_DEALS} wide />
        </div>
      </section>
    </>
  )
}
