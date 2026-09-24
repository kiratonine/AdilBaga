import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { ProductCardDto } from '../../api/types'
import { formatDate, formatPrice } from '../../lib/format'
import { savingOf, sortOffers } from '../../lib/offers'
import { ProductImage } from './ProductImage'
import { SavingLine } from './SavingLine'

export function ProductCard({ product }: { product: ProductCardDto }) {
  const { t } = useTranslation()
  const offers = sortOffers(product.offers)
  const best = offers[0]
  const oldPrice = best?.oldPrice != null && best.oldPrice > best.price ? best.oldPrice : null
  const saving = savingOf(offers)

  return (
    <article
      data-testid="product-card"
      className="relative flex gap-4 rounded-[var(--radius-card)] border border-line bg-page p-3 transition-colors hover:border-ink/40 sm:flex-col sm:p-4"
    >
      <ProductImage src={product.imageUrl} alt={product.name} className="size-24 shrink-0 sm:aspect-[16/10] sm:size-auto sm:w-full" />

      <div className="flex min-w-0 flex-1 flex-col">
        {product.brand && <p className="truncate text-[13px] text-muted">{product.brand}</p>}
        <h3 className="line-clamp-2 leading-snug font-medium">
          {/* Растянутая ссылка: кликабельна вся карточка */}
          <Link to={`/products/${product.id}`} className="after:absolute after:inset-0 after:rounded-[var(--radius-card)]">
            {product.name}
          </Link>
        </h3>

        <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span data-testid="min-price" className="font-display text-[22px] leading-none font-semibold tracking-[-0.02em] tabular">
            {formatPrice(product.minPrice)}
          </span>
          {oldPrice !== null && <s className="text-sm text-muted tabular">{formatPrice(oldPrice)}</s>}
        </p>
        {saving && (
          <SavingLine amount={saving.amount} store={saving.store} className="mt-1.5 text-[13px]" />
        )}

        <ul data-testid="offer-list" aria-label={t('card.offers')} className="mt-3 flex flex-col text-sm">
          {offers.map((offer, index) => {
            // Одно предложение — сравнивать не с чем, зелёным не выделяем
            const isBest = offers.length > 1 && offer.price === product.minPrice
            return (
              <li
                key={`${offer.storeCode}-${index}`}
                data-best={isBest || undefined}
                className={`flex items-baseline justify-between gap-3 rounded-md px-2 py-1 ${
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

        <p data-testid="snapshot-date" className="mt-auto pt-3 text-xs text-muted tabular">{t('card.priceOn', { date: formatDate(product.snapshotAt) })}</p>
      </div>
    </article>
  )
}
