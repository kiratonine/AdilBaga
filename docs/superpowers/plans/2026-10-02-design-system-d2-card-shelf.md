# Дизайн-код D2: карточка и полка — план внедрения

**Goal:** Карточка товара варианта A (вертикальная, цена первой, топ-3 сетей), компактная карточка и горизонтальная полка; скелетоны под новую геометрию.

**Spec:** `docs/superpowers/specs/2026-10-02-design-system-design.md` §4, §7, §8 (полка), §9. Мокап — `specs/2026-10-02-design-system/card.html` (вариант A).

Рабочая папка — `frontend-next/`.

## Решения в рамках D2

- Иконка категории вместо плейсхолдера фото — в D4 вместе с `lib/categoryIcons.ts` (там же плитки). В D2 — прежний нейтральный плейсхолдер.
- `ProductGrid`: проп `wide` остаётся — у категории с колонкой фильтров сетка уже. `grid-cols-2`, с колонкой фильтров `lg:grid-cols-3`, без неё `md:grid-cols-3 lg:grid-cols-4`; отступ 8/16px.
- Полка сразу подключается в каталоге вместо сетки «Самая большая разница в цене» (`TopDeals`); плитки категорий — D4.
- Строки из ревью D1: родные `rounded-card`/`rounded-media`/`shadow-hover` вместо `rounded-[var(--radius-*)]`; кнопки полки — `<Button size="icon" variant="ghost">`; опечатка в регэкспе `Button.test.tsx`.

## Задачи

1. **`topOffers(offers, limit)`** в `lib/offers.ts` → `{ shown, hiddenCount, maxPrice }`; тесты: ≤ 3, > 3, одно предложение.
2. **`discountPercent(offer)`** там же: `floor((old − price) / old · 100)`, `null`, если нет старой цены или процент < 1.
3. **`ProductCard`**: порядок фото (бейдж «−X%») → цена + старая → `SavingLine` → бренд → название → топ-3 сетей → `more-offers` «ещё N сетей · до X ₸» → дата `mt-auto`. Без рамки, `rounded-card`, `p-2 md:p-3`, `shadow-hover` только при `hover: hover`. `variant="compact"`: ширина 150/200px, без сетей и даты, строка выгоды «Выгоднее на X ₸» (`card.savingShort`). i18n `card.moreOffers_*` (плюралы ru/kk), `card.discount`, `card.savingShort`.
4. **`ProductImage`**: скругление передаёт вызывающий (карточка — `rounded-media`, страница товара — прежнее `rounded-control`).
5. **`ProductGrid`** — новые колонки и отступы.
6. **`Shelf`** (`components/product/Shelf.tsx`): `section` + h2, ряд `ul` с `overflow-x-auto snap-x snap-mandatory`, скрытый скроллбар, на мобильном выход за правый край контейнера; ≥ md кнопки ‹ › (`aria-label`, `aria-controls`), скрыты, когда прокручивать некуда (`scroll`/`resize`). Testid `shelf`. Тесты: карточки компактные, кнопки прокручивают, disabled-состояние по краям.
7. **Скелетоны**: `ProductCardSkeleton` (вертикальная A, `compact`), `ProductGridSkeleton` (новые колонки), `ShelfSkeleton`.
8. **Каталог**: `TopDeals` → `Shelf` + `ShelfSkeleton`.
9. Проверка: typecheck, `rtk proxy pnpm lint`, unit, `next build`, e2e (моки), скриншоты 390/1280 каталога и категории; worklog.
