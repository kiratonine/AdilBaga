/** Классы раскладки, общие для настоящих блоков и их скелетонов. Без 'use client' — годятся и для серверных компонентов */

/** Сетка товаров. wide — без колонки фильтров: 3 колонки с md, 4 с lg */
export function productGridClass(wide: boolean) {
  return `grid grid-cols-2 gap-2 md:gap-4 ${wide ? 'md:grid-cols-3 lg:grid-cols-4' : 'lg:grid-cols-3'}`
}

/**
 * Ряд полки. На мобильном выходит за правый край контейнера:
 * обрезанная карточка подсказывает, что ряд листается
 */
export const SHELF_ROW = '-mr-4 flex gap-2 pr-4 md:mr-0 md:gap-4 md:pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
