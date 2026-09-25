import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { BasketSummary } from '../../lib/baskets'
import { formatPrice } from '../../lib/format'
import { storeColor } from '../../lib/stores'

/** Стоимость одной и той же продуктовой корзины в каждой сети; самая выгодная из полных — акцентом */
export function Baskets({ baskets }: { baskets: BasketSummary[] }) {
  const { t } = useTranslation()
  const items = baskets[0].items.map((i) => i.categoryName.toLocaleLowerCase('ru')).join(', ')

  return (
    <section aria-labelledby="baskets-title" className="mt-12">
      <h2 id="baskets-title" className="text-lg font-semibold">
        {t('dashboard.basket')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('dashboard.basketHint', { items })}</p>

      {/* items-start: раскрытый состав растягивает только свою карточку, а не весь ряд */}
      <ul className="mt-4 grid grid-cols-1 items-start gap-3 md:grid-cols-3 md:gap-4">
        {baskets.map((basket) => (
          <li
            key={basket.storeCode}
            data-testid="basket"
            data-best={basket.best || undefined}
            className={`flex flex-col rounded-[var(--radius-card)] px-4 py-4 md:px-5 ${basket.best ? 'bg-accent-soft' : 'bg-surface'}`}
          >
            <p className="flex items-center gap-2 font-semibold">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: storeColor(basket.storeCode) }} />
              {basket.storeName}
            </p>
            <p
              data-testid="basket-total"
              className={`mt-2 font-display text-[26px] leading-tight font-bold tracking-[-0.02em] tabular md:text-[32px] ${basket.best ? 'text-accent' : ''}`}
            >
              {formatPrice(basket.total)}
            </p>
            <p className="mt-1 text-sm">
              {basket.best && <span className="font-medium text-accent">{t('dashboard.basketBest')}</span>}
              {basket.overBest !== null && <span className="text-muted">{t('dashboard.basketOver', { amount: formatPrice(basket.overBest) })}</span>}
              {basket.missing > 0 && (
                <span className="text-muted">{t('dashboard.basketMissing', { count: basket.missing, total: basket.items.length })}</span>
              )}
            </p>

            <details className="group mt-3 border-t border-ink/10 pt-3">
              <summary className="cursor-pointer text-sm font-medium select-none">{t('dashboard.basketItems')}</summary>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {basket.items.map((item) => (
                  <li key={item.categorySlug} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-muted">{item.categoryName}</span>
                      {item.productId ? (
                        <Link to={`/products/${item.productId}`} className="hover:underline">
                          {item.name}
                        </Link>
                      ) : (
                        <span className="text-muted">{t('dashboard.basketNotFound')}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium tabular">{item.price === null ? '—' : formatPrice(item.price)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}
