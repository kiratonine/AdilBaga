/** Классы раскладки каталога, общие с его скелетонами. Без 'use client' */

/** Сетка плиток: 3 колонки на мобильном, с md — сколько влезет по 160px */
export const CATEGORY_TILES = 'grid grid-cols-3 gap-2 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:gap-4'

/** Форма плитки: мин. 92px на мобильном, 112px с md */
export const TILE_SHAPE = 'flex min-h-23 w-full flex-col rounded-card p-2.5 md:min-h-28 md:p-3'
