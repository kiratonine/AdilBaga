/** Классы раскладки, общие для настоящих блоков и их скелетонов. Без 'use client' — годятся и для серверных компонентов */

/** Сетка товаров: 2 колонки, с md — 3. wide — без колонки фильтров: с lg — 4 */
export function productGridClass(wide: boolean) {
  return `grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 ${wide ? 'lg:grid-cols-4' : ''}`.trim()
}
