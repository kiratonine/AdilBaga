import { SHELF_ROW, productGridClass } from '../product/layout'

/**
 * Скелетоны повторяют геометрию настоящих блоков, чтобы при подмене данными ничего не прыгало.
 * Только форма, без текста: для скринридера состояние объявляет LoadingState
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-surface motion-reduce:animate-none ${className}`} />
}

/** Как ProductCard (вариант A): квадратное фото, цена, название, сети, дата. compact — как карточка полки */
export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      data-testid="product-card-skeleton"
      className={`flex h-full flex-col rounded-card bg-card p-2 md:p-3 ${compact ? 'w-37.5 shrink-0 md:w-50' : ''}`}
    >
      <Skeleton className="aspect-square w-full rounded-media" />
      <Skeleton className="mt-2.5 h-[18px] w-20 md:h-[22px]" />
      <Skeleton className="mt-2 h-3.5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-2/3" />
      {!compact && (
        <>
          <div className="mt-2.5 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between gap-2 px-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
          <div className="mt-auto pt-2">
            <Skeleton className="h-3 w-24" />
          </div>
        </>
      )}
    </div>
  )
}

/** Сетка как у ProductGrid. count по умолчанию — один ряд на широком экране */
export function ProductGridSkeleton({ count = 4, wide = false }: { count?: number; wide?: boolean }) {
  return (
    <ul className={productGridClass(wide)}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <ProductCardSkeleton />
        </li>
      ))}
    </ul>
  )
}

/** Ряд полки: компактные карточки, лишние уходят за край, как у настоящей полки */
export function ShelfSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={`${SHELF_ROW} overflow-hidden pb-2`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex">
          <ProductCardSkeleton compact />
        </li>
      ))}
    </ul>
  )
}

/** Чипы категорий: разной ширины, как настоящие названия */
const CHIP_WIDTHS = ['w-24', 'w-16', 'w-20', 'w-28', 'w-36']

export function ChipsSkeleton() {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {CHIP_WIDTHS.map((width) => (
        <Skeleton key={width} className={`h-11 rounded-full ${width}`} />
      ))}
    </div>
  )
}

/** Крошки + h1, как в шапке страниц категории и товара */
function TitleSkeleton({ crumbs = 'w-20' }: { crumbs?: string }) {
  return (
    <>
      <Skeleton className={`h-4 ${crumbs}`} />
      <Skeleton className="mt-2 h-8 w-2/3 max-w-md md:h-10" />
    </>
  )
}

/** Как страница товара: картинка слева (на мобильном сверху), справа цена и список предложений */
export function ProductPageSkeleton() {
  return (
    <div data-testid="product-page-skeleton">
      <Skeleton className="h-4 w-44" />
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
        <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-card)] md:aspect-square" />
        <div className="min-w-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-full md:h-10" />
          <Skeleton className="mt-2 h-8 w-1/2 md:h-10" />
          <Skeleton className="mt-6 h-4 w-32" />
          <Skeleton className="mt-2 h-9 w-40 md:h-11" />
          <Skeleton className="mt-10 h-5 w-36" />
          <div className="mt-3 flex flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[66px] w-full rounded-[var(--radius-control)]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Как страница категории: колонка фильтров на desktop, над товарами — сортировка */
export function CategoryPageSkeleton() {
  return (
    <div data-testid="category-page-skeleton">
      <TitleSkeleton />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[232px_minmax(0,1fr)] md:gap-x-10">
        <div className="hidden flex-col gap-6 md:flex">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-24" />
              <div className="mt-3 flex flex-wrap gap-2">
                <Skeleton className="h-9 w-16 rounded-full" />
                <Skeleton className="h-9 w-20 rounded-full" />
                <Skeleton className="h-9 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div>
          <ProductListSkeleton />
        </div>
      </div>
    </div>
  )
}

/** Над сеткой — место под кнопку фильтров и сортировку, чтобы сетка не прыгала */
export function ProductListSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Skeleton className="h-9 w-44" />
      </div>
      <ProductGridSkeleton count={wide ? 8 : 6} wide={wide} />
    </>
  )
}

/** Как «Аналитика»: 4 плитки сводки, карточки корзин, карта со списком точек */
export function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton">
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-[var(--radius-card)] md:h-[104px]" />
        ))}
      </div>
      <Skeleton className="mt-12 h-5 w-48" />
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="mt-12 h-5 w-40" />
      <Skeleton className="mt-4 h-[320px] rounded-[var(--radius-card)] md:h-[460px]" />
    </div>
  )
}
