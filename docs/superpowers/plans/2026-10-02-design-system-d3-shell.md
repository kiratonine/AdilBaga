# Дизайн-код D3: оболочка — план внедрения

**Goal:** Новая шапка, нижний таб-бар на мобильном, серый фон страниц сайта, футер на `card`.

**Spec:** `docs/superpowers/specs/2026-10-02-design-system-design.md` §5, §8, §10 (D3). Мокап — `specs/2026-10-02-design-system/catalog.html` (мобильная оболочка).

Рабочая папка — `frontend-next/`.

## Решения в рамках D3

- Активный раздел — чистая функция `navSection(pathname)` в `lib/paths.ts`: `catalog` для `/catalog`, `/collections/*`, `/products/*`; `search`; `dashboard`; иначе `null`. Общая для шапки и таб-бара.
- Серый фон: в layout группы `(site)` и в `not-found` — обёртка `flex flex-1 flex-col bg-page` вокруг `Header` + `Main`. Лендинг остаётся белым. Отступ до футера переезжает из `Footer` (`mt-20`) в `Main` (`pb-12 md:pb-20`), чтобы между серым и футером не было белой полосы.
- Отступ под таб-бар: футер идёт после `Main`, поэтому отступ — у `body`: `body:has([data-tab-bar])` на `< md` получает `padding-bottom: calc(64px + env(safe-area-inset-bottom))` (таб-бар не перекрывает ни контент, ни футер).
- `viewport-fit=cover` — `export const viewport` в `app/[lang]/layout.tsx`; `container-page` берёт `max(16px, env(safe-area-inset-*))` по бокам.

## Задачи

1. `navSection` + тесты.
2. `TabBar` (`components/layout/TabBar.tsx`): `nav` `aria-label={t('nav.main')}`, testid `tab-bar`, `data-tab-bar`, `md:hidden`, fixed снизу, `card`, граница `line`, safe-area; 3 пункта (`tab-catalog`/`tab-search`/`tab-dashboard`), иконка 24 + подпись 11px, активный — `ink` 600 + `aria-current="page"`. i18n `nav.main`, `nav.search`. Тесты: активный пункт для `/catalog`, `/collections/x`, `/products/x`, `/search`, `/dashboard`.
3. `Header`: фон `card` без blur; мобильный — строка лого + RU/KZ, вторая — поиск; навигация `hidden md:flex`, активная — `ink` + подчёркивание 2px. Поле поиска — `Icon search`, `rounded-control`.
4. `SearchBox`: фокус в поле при клиентском переходе на `/search` с пустым `q` (не при первой загрузке). Тест.
5. `Segmented`: сегменты `h-10 md:h-9` (дорожка 44px на мобильном).
6. Layout `(site)`, `not-found`, `Main`, `Footer`, `globals.css`, `viewport`.
7. e2e: на iphone виден таб-бар и переход через него; на desktop таб-бара нет.
8. Проверка: typecheck, lint, unit, build, e2e; скриншоты 320/360/390/1280 — без горизонтального скролла; worklog.
