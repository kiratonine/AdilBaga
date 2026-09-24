import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDashboard } from '../api/queries'
import type { DashboardDto, PriceSpreadDto, StoreLocationDto } from '../api/types'
import { ErrorState, LoadingState } from '../components/ui/States'
import { formatDate, formatPercent, formatPrice } from '../lib/format'
import { groupByStore, locationKey, storeColor } from '../lib/stores'
import { useDocumentTitle } from '../lib/useDocumentTitle'

// Leaflet нужен только здесь — отдельный чанк
const StoreMap = lazy(() => import('../components/dashboard/StoreMap'))

export function DashboardPage() {
  const { t } = useTranslation()
  const dashboard = useDashboard()
  useDocumentTitle(t('dashboard.title'))

  return (
    <>
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em] md:text-[34px]">{t('dashboard.title')}</h1>
      <p className="mt-2 max-w-[60ch] text-muted">{t('dashboard.lead')}</p>

      {dashboard.isPending && <LoadingState />}
      {dashboard.isError && <ErrorState onRetry={() => dashboard.refetch()} />}
      {dashboard.data && (
        <>
          <Summary summary={dashboard.data.summary} />
          <PriceSpreads spreads={dashboard.data.priceSpreads} />
          <Stores locations={dashboard.data.locations} />
        </>
      )}
    </>
  )
}

function Summary({ summary }: { summary: DashboardDto['summary'] }) {
  const { t } = useTranslation()
  const matchedShare = summary.canonicalProducts > 0 ? (summary.matchedAcrossStores / summary.canonicalProducts) * 100 : 0
  const tiles = [
    { key: 'products', label: t('dashboard.products'), value: String(summary.canonicalProducts) },
    { key: 'stores', label: t('dashboard.stores'), value: String(summary.stores) },
    {
      key: 'matched',
      label: t('dashboard.matched'),
      value: String(summary.matchedAcrossStores),
      hint: t('dashboard.matchedShare', { percent: formatPercent(Math.round(matchedShare)) }),
    },
    { key: 'snapshot', label: t('dashboard.snapshot'), value: formatDate(summary.snapshotAt) },
  ]

  return (
    <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {tiles.map((tile) => (
        <div key={tile.key} data-testid="summary-card" className="flex flex-col rounded-[var(--radius-card)] bg-surface px-4 py-4 md:px-5">
          <dt className="text-sm text-muted">{tile.label}</dt>
          <dd className="order-first font-display text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular sm:text-[26px] md:text-[32px]">
            {tile.value}
          </dd>
          {tile.hint && <dd className="mt-1 text-[13px] text-muted">{tile.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

function PriceSpreads({ spreads }: { spreads: PriceSpreadDto[] }) {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="spreads-title" className="mt-12">
      <h2 id="spreads-title" className="text-lg font-semibold">
        {t('dashboard.spreads')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('dashboard.spreadsHint')}</p>
      {spreads.length === 0 ? (
        <p className="mt-4 text-muted">{t('dashboard.spreadsEmpty')}</p>
      ) : (
        <ol className="mt-4 divide-y divide-line border-y border-line">
          {spreads.map((spread) => (
            <li
              key={spread.productId}
              data-testid="price-spread"
              className="flex items-center justify-between gap-4 py-3"
            >
              <Link to={`/products/${spread.productId}`} className="min-w-0 font-medium text-pretty hover:underline">
                {spread.name}
              </Link>
              <p className="shrink-0 text-right text-[15px] tabular">
                <span className="font-semibold text-accent">{formatPrice(spread.minPrice)}</span>
                <span className="text-muted"> – {formatPrice(spread.maxPrice)}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Stores({ locations }: { locations: StoreLocationDto[] }) {
  const { t } = useTranslation()
  const groups = groupByStore(locations)

  return (
    <section aria-labelledby="stores-title" className="mt-12">
      <h2 id="stores-title" className="text-lg font-semibold">
        {t('dashboard.map')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('dashboard.mapHint')}</p>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="h-[320px] md:h-[460px]">
          <Suspense fallback={<div className="h-full rounded-[var(--radius-card)] bg-surface" />}>
            <StoreMap locations={locations} label={t('dashboard.map')} />
          </Suspense>
        </div>

        {/* Легенда и текстовый список точек — карта без него недоступна для скринридеров */}
        <ul data-testid="store-list" className="flex flex-col gap-5">
          {groups.map((group) => (
            <li key={group.storeCode} data-testid="store-group">
              <p className="flex items-center gap-2 font-semibold">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: storeColor(group.storeCode) }} />
                {group.storeName}
                <span className="font-normal text-muted tabular">· {t('dashboard.points', { count: group.locations.length })}</span>
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 pl-5 text-[15px]">
                {group.locations.map((location) => (
                  <li key={locationKey(location)} className="text-muted">
                    {location.address}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
