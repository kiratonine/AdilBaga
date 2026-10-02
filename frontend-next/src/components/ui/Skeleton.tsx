/**
 * Скелетоны повторяют геометрию настоящих блоков, чтобы при подмене данными ничего не прыгало.
 * Только форма, без текста: для скринридера состояние объявляет LoadingState
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-surface motion-reduce:animate-none ${className}`} />
}

/** Как ProductCard: на мобильном картинка слева, с sm — сверху */
export function ProductCardSkeleton() {
  return (
    <div
      data-testid="product-card-skeleton"
      className="flex h-full gap-4 rounded-[var(--radius-card)] border border-line bg-page p-3 sm:flex-col sm:p-4"
    >
      <Skeleton className="size-24 shrink-0 rounded-[var(--radius-control)] sm:aspect-[16/10] sm:size-auto sm:w-full" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-1.5 h-4 w-2/3" />
        <Skeleton className="mt-3 h-[22px] w-24" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between gap-3 px-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-12" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-4 h-3 w-28" />
      </div>
    </div>
  )
}

/** Сетка как у ProductGrid. count по умолчанию — один ряд на широком экране */
export function ProductGridSkeleton({ count = 4, wide = false }: { count?: number; wide?: boolean }) {
  return (
    <ul className={`grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 ${wide ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <ProductCardSkeleton />
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
