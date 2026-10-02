'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductCardDto } from '../../api/types'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { ProductCard } from './ProductCard'
import { SHELF_ROW } from './layout'

type Props = {
  title: string
  /** Есть товары — ряд карточек; нет — children (загрузка, ошибка) */
  products?: ProductCardDto[]
  children?: ReactNode
}

/** Горизонтальная полка компактных карточек. На ≥ md — кнопки ‹ ›, если есть куда листать */
export function Shelf({ title, products, children }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const rowId = useId()
  const rowRef = useRef<HTMLUListElement>(null)
  // До первого замера считаем, что листать некуда: кнопки не рисуем (и в серверном HTML тоже)
  const [edges, setEdges] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    const start = row.scrollLeft <= 1
    const end = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    measure()
    row.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      row.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure, products])

  const scroll = (direction: 1 | -1) => {
    const row = rowRef.current
    if (!row) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    row.scrollBy({ left: direction * row.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }

  const hasProducts = products !== undefined && products.length > 0
  const scrollable = !(edges.start && edges.end)

  return (
    <section data-testid="shelf" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-h2">
          {title}
        </h2>
        {hasProducts && scrollable && (
          <div className="hidden gap-1 md:flex">
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('common.scrollBack')}
              aria-controls={rowId}
              disabled={edges.start}
              onClick={() => scroll(-1)}
            >
              <Icon name="chevron-left" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('common.scrollForward')}
              aria-controls={rowId}
              disabled={edges.end}
              onClick={() => scroll(1)}
            >
              <Icon name="chevron-right" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        {hasProducts ? (
          <ul id={rowId} ref={rowRef} className={`${SHELF_ROW} snap-x snap-mandatory overflow-x-auto pb-2`}>
            {products.map((product) => (
              <li key={product.id} className="flex snap-start">
                <ProductCard product={product} variant="compact" />
              </li>
            ))}
          </ul>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
