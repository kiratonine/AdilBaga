'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCategoryFilters, useProduct } from '../api/queries'
import { ApiError, type FilterDto, type OfferDto, type ProductCardDto } from '../api/types'
import { BackLink } from '../components/layout/BackLink'
import { ProductImage } from '../components/product/ProductImage'
import { SavingLine } from '../components/product/SavingLine'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ProductPageSkeleton } from '../components/ui/Skeleton'
import { ErrorState, LoadingState } from '../components/ui/States'
import { formatAttributeValue } from '../lib/attributes'
import { categoryIcon } from '../lib/categoryIcons'
import { formatDate, formatPrice } from '../lib/format'
import { discountPercent, savingOf, sortOffers } from '../lib/offers'
import { storeColor } from '../lib/stores'
import { useHref } from '../lib/useLang'
import { NotFoundPage } from './NotFoundPage'
import { isPriceStale } from '../lib/freshness'

/** Сколько сетей видно сразу; остальные — по «Показать все N» */
const OFFERS_VISIBLE = 5

/** Данные обычно уже в кэше с сервера; загрузка и ошибки — если серверу не удалось */
export function ProductPage({ id }: { id: string }) {
  const product = useProduct(id)

  if (product.error instanceof ApiError && product.error.status === 404) return <NotFoundPage />
  if (product.isPending)
    return (
      <LoadingState>
        <ProductPageSkeleton />
      </LoadingState>
    )
  if (product.isError) return <ErrorState onRetry={() => product.refetch()} />
  return <ProductDetails product={product.data} />
}

