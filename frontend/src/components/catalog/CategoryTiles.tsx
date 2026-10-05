'use client'

import Link from 'next/link'
import type { CategoryDto } from '../../api/types'
import { categoryIcon } from '../../lib/categoryIcons'
import { useHref } from '../../lib/useLang'
import { Icon } from '../ui/Icon'
import { CATEGORY_TILES, TILE_SHAPE } from './layout'

// Полными строками — иначе Tailwind не увидит классы. Зелёной пастели нет: зелёный занят «выгоднее»
const TILE_COLORS = ['bg-tile-1', 'bg-tile-2', 'bg-tile-3', 'bg-tile-4', 'bg-tile-5']

/** Плитки категорий: цвет по порядку, иконка по слагу */
export function CategoryTiles({ categories }: { categories: CategoryDto[] }) {
  const href = useHref()
  return (
    <ul className={CATEGORY_TILES}>
      {categories.map((category, index) => (
        <li key={category.id} className="flex">
          <Link
            href={href(`/collections/${category.slug}`)}
            data-testid="category-card"
            className={`${TILE_SHAPE} ${TILE_COLORS[index % TILE_COLORS.length]} justify-between text-sm font-medium text-ink transition-[filter] hover:brightness-95 md:text-[15px]`}
          >
            {/*
              Длинное слово («растительное») в узкой плитке — переносом, а не обрезкой. Где нет словаря переносов
              (Chrome на Windows), слово рвётся без дефиса — поэтому до 3 строк
            */}
            <span className="line-clamp-3 leading-tight hyphens-auto [overflow-wrap:anywhere]">{category.name}</span>
            <Icon name={categoryIcon(category.slug)} size={32} className="shrink-0 self-end text-ink/70" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
