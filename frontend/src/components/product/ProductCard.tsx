'use client'

import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import type { ProductCardDto } from '../../api/types'
import { formatDate, formatPrice } from '../../lib/format'
import { discountPercent, savingOf, topOffers } from '../../lib/offers'
import { useHref } from '../../lib/useLang'
import { Badge } from '../ui/Badge'
import { ProductImage } from './ProductImage'
import { SavingLine } from './SavingLine'
import { usePriceStale } from '../../lib/freshness'

/** Сколько сетей видно в карточке; остальные — строкой «ещё N сетей» */
const OFFERS_SHOWN = 3

export function ProductCard({ product }: { product: ProductCardDto }) {
  const { t } = useTranslation()
  const href = useHref()
  const stale = usePriceStale(product.snapshotAt)
  const { shown, hiddenCount, maxPrice } = topOffers(product.offers, OFFERS_SHOWN)
  const best = shown[0]
  const oldPrice = best?.oldPrice != null && best.oldPrice > best.price ? best.oldPrice : null
  const discount = discountPercent(best)
  const saving = savingOf(product.offers)
  // Одно предложение — сравнивать не с чем, зелёным не выделяем
  const compared = product.offers.length > 1

  return (
    <article
      data-testid="product-card"
      className="relative flex flex-col rounded-card bg-card p-2 transition-shadow hover:shadow-hover md:p-3"
    >
      <div className="relative">
        <ProductImage src={product.imageUrl} alt={product.name} className="aspect-square w-full rounded-media" />
        {discount !== null && (
          <Badge tone="discount" className="absolute top-1.5 left-1.5">
            <span aria-hidden="true">−{discount}%</span>
            <span className="sr-only">{t('card.discount', { percent: discount })}</span>
          </Badge>
        )}
      </div>

      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span data-testid="min-price" className="text-price-card">
          {formatPrice(product.minPrice)}
        </span>
        {oldPrice !== null && <s className="text-meta text-muted tabular">{formatPrice(oldPrice)}</s>}
      </p>
      {saving && <SavingLine amount={saving.amount} store={saving.store} className="mt-1 text-meta" />}

      {product.brand && <p className="mt-1.5 truncate text-meta text-muted">{product.brand}</p>}
      <h3 className={`line-clamp-2 text-card-title ${product.brand ? '' : 'mt-1.5'}`}>
        {/* Растянутая ссылка: кликабельна вся карточка */}
        <Link href={href(`/products/${product.id}`)} className="after:absolute after:inset-0 after:rounded-card">
          {product.name}
        </Link>
      </h3>

      <ul data-testid="offer-list" aria-label={t('card.offers')} className="mt-2 flex flex-col text-meta">
        {shown.map((offer, index) => {
          const isBest = compared && offer.price === product.minPrice
          return (
            <li
              key={`${offer.storeCode}-${index}`}
              data-best={isBest || undefined}
              className={`flex items-baseline justify-between gap-2 rounded-md px-1.5 py-0.75 ${
                isBest ? 'bg-accent-soft font-medium text-accent' : 'text-ink'
              }`}
            >
              <span className="truncate">
                {offer.storeName}
                {isBest && <span className="sr-only">, {t('card.lowest')}</span>}
              </span>
              <span className="shrink-0 tabular">{formatPrice(offer.price)}</span>
            </li>
          )
        })}
      </ul>
      {hiddenCount > 0 && (
        <p data-testid="more-offers" className="mt-1 px-1.5 text-meta text-muted tabular">
          {t('card.moreOffers', { count: hiddenCount, price: formatPrice(maxPrice) })}
        </p>
      )}

      <p data-testid="snapshot-date" className="mt-auto pt-2 text-caption text-muted tabular">
        {t('card.priceOn', { date: formatDate(product.snapshotAt) })}
      </p>
      {stale && (
        <p data-testid="price-stale" className="text-caption text-muted">{t('card.priceStale')}</p>
      )}
    </article>
  )
}