function ProductDetails({ product }: { product: ProductCardDto }) {
  const { t } = useTranslation()
  const href = useHref()
  const offers = sortOffers(product.offers)
  const saving = savingOf(offers)
  const best = offers[0]
  // Одно предложение — сравнивать не с чем, поэтому без зелёного «дешевле всего»
  const compared = offers.length > 1
  const oldPrice = best?.oldPrice != null && best.oldPrice > best.price ? best.oldPrice : null
  const discount = discountPercent(best)

  return (
    <>
      <div className="flex items-center gap-4">
        <BackLink fallbackHref={href(`/collections/${product.category.slug}`)} />
        <nav aria-label={t('category.breadcrumbs')} className="flex min-w-0 flex-wrap gap-x-2 text-sm text-muted">
          <Link href={href('/catalog')} className="hover:text-ink">
            {t('nav.home')}
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={href(`/collections/${product.category.slug}`)} className="hover:text-ink">
            {product.category.name}
          </Link>
        </nav>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8">
        <div className="rounded-card bg-card p-3 md:sticky md:top-24 md:self-start">
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            icon={categoryIcon(product.category.slug)}
            className="aspect-[4/3] w-full rounded-media md:aspect-square"
          />
        </div>

        {/* На мобильном цена над названием (order), в DOM заголовок первый — для скринридера и SEO */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="order-2 md:order-1">
            {product.brand && <p className="text-meta text-muted">{product.brand}</p>}
            <h1 className="text-h1 text-pretty break-words">{product.name}</h1>
          </div>

          <div className="order-1 md:order-2 md:mt-1">
            <p className="text-meta text-muted">{t(compared ? 'product.lowest' : 'product.price')}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span data-testid="min-price" className="text-price-page">
                {formatPrice(product.minPrice)}
              </span>
              {discount !== null && (
                <Badge tone="discount">
                  <span aria-hidden="true">−{discount}%</span>
                  <span className="sr-only">{t('card.discount', { percent: discount })}</span>
                </Badge>
              )}
              {oldPrice !== null && <s className="text-muted tabular">{formatPrice(oldPrice)}</s>}
            </p>
            {saving && <SavingLine amount={saving.amount} store={saving.store} className="mt-2" />}
          </div>

          <Offers product={product} offers={offers} compared={compared} />
          <Attributes product={product} />
        </div>
      </div>
    </>
  )
}

function Offers({ product, offers, compared }: { product: ProductCardDto; offers: OfferDto[]; compared: boolean }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const firstRevealed = useRef<HTMLLIElement>(null)
  const visible = expanded ? offers : offers.slice(0, OFFERS_VISIBLE)

  // Кнопка исчезает — фокус переходит на первую открывшуюся сеть, а не теряется
  useEffect(() => {
    if (expanded) firstRevealed.current?.focus()
  }, [expanded])

  return (
    <section aria-labelledby="offers-title" className="order-3 rounded-card bg-card p-3 md:p-4">
      <h2 id="offers-title" className="px-1 text-h3">
        {t('card.offers')}
      </h2>
      <ul data-testid="offer-list" className="mt-2 flex flex-col gap-1">
        {visible.map((offer, index) => {
          const isBest = compared && offer.price === product.minPrice
          const offerOld = offer.oldPrice != null && offer.oldPrice > offer.price ? offer.oldPrice : null
          return (
            <li
              key={`${offer.storeCode}-${index}`}
              ref={index === OFFERS_VISIBLE ? firstRevealed : undefined}
              tabIndex={index === OFFERS_VISIBLE ? -1 : undefined}
              data-best={isBest || undefined}
              className={`flex items-center gap-3 rounded-control px-3 py-2.5 ${isBest ? 'bg-accent-soft' : ''}`}
            >
              <span
                aria-hidden="true"
                data-store-dot
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: storeColor(offer.storeCode) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{offer.storeName}</span>
                {!compared ? (
                  <Badge tone="neutral" className="mt-1">
                    {t('product.onlyStore')}
                  </Badge>
                ) : isBest ? (
                  // Строка уже accent-soft — бейдж белой таблеткой, иначе сливается
                  <Badge tone="best" className="mt-1 bg-card!">
                    {t('product.cheapest')}
                  </Badge>
                ) : (
                  <span className="block text-meta text-muted tabular">
                    {t('product.moreExpensive', { amount: formatPrice(offer.price - product.minPrice) })}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-price-row ${isBest ? 'text-accent' : ''}`}>{formatPrice(offer.price)}</span>
                {offerOld !== null && <s className="text-caption text-muted tabular">{formatPrice(offerOld)}</s>}
              </span>
            </li>
          )
        })}
      </ul>
      {!expanded && offers.length > OFFERS_VISIBLE && (
        <Button variant="ghost" testId="show-all-offers" className="mt-1 w-full" onClick={() => setExpanded(true)}>
          {t('product.showAll', { count: offers.length })}
        </Button>
      )}
      <p data-testid="snapshot-date" className="mt-2 px-1 text-caption text-muted tabular">
        {t('card.priceOn', { date: formatDate(product.snapshotAt) })}
      </p>
      {isPriceStale(product.snapshotAt) && (
        <p data-testid="price-stale" className="px-1 text-caption text-muted">{t('card.priceStale')}</p>
      )}
    </section>
  )
}

/** Подписи атрибутов берём из schema фильтров категории; ключи без подписи не показываем */
function Attributes({ product }: { product: ProductCardDto }) {
  const { t } = useTranslation()
  const schema = useCategoryFilters(product.category.slug)
  const rows = (schema.data?.filters ?? []).flatMap((filter: FilterDto) => {
    const value = product.attributes[filter.key]
    return value === undefined || value === null ? [] : [{ key: filter.key, label: filter.label, value }]
  })

  if (rows.length === 0) return null

  return (
    <section aria-labelledby="attributes-title" className="order-4 rounded-card bg-card p-3 md:p-4">
      <h2 id="attributes-title" className="px-1 text-h3">
        {t('product.attributes')}
      </h2>
      {/* С md — пары в две колонки; линия под последним рядом не нужна */}
      <dl data-testid="product-attributes" className="mt-2 grid grid-cols-1 md:grid-cols-2 md:gap-x-6">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-2 gap-4 border-b border-line px-1 py-2.5 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
          >
            <dt className="text-muted">{row.label}</dt>
            <dd className="tabular">{formatAttributeValue(row.key, row.value, t)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
