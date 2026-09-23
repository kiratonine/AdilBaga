import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useCategoryFilters, useProduct } from '../api/queries'
import { ApiError, type FilterDto, type ProductCardDto } from '../api/types'
import { ProductImage } from '../components/product/ProductImage'
import { ErrorState, LoadingState } from '../components/ui/States'
import { formatAttributeValue } from '../lib/attributes'
import { formatDate, formatPrice } from '../lib/format'
import { savingOf, sortOffers } from '../lib/offers'
import { NotFoundPage } from './NotFoundPage'

export function ProductPage() {
  const { id = '' } = useParams()
  const product = useProduct(id)

  if (product.error instanceof ApiError && product.error.status === 404) return <NotFoundPage />
  if (product.isPending) return <LoadingState />
  if (product.isError) return <ErrorState onRetry={() => product.refetch()} />
  return <ProductDetails product={product.data} />
}

function ProductDetails({ product }: { product: ProductCardDto }) {
  const { t } = useTranslation()
  const offers = sortOffers(product.offers)
  const saving = savingOf(offers)
  const best = offers[0]
  const oldPrice = best?.oldPrice != null && best.oldPrice > best.price ? best.oldPrice : null

  return (
    <>
      <nav aria-label={t('category.breadcrumbs')} className="flex flex-wrap gap-x-2 text-sm text-muted">
        <Link to="/" className="hover:text-ink">
          {t('nav.home')}
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/collections/${product.category.slug}`} className="hover:text-ink">
          {product.category.name}
        </Link>
      </nav>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="aspect-[4/3] w-full md:sticky md:top-24 md:aspect-square md:self-start"
        />

        <div className="min-w-0">
          {product.brand && <p className="text-muted">{product.brand}</p>}
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.01em] text-pretty break-words md:text-[32px]">
            {product.name}
          </h1>

          <div className="mt-6">
            <p className="text-sm text-muted">{t('product.lowest')}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <span data-testid="min-price" className="font-display text-[36px] leading-none font-semibold tracking-[-0.02em] tabular md:text-[44px]">
                {formatPrice(product.minPrice)}
              </span>
              {oldPrice !== null && <s className="text-muted tabular">{formatPrice(oldPrice)}</s>}
            </p>
            {saving && (
              <p className="mt-2 font-medium text-accent">
                {t('card.saving', { amount: formatPrice(saving.amount), store: saving.store })}
              </p>
            )}
          </div>

          <section aria-labelledby="offers-title" className="mt-8">
            <h2 id="offers-title" className="text-lg font-semibold">
              {t('card.offers')}
            </h2>
            <ul data-testid="offer-list" className="mt-3 flex flex-col gap-1">
              {offers.map((offer) => {
                const isBest = offer.price === product.minPrice
                const offerOld = offer.oldPrice != null && offer.oldPrice > offer.price ? offer.oldPrice : null
                return (
                  <li
                    key={offer.storeCode}
                    data-best={isBest || undefined}
                    className={`flex items-center justify-between gap-4 rounded-[var(--radius-control)] px-3 py-3 ${
                      isBest ? 'bg-accent-soft text-accent' : 'border border-line'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{offer.storeName}</span>
                      {isBest ? (
                        <span className="text-[13px]">{t('product.cheapest')}</span>
                      ) : (
                        <span className="text-[13px] text-muted tabular">
                          {t('product.moreExpensive', { amount: formatPrice(offer.price - product.minPrice) })}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-semibold tabular">{formatPrice(offer.price)}</span>
                      {offerOld !== null && <s className="text-[13px] text-muted tabular">{formatPrice(offerOld)}</s>}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p data-testid="snapshot-date" className="mt-3 text-xs text-muted tabular">
              {t('card.priceOn', { date: formatDate(product.snapshotAt) })}
            </p>
          </section>

          <Attributes product={product} />
        </div>
      </div>
    </>
  )
}

/** Подписи атрибутов берём из schema фильтров категории; ключи без подписи не показываем */
function Attributes({ product }: { product: ProductCardDto }) {
  const { t } = useTranslation()
  const schema = useCategoryFilters(product.category.slug)
  const rows = (schema.data?.filters ?? []).flatMap((filter: FilterDto) => {
    const value = product.attributes[filter.key]
    return value === undefined ? [] : [{ key: filter.key, label: filter.label, value }]
  })

  if (rows.length === 0) return null

  return (
    <section aria-labelledby="attributes-title" className="mt-10">
      <h2 id="attributes-title" className="text-lg font-semibold">
        {t('product.attributes')}
      </h2>
      <dl data-testid="product-attributes" className="mt-3 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-2 gap-4 py-2.5">
            <dt className="text-muted">{row.label}</dt>
            <dd className="tabular">{formatAttributeValue(row.key, row.value, t)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
