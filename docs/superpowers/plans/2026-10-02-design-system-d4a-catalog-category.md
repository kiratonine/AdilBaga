# Дизайн-код D4a: каталог и категория — план внедрения

**Goal:** Убрать полку (решение пользователя после D3), плитки категорий и сетка со «Показать ещё» в каталоге; категория с сайдбаром на ≥ lg и шторками фильтров и сортировки на мобильном.

**Spec:** `docs/superpowers/specs/2026-10-02-design-system-design.md` §6 (Каталог, Категория), §7, §10 (D4). Мокап — `specs/2026-10-02-design-system/catalog.html` (плитки, вариант A).

Рабочая папка — `frontend-next/`. D4b (товар, поиск, аналитика, лендинг, состояния) — следующей сессией.

## Решения в рамках D4a

- **Полка удаляется целиком:** `Shelf.tsx`, `Shelf.test.tsx`, `ShelfSkeleton`, `SHELF_ROW`, `variant="compact"` у `ProductCard`, `card.savingShort` и ветка без `store` в `SavingLine`, ключи `common.scrollBack/scrollForward`.
- **«Самая большая разница в цене»:** `ProductGrid wide`, страница — 8 товаров (`TOP_DEALS`), `topDealIds(dashboard, count)`. «Показать ещё» увеличивает `count` на 8; пока новые товары грузятся, на экране остаётся прежний список (карточки не появляются по одной), кнопка — «Загружаем…». Кнопки нет, когда `priceSpreads` кончились. Сервер по-прежнему кладёт в HTML первые 8.
- **Плитки:** `components/catalog/CategoryTiles.tsx`, `lib/categoryIcons.ts` (слаги моков + реального сида бэка: `milk`, `bread`, `eggs`, `sugar`, `oil`, `groats`, `vegetables`, `meat`; остальное — `basket`). Иконки — линейные, в наборе `Icon`. Иконка `ink/70`, 32px.
- **Сетка:** `productGridClass(wide)` — без `wide` 3 колонки уже с md (колонки фильтров до lg больше нет).
- **Категория:** фильтры-сайдбар `hidden lg:block` 260px, каждый фильтр — белая карточка (`DynamicFilters boxed`). На `< lg` — чип «Фильтры · n» → `Sheet` (`filters-sheet`), футер «Сбросить» / «Показать». Содержимое шторки рендерится только пока она открыта — иначе в DOM два `filter-<key>`.
- **Сортировка** (`SortSelect`, общая с поиском): ≥ md — нативный `<select>` (`sort-select`); `< md` — чип с текущим вариантом (`sort-chip`) → `Sheet` (`sort-sheet`) с radio, выбор применяет и закрывает. Отступление от спеки: testid `sort-select` только у `<select>` — два элемента с одним testid ломают strict-режим Playwright и `getByTestId` в unit.
- **Шторка:** блокировка прокрутки страницы — `html:has(dialog[open]) { overflow: hidden }` в `globals.css`.
- «Показать ещё» — `Button secondary`, `w-full md:w-auto`.

## Задачи

1. Удалить полку и compact-вариант; тесты каталога/карточки.
2. `topDealIds(dashboard, count)`, `TopDeals` с «Показать ещё» + тест.
3. Иконки категорий, `categoryIcons` + тест, `CategoryTiles` + `CategoryTilesSkeleton` (вместо `ChipsSkeleton`).
4. `DynamicFilters` на `ui/Chip`, проп `boxed`.
5. `SortSelect`: select ≥ md, чип + шторка < md + тест.
6. `CategoryPage`: сайдбар ≥ lg, шторка < lg, строка управления; `CategoryPageSkeleton`/`ProductListSkeleton` под новую раскладку; тест шторки фильтров.
7. e2e: фильтры и сортировка на iphone — через шторки.
8. Спека §7–§9 (полка), проверка: typecheck, lint, unit, build, e2e, скриншоты 390/1280; worklog.
