import { CATEGORY_TILES, TILE_SHAPE } from '../catalog/layout'
import { productGridClass } from '../product/layout'

/**
 * Скелетоны повторяют геометрию настоящих блоков, чтобы при подмене данными ничего не прыгало.
 * Только форма, без текста: для скринридера состояние объявляет LoadingState
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-surface motion-reduce:animate-none ${className}`} />
}

/** Как ProductCard (вариант A): квадратное фото, цена, название, сети, дата */
export function ProductCardSkeleton() {
  return (
    <div data-testid="product-card-skeleton" className="flex h-full flex-col rounded-card bg-card p-2 md:p-3">
      <Skeleton className="aspect-square w-full rounded-media" />
      <Skeleton className="mt-2.5 h-[18px] w-20 md:h-[22px]" />
      <Skeleton className="mt-2 h-3.5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-2/3" />
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

/** Плитки категорий: та же сетка и высота, название — полоской */
export function CategoryTilesSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className={CATEGORY_TILES}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex">
          <div className={`${TILE_SHAPE} animate-pulse bg-surface motion-reduce:animate-none`}>
            <span className="block h-3.5 w-2/3 rounded-md bg-card/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** «Назад» + крошки и h1, как в шапке страницы категории */
function TitleSkeleton() {
  return (
    <>
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-20 rounded-control" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="mt-3 h-8 w-2/3 max-w-md md:h-10" />
    </>
  )
}

/** Как страница товара: картинка слева (на мобильном сверху), справа цена и список предложений */
export function ProductPageSkeleton() {
  return (
    <div data-testid="product-page-skeleton">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-20 rounded-control" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8">
        <div className="rounded-card bg-card p-3">
          <Skeleton className="aspect-[4/3] w-full rounded-media md:aspect-square" />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="order-2 md:order-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-7 w-full md:h-9" />
            <Skeleton className="mt-2 h-7 w-1/2 md:h-9" />
          </div>
          <div className="order-1 md:order-2 md:mt-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1.5 h-7 w-40 md:h-9" />
          </div>
          <div className="order-3 rounded-card bg-card p-3 md:p-4">
            <Skeleton className="mx-1 h-5 w-36" />
            <div className="mt-2 flex flex-col gap-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[62px] w-full rounded-control" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Как страница категории: с lg — колонка карточек-фильтров, над товарами — строка управления */
export function CategoryPageSkeleton() {
  return (
    <div data-testid="category-page-skeleton">
      <TitleSkeleton />
      <div className="mt-6 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
        <div className="hidden flex-col gap-2 lg:flex">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-card bg-card p-4">
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
          <ProductListSkeleton filters />
        </div>
      </div>
    </div>
  )
}

/**
 * Над сеткой — место под строку управления, чтобы сетка не прыгала:
 * на мобильном чипы «Фильтры» и сортировки слева, с md — сортировка справа
 */
export function ProductListSkeleton({ wide = false, filters = false }: { wide?: boolean; filters?: boolean }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        {filters && <Skeleton className="h-10 w-28 rounded-full md:h-9 lg:hidden" />}
        <Skeleton className="h-10 w-40 rounded-full md:ml-auto md:h-9 md:w-60" />
      </div>
      <ProductGridSkeleton count={wide ? 8 : 6} wide={wide} />
    </>
  )
}

/** Белая карточка-заглушка: на сером фоне страницы surface-скелетон почти не виден */
function CardSkeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-card bg-card motion-reduce:animate-none ${className}`} />
}

/** Как «Аналитика»: 4 плитки сводки, карточки корзин, карта со списком точек */
export function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton">
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <CardSkeleton key={i} className="h-[92px] md:h-[104px]" />
        ))}
      </div>
      <Skeleton className="mt-8 h-6 w-48 md:mt-12 md:h-7" />
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <CardSkeleton key={i} className="h-[132px]" />
        ))}
      </div>
      <Skeleton className="mt-8 h-6 w-40 md:mt-12 md:h-7" />
      <CardSkeleton className="mt-4 h-[344px] md:h-[492px]" />
    </div>
  )
}
