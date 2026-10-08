# Frontend Worklog — рабочий контекст (я + Claude)

> **Как пользоваться.** В начале новой сессии скажи: «прочитай `docs/context/06_FRONTEND_WORKLOG.md` и делай следующую сессию». Одна сессия = одна большая задача из плана ниже. В конце сессии Claude обновляет разделы «Статус», «Журнал» и «Следующий шаг».
>
> Источники правды: `docs/00_TECHNICAL_SPEC.md`, `docs/01_RISKS_AND_DECISIONS.md`, `docs/context/02_FRONTEND_SCOPE.md`. API-контракт: **`docs/context/05_FRONTEND_ANSWERS_FROM_BACKEND_1.md`** (вопросы — `05_FRONTEND_QUESTIONS_FOR_BACKEND.md`).

---

## Текущий production frontend — Production Part 01

Миграция завершена: единственный frontend — Next.js 16 App Router в `frontend/`.
React 19, TypeScript, Tailwind 4, TanStack Query, Leaflet; ru/kk в URL.
Ветка `integrate/full-stack`. NestJS остаётся reference, API/DTO не изменены.
Обязательны явные `NEXT_PUBLIC_API_MODE=http`, `NEXT_PUBLIC_API_BASE_URL` и
production `NEXT_PUBLIC_SITE_URL`; optional `API_BASE_URL` — internal server URL.
Mock допустим явно в dev/tests, production mock artifact — только test-only opt-in
`NEXT_PUBLIC_ENABLE_TEST_MOCKS=1`, устанавливаемый mock Playwright конфигурацией.
GET server cache: 3600 s, tag `catalog-data`. Каталог/Dashboard/sitemap — runtime SSR;
backend-down build PASS. Planned URLs: https://aktau.market / https://api.aktau.market.
Бренд Adil Bağa сохранён. Проверки и фактические результаты —
`docs/production/reports/PART_01_REPORT.md`.

## Исторические решения и контекст до Production Part 01

Таблица и журнал ниже сохраняют историю Vite → Next; прежние пути/команды и
временные fallback/SSG решения не являются текущими production instructions.

| Тема | Решение |
|---|---|
| Стек | Vite + React + TypeScript, React Router, TanStack Query, Tailwind CSS, pnpm |
| Тесты | Vitest + Testing Library (unit), Playwright (E2E) |
| Карта | Leaflet + OpenStreetMap (react-leaflet), без ключей |
| Языки UI | **ru** (default) + **kk**, i18n через `react-i18next`. Данные товаров остаются как с бэка (ru) |
| Дизайн | Минималистично, **без мотивов флага**. Белый фон, графит `ink #1A1F24`, серый `surface #F3F5F4`, один акцент — зелёный `accent #17744A` = «здесь дешевле» (только min price / выгода). Шрифты: Golos Text (UI) + **Montserrat** (цены — bold, логотип — extrabold; выбран пользователем в сессии 6 из сравнения 9 шрифтов, до этого Unbounded → Onest). Шрифты без казахских букв (Manrope, Jost) не подходят, self-host через `@fontsource-variable`. Лого: зелёный ценник со знаком «=». Токены — `@theme` в `src/index.css` Дизайн-код — `docs/superpowers/specs/2026-10-02-design-system-design.md` (токены `page`/`card`, шкала `text-*`, примитивы `components/ui/`: Button, Chip, Badge, Segmented, Icon, Sheet). Фокус — графит, не зелёный. Base 15px |
| Деплой | **Не наша зона** — фронтенд деплой не делает (решение пользователя, сессия 6) |
| Репо | `https://github.com/kiratonine/AdilBaga`, ветка `feat/frontend`, код в `frontend/**` |
| Роуты | `/` — лендинг (сессия 7), `/catalog` — каталог (категории + товары с наибольшей экономией), `/collections/:slug` — категория, `/search?q=` — поиск по всем категориям, `/products/:id` — страница товара, `/dashboard` |
| API-слой | `catalogApi` с двумя адаптерами: mock (JSON из `src/mocks/`) и http. Переключение через `VITE_API_MODE=mock\|http` + `VITE_API_BASE_URL` |
| Пагинация | «Показать ещё» (limit/offset, `PAGE_SIZE = 24`). Бэк отдаёт **массив без total**: следующей страницы нет, если пришло < limit. Счётчик «Найдено N» не показываем (максимум — число загруженных) |
| Фильтры | Только из schema бэка. Типы: `multi-select`, `boolean` (`?key=true|false`). Мульти-значения — повтор параметра, OR внутри ключа, AND между ключами. `options` — **голые значения**; подписи через `lib/attributes.ts` (единицы по суффиксу ключа: `*Ml`, `*Grams`, `*Percent`, `count`). Подписи атрибутов на странице товара — `filter.label` из schema категории. Состояние фильтров в URL query |
| Дата | **Плашки «Цены актуальны на…» в шапке нет** (убрана по просьбе пользователя в сессии 2). Дата snapshot — на каждой карточке сетки: «Цена на DD.MM.YYYY» из `product.snapshotAt` (testid `snapshot-date`); у компактной карточки полки даты нет (спека §4). Никогда не писать «в реальном времени» |
| Необязательные поля | `offer.inStock`, `location.id`, `priceSpread.imageUrl/category/minStoreName/maxStoreName` — optional в типах, в моках отсутствуют, UI от них не зависит. Ключ маркера карты — `storeCode + address` |
| Прочее из контракта | `brand` может быть `null`; категории только из `GET /api/categories` (слаги не хардкодить); `nameKk` нет; неизвестный sort → 400 |
| Testid | `category-card`, `product-card`, `min-price`, `filter-<key>`, `offer-list` (мин. предложение — `li[data-best]`), `search-input`, `sort-select`, `load-more`, `snapshot-date`, `nav-catalog`, `nav-dashboard`, `landing-example`, `siri-dialog`, `loading-state`, `error-state`, `empty-state`, `image-placeholder`, `product-attributes`, `summary-card`, `price-spread`, `store-map` (маркеры — `path.store-marker`), `store-list`, `store-group` |
| Футер | Слева логотип + «Сравниваем цены на продукты в сетях Актау.», справа «© {год} Все права защищены» (`footer.rights`, testid `copyright`). Без списка магазинов и без фразы о снимке |
| Лендинг | **Удалён** (решение пользователя, D4a): `views/LandingPage*`, словари `landing.*` и `meta.landing` удалены. `/` → **307** сразу на `/<язык>/catalog` (proxy), `/ru`, `/kk` → **308** на каталог (`[lang]/page.tsx`, `permanentRedirect`). Логотип ведёт на `/catalog`, в sitemap `/<язык>` нет (каталог — priority 1). Тексты OG-картинки (заголовок и пример) перенесены в `scripts/generate-og.mjs`, PNG прежние |
| Каталог (`/catalog`) | Заголовок «Где сегодня выгоднее» (kk «Бүгін қай жерде тиімдірек»), `text-h1`. Плитки категорий `components/catalog/CategoryTiles.tsx` (цвет `tile-(i%5+1)`, иконка по слагу — `lib/categoryIcons.ts`, запасная `basket`; название до 3 строк с `hyphens-auto` — в Chrome на Windows нет словаря переносов, слово рвётся без дефиса), заголовок «Категории» — `sr-only`. Блок «Самая большая разница в цене» — `ProductGrid wide` полных карточек: по 8 (`TOP_DEALS`) из `dashboard.priceSpreads`, `topDealIds(dashboard, count)`, «Показать ещё» (`load-more`) увеличивает `count`; пока новые грузятся — прежний список целиком, кнопка «Загружаем…»; нет кнопки, когда список кончился. Сервер кладёт в HTML первые 8. Полки больше нет |
| Категория | «Назад» (`BackLink`, извне — в каталог) + крошки, `text-h1`. **≥ lg** — колонка 260px: каждый фильтр — белая карточка (`DynamicFilters boxed`), под ней «Сбросить фильтры». **< lg** — чип `filters-toggle` «Фильтры · n» → `Sheet` `filters-sheet` (те же `DynamicFilters`, рендерятся только пока шторка открыта — иначе два `filter-<key>` в DOM), футер «Сбросить» (`category.resetShort`, disabled без фильтров) / «Показать» (закрывает; фильтры применяются сразу). Сортировка `SortSelect` (общая с поиском): ≥ md — `<select>` `sort-select` таблеткой справа; < md — чип `sort-chip` → `Sheet` `sort-sheet` с radio (выбор применяет и закрывает). Фильтры: multi-select — чипы `ui/Chip` (`aria-pressed`), boolean — один чип (вкл = `?key=true`). URL: `lib/filterParams.ts` (невалидные ключи/значения/sort из URL игнорируются, `price_asc` в URL не пишется), `replace: true`. Запрос товаров ждёт schema. `useProductPages` = `useInfiniteQuery`, при смене фильтров держит прежний список (opacity 50%). «Показать ещё» — `w-full md:w-auto` |
| Поиск | Единственное поле — `SearchBox` в шапке, отдельного инпута на `/search` нет. Живой поиск: debounce 350 мс, от 2 символов (1 символ — только по Enter). С других страниц — push на `/search?q=`, на `/search` — `replace` с сохранением `sort`; очистка поля на `/search` убирает `q`. Пустой `q` — подсказка «Что ищем?», запрос не шлём. Сортировка скрыта, если ничего не найдено |
| Товар | `/products/:id`: крошки Каталог / категория, картинка (sticky на desktop), бренд, h1, «Самая низкая цена» + old price + строка выгоды, offers по возрастанию: минимум — `accent-soft` «Дешевле всего», остальные «дороже на X ₸». Характеристики (`dl`) — только ключи, у которых есть `filter.label` в schema категории, в порядке schema. 404 → NotFound |
| Версии | React 19, React Router **8** (импорт из `react-router`), Vite 8, Tailwind 4, Vitest 5, TS 6 |
| E2E | Playwright: проекты `desktop` + `iphone` (chromium). CDN браузеров недоступен → `PW_CHANNEL=chrome pnpm test:e2e` |
| Dashboard | `/dashboard`: 4 summary-плитки (`dl`, testid `summary-card`; у «Сопоставлено» подпись «N% каталога»), список `priceSpreads` в порядке бэка (`price-spread`: название → `/products/:id`, min (`accent`) – max, без процентов и полосы — только min–max, по просьбе пользователя в сессии 6), карта + текстовый список точек по сетям (`store-list`/`store-group`, это же легенда). Карта — `components/dashboard/StoreMap.tsx`, `lazy` (Leaflet в отдельном чанке), `CircleMarker` с классом `store-marker` (**`className` прямым пропом** — через `pathOptions` не применяется), popup: сеть + адрес, `fitBounds` по точкам, `scrollWheelZoom` выкл., обёртка `isolate` (иначе панели Leaflet перекрывают sticky-шапку) |
| Корзина | Контракт согласован: вопросы — `07_FRONTEND_QUESTIONS_BASKET.md`, ответы — `08_FRONTEND_ANSWERS_BASKET.md` (лежит в ветке бэка `integrate/full-stack`), отчёт — `PART_05_REPORT.md`. Реальный состав — 3 позиции: `milk` 1 л, `sugar` 1 кг, `oil` 1 л; `categoryName` — название категории датасета («Молочные продукты», «Сахар и соль», «Растительные масла»). Пустая корзина (все позиции `null`, `total: 0`) — «Нет данных», не «0 ₸» (`BasketSummary.empty`, `lib/basketText.ts`), без состава, на карте подпись «нет данных». На реальных данных у DINA корзина пустая, у DANA 2 155 ₸, у FIX_PRICE 2 050 ₸. additive `dashboard.baskets?: BasketDto[]` — по сети `total` + `items` (категория, товар или `null`). Состав задаёт бэк, фронт не хардкодит. `lib/baskets.ts` `summarizeBaskets`: полные по возрастанию, потом неполные; «Выгоднее всего» — только среди полных (неполная дешевле за счёт недостающих). `components/dashboard/Baskets.tsx`: карточки сетей (testid `basket`, `basket-total`, `data-best`), «дороже на X», «Нет N из M позиций», `<details>` «Состав корзины» со ссылками на товары. Карта: постоянный Leaflet `Tooltip` с суммой у каждой точки (`.basket-label`, лучшая — `--best` акцентом, неполная — `--partial` серым с пунктиром; стили в `index.css` через `.leaflet-tooltip.` — иначе перебивает leaflet.css), в popup «Корзина: X · неполная», в списке точек — `store-basket`. Без поля `baskets` блок и подписи не показываются. Порядок на странице (просьба пользователя): сводка → корзина → карта → разброс цен. Карточки корзин в сетке с `items-start` — раскрытый состав растягивает только свою карточку. Моки: 5 позиций (молоко 1 л, хлеб, яйца C0 10 шт, сахар 1 кг, масло 1 л) — у Fix Price нет яиц C0, корзина неполная |
| Строка выгоды | `components/product/SavingLine.tsx` (карточка + страница товара): фраза — `ink`, сумма — `accent` semibold (по просьбе пользователя: «цифра должна выделяться»). i18n через `<Trans>` с тегом `<price>` в `card.saving` |
| Заголовок вкладки | `lib/useDocumentTitle.ts`: «<страница> — Adil Bağa», на главной — `brand.title`; меняется с языком. В `CategoryPage` 404-заголовок ставится самой страницей (эффект родителя идёт после эффекта `NotFoundPage`) |
| Skip-link | Первый Tab — «Перейти к содержимому» → `main#main` (`tabIndex=-1`) |
| Git | На GitHub дефолтная ветка — **`main`** (была `feat/backend-2`, сменено 2026-09-23) |
| Одно предложение | Если у товара одна цена (в датасете backend-2 так у большинства) — **без зелёной подсветки** и без «Дешевле всего»: на странице товара «Цена» вместо «Самая низкая цена» и подпись «Только в этой сети». Ключ offer — `storeCode-index` |
| Фактический DTO бэка | `attributes` — значения могут быть `null` (не показываем); `FilterDto.options` у multi-select необязательны и бывают boolean (фильтр без options скрыт, boolean → «Да/Нет») |
| E2E http | `E2E_API=http PW_CHANNEL=chrome pnpm test:e2e` → только `e2e/http.spec.ts`, preview на **:4174**, ожидания берутся из API (data-agnostic). Обычный прогон этот spec игнорирует |
| Next (`frontend-next/`) | Next **16.3** (App Router, Turbopack), `src/`-раскладка: `src/app` — только роуты, остальное (`api`, `lib`, `components`, `i18n`, `mocks`) — как в старом фронте, относительные импорты. Env: `NEXT_PUBLIC_API_MODE`, `NEXT_PUBLIC_API_BASE_URL` (браузер, подставляются при сборке), `API_BASE_URL` (сервер, внутренний адрес; не задан — публичный) — `createCatalogApi` в `api/catalogApi.ts`. Шрифты — по-прежнему fontsource в `globals.css` (офлайн-сборка, unicode-range с казахскими буквами). `Providers.tsx` — QueryClient + i18n. Компоненты с хуками — `'use client'`. В Next 16 middleware называется **`src/proxy.ts`**. `typecheck` = `next typegen && tsc` (глобальные `LayoutProps`/`PageProps`). Unit-тесты: `next/link` в jsdom работает без моков. E2E на :3100 |
| Next: язык и роутинг | Корневой layout — `app/[lang]/layout.tsx` (`<html lang>`, `Providers lang`, SkipLink, Footer, `generateStaticParams` ru/kk, невалидный lang → `notFound()`; **не** `dynamicParams=false` — наследуется детьми). `[lang]/page.tsx` — редирект на каталог (лендинг удалён в D4a), страницы — в группе `[lang]/(site)/` с `layout.tsx` = Header + `Main`. Компоненты страниц — `src/views/*` (папка `pages` в `src/` включила бы Pages Router). 404: `[lang]/[...rest]/page.tsx` → `notFound()` → `[lang]/not-found.tsx` (сам рисует Header + Main). **Next 16.3 отдаёт на 404 error-shell (`<html id="__next_error__">`) и дорисовывает not-found на клиенте** — статус 404 и noindex верные, для SEO достаточно; not-found в группе `(site)` и в `[...rest]` не помогают. `/favicon.ico` и другие пути с точкой — дефолтная 404 Next |
| Next: proxy | `src/proxy.ts`: путь с префиксом `/ru|/kk` — пропуск; `/` → **307** на язык из cookie `lang` → Accept-Language (по q, `kk-KZ` = kk) → ru; прочие пути без префикса (старые URL SPA) → **308** на `/<lang><path>?<query>`. Matcher пропускает `_next/`, `api/` и пути с расширением. Константы языков — `i18n/languages.ts` (proxy не тянет словари) |
| Next: i18n | `getI18n(lang)` — по экземпляру i18next на язык (`createInstance`, `initAsync: false`, словари в бандле), без `changeLanguage` → безопасно делить между запросами; на сервере `getI18n(lang).t` (metadata). Клиент: `I18nextProvider` в `Providers`. `useLang()`/`useHref()` (`lib/useLang.ts`) — язык из контекста i18n, `href('/catalog')` → `/kk/catalog`; чистые функции — `lib/paths.ts` (`localePath`, `switchLanguagePath`). localStorage больше не используется |
| Next: LanguageSwitch | Ссылки (`<Link hrefLang aria-current>`) на ту же страницу с другим префиксом — видны поисковику. Клик пишет cookie `lang` (год); query (фильтры, `q`) переносится через `window.location.search` + `router.push` (в `href` его нет — иначе нужен `useSearchParams` при пререндере). В тестах роль — `link`, не `button` |
| Next: SearchBox | `next/navigation` (`router.push`/`replace` со строкой URL), путь — `href('/search')`. `useSearchParams` → в Header обёрнут в `Suspense` с `SearchBoxFallback` (то же поле без логики) — иначе пререндер всей группы уходит в CSR |
| Next: данные в HTML | Опции запросов — `categoriesQuery()`, `productQuery(id)`, `dashboardQuery()` в `api/queries.ts` (общие для хуков и сервера); `TOP_DEALS`/`topDealIds` там же. Серверная страница: `new QueryClient()` → `prefetchQuery`/`fetchQuery` → `<HydrationBoundary state={dehydrate(qc)}>`. Каталог так и сделан (SSG `/ru/catalog`, `/kk/catalog`) |
| Next: metadata | Layout `[lang]`: `metadataBase = SITE_URL`, `title.template = '%s — Adil Bağa'`, `description = brand.tagline` (запасная), `twitter.card = summary_large_image` (остальное X берёт из OG). Индексируемые страницы (лендинг, каталог, категория, товар, «Аналитика») — `pageMetadata({lang, path, title?, description, image?})` из `lib/seo.ts`: canonical на своём языке **без query** (у категории — без фильтров/сортировки), hreflang ru/kk + **x-default = ru** (`hreflangPaths`, общий с sitemap), Open Graph целиком (openGraph не сливается с layout, а заменяется), `og:locale` `ru_KZ`/`kk_KZ`. Без `title` — `{absolute: brand.title}`. Тексты описаний — `meta.*` в словарях; у товара `productDescription` (самая низкая цена, сеть, дата снимка; при одной цене — без «от»). Поиск — только `noindex, follow`, 404 — `<title>` прямо в `NotFoundPage` |
| Next: SEO-адрес | `lib/site.ts`: `SITE_URL` из **`NEXT_PUBLIC_SITE_URL`** (подставляется при сборке), fallback `http://localhost:3000`; `absoluteUrl(path)`. Предупреждение о пустой переменной — в `next.config.ts` в фазе `PHASE_PRODUCTION_BUILD`, один раз (флаг `SITE_URL_WARNED` в env — конфиг читают и воркеры). Домен появится — задать env при деплое и пересобрать |
| Next: JSON-LD | `lib/structuredData.ts`: `productJsonLd` — `Product` (`@id` = абсолютный URL, sku, image/brand только если есть) + `AggregateOffer` (KZT, low/high/offerCount) с `Offer` на каждую сеть (`seller` — Organization; `availability` — только если бэк пришлёт `inStock`), `breadcrumbJsonLd` (Каталог / Категория / товар, абсолютные URL на языке страницы). `components/seo/JsonLd.tsx` — `<script type="application/ld+json">`, `serializeJsonLd` экранирует `<`. Рисуется в `page.tsx` рядом с `HydrationBoundary`, не в views |
| Next: sitemap/robots | `app/sitemap.ts` (`revalidate = 3600`, статика: **в http-режиме `next build` ходит в API**): `/`, `/catalog`, `/dashboard`, категории (`lastmod` — дата снимка) и все товары (`getProducts` страницами по 100, максимум 50 страниц; `lastmod` — `snapshotAt`, `images` — фото) на обоих языках с `xhtml:link` hreflang. Поиск не включён. `app/robots.ts` — allow всё + `Sitemap:`; поиск в robots **не** закрыт, иначе поисковик не увидит его noindex |
| Next: OG-картинка | Статичные `public/og/{ru,kk}.png` (1200×630): логотип, заголовок лендинга, tagline, карточка-пример как в hero (Dina 570 ₸ выгоднее всего). Генерирует `pnpm og` (`scripts/generate-og.mjs`, Playwright + fontsource; `PW_CHANNEL=chrome`). `opengraph-image.tsx`/`next/og` не подошёл: satori не читает woff2, а кириллица Golos/Montserrat есть только в woff2. У товара с фото — фото товара |
| Next: тесты | `test/navigation.ts` — подмена `next/navigation` в памяти (`navigation.setUrl`, `navigation.history` с push/replace), подключена в `setup.ts`; там же `setI18n(getI18n('ru'))` для компонентов без провайдера. `test/render.tsx` → `renderPage(ui, '/kk/...')` (язык из префикса, QueryClient без ретраев). Клик по `next/link` в jsdom пишет «Not implemented: navigation» — безвредно. `proxy.test.ts` — `// @vitest-environment node`, `new NextRequest(...)` |
| Скелетоны | По просьбе пользователя (сессия 12): `components/ui/Skeleton.tsx` — `Skeleton`, `ProductCardSkeleton` (геометрия `ProductCard`, testid `product-card-skeleton`), `ProductGridSkeleton({count, wide})` (сетка `ProductGrid`), `ChipsSkeleton` (категории). `animate-pulse bg-surface`, `motion-reduce:animate-none`. `LoadingState` с children — скелетон под `aria-hidden`, «Загружаем…» — `sr-only`, testid `loading-state` прежний. Использованы в каталоге; в сессии Next 3 — скелетоны страниц товара/категории/поиска/дашборда и `loading.tsx` для динамических роутов |
| Next: страницы с данными | Товар `products/[id]` — **ISR**: `revalidate = 3600`, `generateStaticParams = () => []` (при сборке не строится и в API не ходит, строится при первом заходе). Категория `collections/[slug]` — **динамическая** (`searchParams` → в HTML уже отфильтрованный список). Каталог и «Аналитика» — статика + `revalidate = 3600` (**в http-режиме `next build` ходит за ними в API** — учесть при деплое). Поиск — статичная оболочка, `SearchPage` в `Suspense` (fallback — скелетон), `noindex, follow`, во вкладке просто «Поиск» (запрос сервер не видит, а клиентский `<title>`/`document.title` перебивает metadata Next). Серверные геттеры — `api/server.ts` (React `cache`: metadata и страница делят запрос) и `notFoundOn404` (404 API → `notFound()`, прочие ошибки пробрасываются — ISR оставит прежнюю версию; UI — `(site)/error.tsx`, проп **`retry`**, не `reset`). Данные кладутся `setQueryData` по ключам из `queries.ts` (`categoryFiltersQuery`, `productPagesQuery` — `infiniteQueryOptions`, общий для хука и `fetchInfiniteQuery`). Views получают `id`/`slug` пропом |
| Next: без `loading.tsx` | Сознательно: `loading.tsx` включает стриминг, статус 200 уходит раньше `notFound()` → несуществующий товар/категория отдают **200 + noindex** вместо 404, а HTML начинается со скелетона. Без него — честный 404 и контент сразу. Скелетоны по форме страниц (`ProductPageSkeleton`, `CategoryPageSkeleton`, `ProductListSkeleton`, `DashboardSkeleton`) — для клиентских загрузок внутри views. Цена: переход на категорию (динамика, без prefetch) ждёт сервер без индикатора — можно добавить `useLinkStatus` |
| Next: фильтры/сортировка | URL меняют через `lib/urlState.ts` `replaceQuery` → `window.history.replaceState` (Next синхронизирует `useSearchParams`), а не `router.replace` — иначе динамическая категория перестраивалась бы на сервере на каждый клик. В тестах `installHistory()` (`test/navigation.ts`) пишет replaceState в `navigation.history`; `setUrl` синхронизирует и `window.location` jsdom. LanguageSwitch — `prefetch={false}` (иначе предзагрузка страницы на втором языке при каждом показе) |
| Next: карта | `StoreMap` — `next/dynamic(..., { ssr: false, loading })` в `views/DashboardPage.tsx`; в unit-тестах `vi.mock` модуля работает и через dynamic |
| Цвета сетей | `lib/stores.ts`: DINA `#2a78d6`, DANA `#eb6834`, FIX_PRICE `#4a3aa7` (прошли валидатор dataviz: CVD/контраст), неизвестная сеть — `#697178`. Зелёный для сетей не используем |
| Карточка (D2) | Вариант A: фото квадрат (`rounded-media`, бейдж «−X%» по лучшему предложению — `discountPercent`, вниз, < 1% не показываем) → цена `text-price-card` + старая → `SavingLine` → бренд → название → **топ-3 сетей** (`topOffers` в `lib/offers.ts`) → `more-offers` «ещё N сетей · до X ₸» (плюралы `card.moreOffers_*`) → дата. Без рамки, `hover:shadow-hover`. `ProductImage` больше не скругляет сам — радиус передаёт вызывающий |
| Оболочка (D3) | Раздел навигации — `navSection(pathname)` в `lib/paths.ts` (`catalog` — также `/collections/*`, `/products/*`). Шапка: `card`, без blur; мобильный — лого + RU/KZ, вторая строка поиск; разделы `hidden md:flex`, активный — `ink` + подчёркивание 2px (`after:`), прочие `muted`. `TabBar` (`components/layout/TabBar.tsx`, `< md`): `nav` `nav.main`, testid `tab-bar`/`tab-catalog`/`tab-search`/`tab-dashboard`, иконки `grid`/`search`/`chart`, активный `ink` 600 + `aria-current="page"`. Отступ под таб-бар — у `body` через `body:has([data-tab-bar])` в `globals.css` (футер идёт после `Main`, поэтому не `Main`). Серый фон — обёртка `SitePage` (`bg-page`) в layout `(site)` и `not-found`; лендинг белый. Отступ до футера — `Main` `pb-12 md:pb-20` (у `Footer` больше нет `mt-20`; футер `bg-card`). `viewport-fit=cover` (`export const viewport`), `container-page` — `max(16px, env(safe-area-inset-*))`. `SearchBox` ставит фокус в поле при клиентском переходе на `/search` без `q` (при первой загрузке — нет). `Segmented` — сегменты `h-10 md:h-9`. e2e `e2e/shell.spec.ts`: таб-бар на iphone, его нет на desktop, нет горизонтального скролла на 320/360/390 |
| Сетка (D2→D4a) | Классы раскладки — `components/product/layout.ts` (`productGridClass(wide)`: 2 колонки, с md — 3, `wide` → с lg 4) и `components/catalog/layout.ts` (`CATEGORY_TILES`, `TILE_SHAPE`), общие со скелетонами. Скелетоны: `ProductCardSkeleton`, `CategoryTilesSkeleton` (вместо `ChipsSkeleton`), `CategoryPageSkeleton`/`ProductListSkeleton({filters})` под новую раскладку. Полка (`Shelf`, `ShelfSkeleton`, `SHELF_ROW`, compact-карточка, `card.savingShort`) удалена в D4a |
| Страницы (D4b) | **Товар:** фото в белой карточке (sticky ≥ md), плейсхолдер — иконка категории (`ProductImage icon`, `muted`; в сетке — прежний ценник). На мобильном цена **над** h1 через `order` (в DOM h1 первый). `text-price-page` + `Badge discount` + старая цена, `SavingLine`. «Цены в магазинах» (текст `card.offers` не меняли) — белая карточка: точка цвета сети (`data-store-dot`), лучшая строка `accent-soft` + `Badge best` белой таблеткой (`bg-card!` — на `accent-soft` бейдж сливался), остальные «дороже на X», одно предложение — `Badge neutral`. Видны 5 (`OFFERS_VISIBLE`), больше — `Button ghost` «Показать все N» (`show-all-offers`, `product.showAll`), после клика фокус на 6-ю строку. Характеристики — карточка, `dl` в 2 колонки с md. **Состояния:** `StateCard` (`ui/States.tsx`) — белая карточка по центру, иконка 32px `muted`; `ErrorState` (`alert`, «Повторить» `secondary`), `EmptyState` (проп `icon`, по умолчанию `search`; категория — `sliders`/`basket`), 404 — та же карточка с h1 и `Button primary` в каталог; ссылки в каталог из пустого поиска — `Button secondary`. **Аналитика:** h1 `text-h1`, секции `text-h2`, отступы 32/48; сводка и корзины на `card` (лучшая — `accent-soft`), карта + список точек — одна карточка, разброс — список в карточке. Скелетон «Аналитики» — белые `CardSkeleton` (surface на сером `page` не виден). `ProductImage` при монтировании проверяет `complete && naturalWidth === 0` (картинка упала до гидрации). `Chip` — `disabled:opacity-50`, hover только `not-disabled`. `rounded-[var(--radius-*)]` в коде больше нет |

Моки и типы приведены к **подтверждённому** контракту Backend 1 (см. `05_FRONTEND_ANSWERS_FROM_BACKEND_1.md`).

---

## План сессий

| # | Задача | Статус |
|---|---|---|
| 0 | Изучение docs, вопросы бэку, этот файл, git-ветка | ✅ |
| 1 | **Каркас + дизайн-система.** Vite/TS/Tailwind/Router/Query/i18n/Vitest/Playwright; DTO-типы; моки (categories, filters, products, dashboard, meta); `catalogApi` mock+http; дизайн-направление (skill frontend-design) → токены, шрифты, логотип; Layout: header (лого, поиск, язык, dashboard), footer, плашка даты | ✅ |
| 2 | **Каталог и категория.** ProductCard, главная, `/collections/:slug`, DynamicFilters, сортировка, «Показать ещё», loading/empty/error, image fallback; unit-тесты (ProductCard, filters, empty) | ✅ |
| 3 | **Поиск + страница товара.** `/search?q=` с debounce, `/products/:id` (картинка, бренд, атрибуты, offers, min price) | ✅ |
| 4 | **Dashboard.** Summary cards, price spread list, карта Leaflet с маркерами по сетям | ✅ |
| 5 | **Полировка.** Responsive (desktop + iPhone), kk-переводы, Playwright E2E основного flow, `pnpm build`, консоль без ошибок | ✅ (Lighthouse не прогонялся) |
| 6 | **Интеграция с реальным API** (после ответов бэка / merge): http-адаптер, правки DTO, прогон E2E | ✅ против `feat/backend-1` (fixtures); повторить после подключения датасета backend-2 |
| 7 | Деплой | не наша зона |
| 8 | Лендинг на `/` | ✅ (тексты — за пользователем) |
| 9 | Корзина на «Аналитике» | ✅ контракт согласован (08), проверено против бэка на фикстурах |
| 10 | План переезда на Next.js (ради SEO) — `08_NEXTJS_MIGRATION_PLAN.md` | ✅ |
| 11 | **Next 1. Каркас и перенос** (шаги 1–3): `frontend-next/`, lib/api/components, unit-тесты зелёные | ✅ |
| 12 | **Next 2. Язык и роутинг** (шаги 4–5): `/ru`, `/kk`, middleware, Layout, Landing + Catalog | ✅ (+ скелетоны загрузки) |
| 13 | **Next 3. Страницы с SSR** (шаги 6, 8): Category, Product, Search, Dashboard (+ скелетоны) | ✅ (без `loading.tsx` — ради статуса 404) |
| 14 | **Next 4. SEO** (шаг 7): metadata, hreflang, JSON-LD, sitemap, robots, OG | ✅ (адрес сайта — env, домена пока нет) |
| 15 | **Next 5. e2e и переключение** (шаги 9–10): итоговый `frontend/` | ✅ Production Part 01, external review pending |
| 16 | **Дизайн D1–D4** (спека `docs/superpowers/specs/2026-10-02-design-system-design.md`): D1 токены, D2 карточка, D3 оболочка, D4a каталог + категория, D4b товар/поиск/аналитика/состояния | ✅ |

---

## Статус контракта с бэком

- Вопросы отправлены: ✅
- Ответы получены: ✅ 2026-09-23 (`05_FRONTEND_ANSWERS_FROM_BACKEND_1.md`)
- Расхождения поправлены в типах/моках/адаптерах: ✅ (сессия 1, дополнение)

---

## Журнал

### Production Part 01 — 2026-10-03

- Fail-closed HTTP/site configuration, без silent mock/localhost production fallback.
- Runtime-rendering каталога/Dashboard/sitemap через Next `connection()`;
  bounded tagged GET cache, SSR/SEO сохранены, build с недоступным API PASS.
- Data-agnostic HTTP E2E для ru routes; mock/HTTP suites изолированы.
- Pre-switch: typecheck/lint PASS, 179 unit (34 файла), mock E2E 47 PASS/3
  platform skips, real NestJS/Supabase E2E 12 PASS, real ru/kk SSR/SEO PASS.
- После pre-switch gates старый source удалён, Next перенесён в `frontend/`;
  локальный ignored .env сохранён без изменения, legacy generated файлы вне repo.
- Final-path проверки и archive hygiene: см. canonical Production Part 01 report.
  Unit suite выполняется на byte-identical native-WSL copy: /mnt/d worker issue
  известен из Part 00; timeout/dependencies не менялись.
- Backend/data/schema/voice не менялись. Supabase только READ-ONLY.
  Commit/push/deploy не выполнялись. Следующий Part не начат.

### Сессия 19 — 2026-10-02 (SEO-аудит и оптимизация)
- Аудит: прод-билд с `NEXT_PUBLIC_SITE_URL=https://adilbaga.kz`, curl HTML, Lighthouse (mobile) на каталоге, категории, товаре, «Аналитике», поиске. Технический SEO уже был 100; тормозили FCP/LCP (CSS блокировал отрисовку, 6 файлов шрифтов находились только после CSS), CLS поиска, порядок заголовков в категории.
- **Шрифты → `next/font/google`** (`src/app/fonts.ts`, переменные `--font-golos`/`--font-montserrat` на `<html>`, `@fontsource` из `globals.css` убран; пакеты остались — ими рисует `scripts/generate-og.mjs`). Preload всех наборов, которые нужны на каждой странице: latin-ext (₸, ğ) и cyrillic-ext (казахские буквы), иначе первая отрисовка ждала их отдельным кругом. Сборке нужен доступ к fonts.googleapis.com.
- `next.config.ts`: `experimental.inlineCss` (CSS ~8 КБ в HTML, без блокирующего запроса), `poweredByHeader: false`.
- **Поиск — динамическая страница**: читает `?q=` на сервере → во вкладке «Поиск: «…»» (регрессия из «Следующего шага» закрыта), HTML сразу в нужном состоянии, CLS 0.147 → 0. `SearchPageFallback` удалён. В `TabBar` у ссылки на поиск `prefetch={false}`: Next переиспользовал заранее загруженный `/search` без q, и заголовок вкладки не менялся (видно на iPhone в e2e).
- Скрытый `h2` «Товары» над сеткой в категории и поиске (у карточек `h3`) — a11y категории 98 → 100.
- Metadata: `googlebot` `max-image-preview:large, max-snippet:-1` (в layout; `index/follow` не пишем — на 404 Next ставит noindex сам), `og:title` с брендом, title каталога (главной) — `brand.title` вместо «Каталог». JSON-LD: `Organization` + `WebSite` на каталоге (`siteJsonLd`), `url` у `Product`.
- Итог Lighthouse (mobile, localhost): SEO 100 / A11y 100 на всех индексируемых страницах (поиск — 63 из-за noindex, так задумано), Performance 81–86 → 86–88, FCP 2.4 → 1.0 с, CLS 0 везде. LCP в симуляции ~3.9 с: в трейсе он 0.26 с, но Lantern добавляет загрузку ~130 КБ JS (React + Next), которая стартует раньше. Best Practices категории 96 — только на моках (намеренно битая картинка `example.invalid`).
- Не сделано, осознанно: SSR-тело 404 — Next 16 при `notFound()` в рендере отдаёт оболочку `__next_error__`, текст рисует клиент; статус 404 и noindex верные, на SEO не влияет. `ItemList` в категории — Google не показывает по нему товарные карусели для таких сайтов.
- Тесты: structuredData +1 (siteJsonLd) и `url`, e2e seo +2 (главная: title, googlebot, @graph; поиск: noindex и запрос в title), обновлены ожидания title каталога (smoke) и поиска (pages). Проверено: typecheck, lint 0, 165 unit, build, e2e 47 passed + 3 skipped (`PW_CHANNEL=chrome` — браузер Playwright не скачан), скриншот kk-каталога 390: шрифты Golos/Montserrat, ₸ и казахские буквы на месте.
- Замечено попутно (дизайн, не трогал): плитка «Масло растительное» на 390 переносит слово как «растительно / е».
- Не закоммичено.

### Сессия 18 — 2026-10-02 (Дизайн D4b. Товар, поиск, аналитика, состояния)
- План — `docs/superpowers/plans/2026-10-02-design-system-d4b-pages.md`. Детали — строка «Страницы (D4b)» в таблице решений. Закрыты хвосты ревью D1–D3: радиусы-токены, иконка категории вместо плейсхолдера фото (на странице товара), картинка, упавшая до гидрации, `Chip disabled`.
- Коммиты: 5707197 states/404; 458fb69 ProductImage; 53078f2 product page; 0803414 dashboard, chip, radii; 201e3b3 white pill badge.
- Тесты: `States.test` (3), `ProductImage.test` (4), ProductPage +3 (точки и бейдж, 7 предложений → «Показать все 7» + фокус, одно предложение без зелёного), 404 — ссылка в каталог, Chip disabled.
- Проверено: typecheck, `rtk proxy pnpm lint` 0, 164 unit (33 файла), `next build`, e2e 43 passed + 3 skipped. Скриншоты prod :3100 (скрипт Playwright из `frontend-next/`, импорт из `@playwright/test`) — товар 320/390/1280, поиск (пустой и без результатов), «Аналитика» 390/1280, 404: по спеке, горизонтального скролла нет.
- Отступление от спеки: заголовок блока — прежний «Цены в магазинах» (`card.offers`), а не «Цены в сетях» — тексты не трогали.

### Сессия 17 — 2026-10-02 (Дизайн D4a. Каталог и категория)
- План — `docs/superpowers/plans/2026-10-02-design-system-d4a-catalog-category.md`. Полка удалена (решение после D3), в каталоге плитки категорий с иконками и сетка «Самая большая разница в цене» со «Показать ещё»; категория — сайдбар-карточки на ≥ lg, шторки фильтров и сортировки на мобильном. Детали — строки «Каталог», «Категория», «Сетка» в таблице решений.
- По просьбе пользователя по ходу сессии: кнопка **«Назад»** на странице категории; **лендинг удалён** (строка «Лендинг»); починен глиф плейсхолдера фото — в пути было `l-6-7 … l6-7` вместо `l-6-8`, `Z` замыкал контур вертикалью и сверху торчал острый угол.
- Отступление от спеки: `sort-select` только у `<select>`, у мобильного чипа — `sort-chip` (два одинаковых testid ломают strict-режим Playwright).
- Проверено: typecheck, `rtk proxy pnpm lint` 0, 153 unit (31 файл, два прогона), `next build`, e2e 43 passed + 3 skipped. Скриншоты (prod :3100, отдельный скрипт Playwright — окно MCP-браузера на Windows 125% даёт viewport 312px): каталог 320/390/1280, категория 390 (+ обе шторки) / 1024 / 1280 — по спеке, горизонтального скролла нет.
- Заметки: в логе webServer e2e — `Error: The destination stream closed early` (сервер Next, тесты зелёные; вероятно, обрыв prefetch/стрима при закрытии страницы) — не разбирался. `python` в этом окружении — заглушка Windows Store, для скриптов использовать `node`; `npx prettier` без конфига переформатирует файлы — форматтера в проекте нет, не запускать.

### Сессия 16, продолжение — 2026-10-02 (Дизайн D3. Оболочка)
- План — `docs/superpowers/plans/2026-10-02-design-system-d3-shell.md`. Шапка в новом стиле, нижний таб-бар на мобильном, серый фон страниц сайта, футер на `card`, safe-area. Детали — строка «Оболочка (D3)».
- Коммиты: b0401b5 TabBar + navSection; 69ab763 header; 5d9e5f5 grey pages, layouts, safe-area, e2e shell.
- Проверено: typecheck, `rtk proxy pnpm lint` 0, 156 unit (32 файла), `next build`, e2e 41 passed + 3 skipped (сценарии только для одной платформы). Горизонтального скролла на 320/360/390 нет (проблема шапки из D2 ушла). Скриншоты: каталог мобильный и категория 1280 — по мокапу.

### Сессия 16 — 2026-10-02 (Дизайн D2. Карточка и полка)
- План — `docs/superpowers/plans/2026-10-02-design-system-d2-card-shelf.md`. Карточка варианта A (топ-3 сетей, «ещё N сетей · до X ₸», бейдж «−X%», compact), сетка 2 колонки на мобильном, `Shelf` в каталоге вместо сетки топ-8, скелетоны под новую геометрию. Детали — строки «Карточка (D2)» и «Сетка и полка (D2)».
- Коммиты: 69ec5f7 topOffers/discountPercent; de024f7 card variant A; a3213e7 grid and card skeletons; 5ac0574 Shelf; 42654fe Button regex fix (из ревью D1).
- Проверено: typecheck, `rtk proxy pnpm lint` 0, 145 unit (31 файл), `next build`, e2e 38/38 (desktop + iphone, моки). Скриншоты каталога 1280 и ~375, категории ~312: карточка как в мокапе, полка листается, кнопки ‹ › видны на desktop.
- Найдено попутно (не D2): на узком экране (< ~370px) страницу распирает **шапка** (строка лого + «Аналитика» + RU/KZ) — горизонтальный скролл; уйдёт в D3. Картинка, упавшая **до гидрации** (в моках `example.invalid/broken.jpg`), показывает alt-текст вместо плейсхолдера — `onError` не успевает; поправить в D4 (проверка `img.complete && naturalWidth === 0` при монтировании).

### Сессия 15 — 2026-10-02 (Дизайн D1. Токены и примитивы)
- Токены (`page`/`card`/`surface`/`line`/`ink`/`muted`/`accent`/`danger`/`tile-1…5`, радиусы, тени, шкала `text-*`, base 15px) и примитивы `components/ui/`: Button (primary/secondary/ghost, 44px), Chip, Badge, Segmented (RU/KZ — таблетка), Icon (линейный набор), Sheet (нижняя шторка на нативном `<dialog>`). Фон `body` в D1 остаётся белым (`bg-card`), серый `page` включается в D3. Фокус — графитовая рамка 2px.
- Коммиты: e7ca6c8 design tokens — card/page split, type scale, radii; 43798e6 logo glyph uses card token; 188c614 Button primitive; 766314f allow class-helper exports in lint; dff4840 Chip and Badge; 7348123 Segmented, pill language switch; 676f88f line icon set; 537d7ca bottom Sheet on native dialog.
- Заметки: lint разрешает экспорт class-helper'ов (`buttonClass`, `chipClass`, `segmentClass` в `.oxlintrc.json` → `allowExportNames`); в `test/setup.ts` — заглушка `<dialog>` для jsdom; i18n-ключ `common.close`.
- Проверено: typecheck, `rtk proxy pnpm lint` 0, 127 unit (29 файлов), `next build`. Скриншоты `/ru`, `/ru/catalog`, товар на 390 и 1280 (prod, :3100): фон белый, шапка и карточки белые, фокус по Tab — графитовая рамка, RU/KZ — таблетка, серых «дыр» нет. Блокировку прокрутки под шторкой проверить в D4 (потребителей пока нет).

### Сессия 14 — 2026-10-02 (Next 4. SEO)
- Metadata всех индексируемых страниц (description, canonical, hreflang ru/kk/x-default, Open Graph, Twitter card), JSON-LD `Product` + `AggregateOffer` и `BreadcrumbList`, `sitemap.xml`, `robots.txt`, OG-картинки на оба языка. Детали — строки «Next: metadata / SEO-адрес / JSON-LD / sitemap/robots / OG-картинка» в таблице решений.
- Новое: `lib/site.ts`, `lib/seo.ts`, `lib/structuredData.ts`, `components/seo/JsonLd.tsx`, `app/sitemap.ts`, `app/robots.ts`, `scripts/generate-og.mjs` (`pnpm og`), `public/og/*.png`, ключи `meta.*` в ru/kk, `NEXT_PUBLIC_SITE_URL` в `.env.example`, раздел SEO в README.
- Тесты: seo (4), structuredData (4, вкл. экранирование `</script>`), sitemap + robots (3, node-окружение, моки). E2E `e2e/seo.spec.ts` (5): теги товара на kk, JSON-LD, canonical категории без фильтров, описания и canonical лендинга/каталога/дашборда, sitemap/robots, OG-картинка.
- Проверено: typecheck, oxlint 0, 107 unit, `next build` (без env — одно предупреждение; с `NEXT_PUBLIC_SITE_URL=https://example.kz` — canonical и `Sitemap:` на этом домене), curl товара/категории/лендинга/каталога/дашборда/поиска/404, sitemap — 76 URL (2 × (3 + 5 категорий + 30 товаров)), E2E 36 passed (desktop+iPhone). OG-картинки просмотрены.
- Заметка: `pnpm lint` через rtk-хук переписывается в eslint — запускать `rtk proxy pnpm lint`.
- **Дополнение по просьбе пользователя: кнопка «Назад» на странице товара** (слева от крошек). `components/layout/BackLink.tsx` — ссылка на категорию товара (работает без JS и при заходе извне); если в этой вкладке уже был переход внутри сайта — `router.back()` (категория возвращается с фильтрами). Признак перехода — `lib/inAppHistory.ts` (`useTrackInAppNavigation` в `Providers`, смена языка не считается). Ctrl/Shift/Cmd-клик — обычная ссылка. Ключ `nav.back` (Назад / Артқа). Тесты: ProductPage (+2), inAppHistory (1), E2E «Назад» с фильтром и при прямом заходе. 110 unit, E2E 38 passed.

### Сессия 13 — 2026-10-02 (Next 3. Страницы с SSR)
- Перенесены Category, Product, Search, Dashboard в `src/views` + роуты `[lang]/(site)/` `collections/[slug]`, `products/[id]`, `search`, `dashboard`; `(site)/error.tsx`, `api/server.ts`, `lib/urlState.ts`. Детали — строки «Next: страницы с данными / без loading.tsx / фильтры / карта» в таблице решений.
- `loading.tsx` сделаны и **убраны**: со стримингом несуществующие страницы отдавали 200 (+noindex). Проверено curl: без них — 404, HTML без скелетона.
- Скелетоны по форме страниц товара, категории, «Аналитики» и сетки поиска.
- Тесты: views Category (8, вкл. рендер серверного роута с фильтрами без состояния загрузки и 404), Product (7), Search (4), Dashboard (9). E2E `e2e/pages.spec.ts`: HTML товара/категории (с фильтрами)/дашборда, `noindex` поиска, 404 товара и категории, путь каталог → категория → фильтр (без запроса к серверу Next) → товар → крошки, поиск из шапки + сортировка, карта с 8 маркерами; без ошибок консоли (кроме офлайн-картинок моков).
- Проверено: typecheck, oxlint 0, 96 unit, `next build` (товар — SSG без путей, категория — ƒ, остальное — SSG), E2E 26 passed (desktop+iPhone), скриншоты 1280/390 — вёрстка как в старом фронте. В логе сервера при e2e бывает «destination stream closed early» — оборванный при переходе prefetch, безвредно.
- Регрессия: во вкладке поиска «Поиск — Adil Bağa» без текста запроса.

### Сессия 12 — 2026-10-02 (Next 2. Язык и роутинг)
- `src/proxy.ts` (редиректы `/` 307 и старых URL 308), `app/[lang]/layout.tsx`, лендинг `/[lang]`, каталог `/[lang]/catalog` с серверным prefetch, 404 через `[...rest]` + `[lang]/not-found.tsx`. Временные `app/layout.tsx` и `app/page.tsx` удалены. Детали — строки «Next: …» в таблице решений.
- Перенесены Header, LanguageSwitch (теперь ссылки + cookie), SearchBox (`next/navigation`, Suspense + fallback), SkipLink/Main, LandingPage, HomePage → `views/CatalogPage`, NotFoundPage. Префикс языка во всех ссылках (ProductCard, Baskets, Logo, лендинг, каталог, шапка).
- i18n: по экземпляру на язык из префикса URL, localStorage убран.
- **По просьбе пользователя — скелетоны загрузки** (см. «Скелетоны»); на каталоге видны только если серверный prefetch не удался — данные обычно уже в HTML. Скриншот 1280: геометрия совпадает с карточками.
- Тесты: `test/navigation.ts` + `renderPage`; новые — paths (3), proxy (7), Header (6: ссылки, поиск push/replace с сохранением sort, язык + cookie, перенос фильтров, skip-link), LandingPage (3), CatalogPage (3, вкл. скелетон). E2E `smoke.spec.ts` переписан: редиректы, SSR-HTML каталога на kk, лендинг → каталог → смена языка без ошибок консоли, 404.
- Проверено: typecheck, oxlint 0, 66 unit, `next build` (SSG `/ru`, `/kk`, `/ru/catalog`, `/kk/catalog`), E2E 10 passed (desktop+iPhone), вручную в браузере — переключение языка, `<html lang>`, cookie, 404 на kk. Hydration-ошибка `caret-color: transparent` — артефакт скриншота Playwright, без скриншота консоль чистая.
- Не перенесены (сессия Next 3): Category, Product, Search, Dashboard (+ StoreMap через `next/dynamic`), их тесты.

### Сессия 11 — 2026-10-02 (Next 1. Каркас и перенос)
- `frontend-next/` через `create-next-app@16.3.8` (TS, Tailwind 4, App Router, `src/`), версии зависимостей — как в `frontend/` (TS 6, Vitest 5, oxlint, Playwright). `pnpm-workspace.yaml` от шаблона удалён (pnpm падал на пустом `packages`). `AGENTS.md`/`CLAUDE.md` шаблона оставлены — `next dev` их пересоздаёт.
- Перенесены без изменений логики: `api/*`, `lib/*` (кроме `useDocumentTitle` — заменит `generateMetadata`), `mocks/`, `scripts/generate-mocks.mjs`, `i18n` (ru/kk), компоненты `catalog`, `dashboard` (Baskets, StoreMap), `product`, `ui`, `layout/Logo` и `Footer`, `index.css` → `app/globals.css`, favicon → `app/icon.svg`. `react-router` `Link to` → `next/link` `href` (ProductCard, Baskets, Logo; ссылки пока без префикса языка).
- **Не перенесены (сессия Next 2):** Header, Layout, LanguageSwitch, SearchBox, все pages, `test/render.tsx`. i18n временно с фиксированным `ru`, без localStorage.
- `catalogApi`: `createCatalogApi(env, isServer)` + тест (3). Временные `app/layout.tsx` (html lang=ru, Providers, Footer) и `app/page.tsx` (async server component: топ-8 разброса из `catalogApi` → `ProductGrid`) — проверка, что карточки с ценами приходят в HTML.
- oxlint (1.86) новое правило `react/purity` на `new Date()` в Footer — отключено комментарием; `only-export-components` разрешает `metadata`/`generateMetadata`/`viewport`/`revalidate`.
- Проверено: typecheck, oxlint 0 предупреждений, 44 unit-теста (lib, api, DynamicFilters, ProductCard), `next build`, `curl` — 8 карточек с ценами и ссылками в HTML, E2E `e2e/smoke.spec.ts` 4 passed (desktop+iPhone: SSR-HTML, гидрация без ошибок консоли), скриншот 1280 — вёрстка и шрифты как в старом фронте.
- Заметка: `python` в этой среде — заглушка Windows Store (молча ничего не делает), скрипты — через `node -e`.

### Сессия 10 — 2026-10-02
- Проект выиграл конкурс, покупается домен → нужно SEO. Решено переехать с Vite SPA на **Next.js (App Router)**. Бэк переезжает на Go — не наша зона, контракт по-прежнему через Backend 1; для фронта это смена адреса API в `catalogApi`.
- Решения пользователя: язык в URL-префиксе **`/ru` и `/kk`** (localStorage больше не источник языка); новый проект **`frontend-next/` рядом** со старым, `frontend/` живёт до переключения.
- План: `docs/context/08_NEXTJS_MIGRATION_PLAN.md` (10 шагов, 5 сессий, строки 11–15 в «Плане сессий»). Код не менялся.
- Отложено на после переезда: on-demand ревалидация (бэк дёргает `/api/revalidate` после обновления цен), страницы магазинов `/[lang]/stores/[slug]` под придомовые магазины, разбиение sitemap.

### Сессия 8 — 2026-09-25
- **Продуктовая корзина на «Аналитике»** по просьбе пользователя (детали — «Корзина» в таблице решений). Решения пользователя: корзина по категориям (самый дешёвый товар в каждой), считает бэк — вопросы в `docs/context/07_FRONTEND_QUESTIONS_BASKET.md`, пользователь отправит. Фронт сделан на моках, не дожидаясь ответа.
- `scripts/generate-mocks.mjs` генерирует `baskets` (изменился только `dashboard.json`).
- Нестабильный `SearchPage › searches while typing` (падал в 2 из 5 полных прогонов) — таймауты `expect.poll` 3 → 5 с.
- Проверено: typecheck, oxlint, 75 unit-тестов (+ baskets 3, DashboardPage 4), 3 полных прогона подряд зелёные, build, E2E 17 passed + 1 skipped (+ подписи корзины на карте), скриншоты дашборда и карты 1280/iPhone.
- Лендинг закоммичен `1c6a617`; корзина не закоммичена.
- **Когда бэк ответит:** сверить формат с `types.ts`, поправить генератор моков, при приблизительном составе — добавить оговорку под блоком; прогнать `E2E_API=http`.

### Сессия 9 — 2026-09-25
- Бэк ответил (`PART_05_REPORT.md`, `08_FRONTEND_ANSWERS_BASKET.md` в `integrate/full-stack`): формат `baskets` принят без изменений, состав урезан до 3 позиций, у DINA на реальных данных ни одной позиции.
- Добавлено состояние «Нет данных» для пустой корзины (карточка, подпись на карте, popup, список точек). Моки не менялись — в них по-прежнему 5 позиций и неполная корзина у Fix Price.
- `e2e/http.spec.ts`: тест корзины (ожидания из API, «Нет данных» для пустой, подписи у точек сетей с корзиной); пропускается, если бэк не отдаёт `baskets`.
- Проверено: typecheck, oxlint, 77 unit-тестов (3 прогона подряд), E2E на моках 17 passed + 1 skipped. Бэк `integrate/full-stack` поднимался во временном worktree на фикстурах (`DATA_SOURCE=fixture`, к Supabase доступа нет): `E2E_API=http` 14 passed, скриншот дашборда. Живую базу не проверяли.
- Подпись под заголовком корзины без списка позиций (по просьбе пользователя): `categoryName` с бэка — названия категорий («Молочные продукты»), а не позиций («молоко 1 л»). Позиции видны в «Составе корзины».

### Сессия 7 — 2026-09-25
- **Лендинг** для хакатона на `/`, каталог переехал на `/catalog` (решение пользователя). Ссылки «Каталог» в крошках, 404 и пустом поиске → `/catalog`; логотип ведёт на лендинг. Детали — «Лендинг» в таблице решений.
- Тексты: пробовали переписать «как маркетолог» — пользователь вернул первую версию и будет править сам; затем «дешевле» → «выгоднее» (kk «арзан» → «тиімді»).
- Тесты: `LandingPage.test.tsx` (3), Layout-тесты каталога и E2E (smoke/http/polish) переведены на `/catalog`, новый E2E «лендинг → каталог → логотип».
- Проверено: typecheck, oxlint, 68 unit-тестов, build, E2E 23 passed + 1 skipped (desktop+iPhone), отсутствие горизонтального скролла на iPhone (/, /catalog, /dashboard — временным spec), скриншоты 1280/390.
- По ходу по просьбе пользователя: убрана шапка на лендинге (кроме выбора языка), плашка «Пример», хвост «— в одном окне», подпись «Әділ баға — …» → «Adil Baga». Тесты, которым нужна шапка, открывают `/catalog`.

### Сессия 6 — 2026-09-24
- Состояние бэка: `origin/main` — только initial commit. `feat/backend-1` — NestJS API (Part 02 каталог/дашборд, Part 03 голос), **но на fixtures**: 1 категория (`milk`), 2 товара, 2 демо-точки. `feat/backend-2` — Prisma + скрейперы + `data/snapshots/final_dataset.json` (121 canonical, 243 raw, **кросс-матчей всего 3**, категории milk/bread/sugar/oil/eggs/tea/groceries/other), API нет. Реальный DB-адаптер в backend-1 не подключён.
- Бэк запускался из worktree `origin/feat/backend-1` (`pnpm install && pnpm build && pnpm start`, :3000). Все эндпоинты отвечают по контракту 05; 404/400 — формат NestJS.
- Расхождения с типами фронта (из `backend/src/contracts/catalog.ts`): `attributes` допускает `null`, `options` — optional и может содержать boolean. Поправлены `types.ts`, `filterParams`, `DynamicFilters`, `ProductPage` (см. таблицу решений).
- Под реальные данные: товар с одним предложением больше не подсвечивается как «самый дешёвый» (см. «Одно предложение»). ru+kk: `product.price`, `product.onlyStore`.
- **По просьбе пользователя:** на дашборде убраны % и полоса разброса; футер — без фразы о снимке, справа «© 2026 Все права защищены»; логотип — починен незамкнутый контур (торчал угол), остриё симметрично; шрифт цен/логотипа Unbounded → Onest → **Montserrat** (Onest показался невыразительным); главная: заголовок «Где сегодня выгоднее», подпись под «Самая большая разница в цене» удалена (`home.dealsHint`, `dashboard.difference` удалены).
- `e2e/http.spec.ts` + режим `E2E_API=http` в `playwright.config.ts`; README дополнен.
- Проверено: typecheck, oxlint, 65 unit-тестов, build, E2E mock 15 passed + 1 skipped, E2E http 12 passed (desktop+iPhone), скриншоты товара и дашборда на живом API, консоль без ошибок.

### Сессия 5 — 2026-09-23
- **По просьбе пользователя** строка выгоды: предложение графитом, сумма зелёным (`SavingLine`, см. таблицу решений).
- `document.title` на всех страницах (`useDocumentTitle`), skip-link, ключи `brand.title`, `nav.skip` (ru+kk).
- `tsconfig.app.json`: `lib` + `DOM.Iterable` — `tsc -b` падал на `[...HTMLCollection]` в `DashboardPage.test`, раньше это скрывал инкрементальный кэш.
- Проход в браузере 390/768 (ru и kk): переносов и непереведённых строк нет. Подписи фильтров/категорий/товаров остаются русскими — они приходят с бэка. Хардкода кириллицы в TSX нет (кроме `Рус/Қаз`).
- E2E `e2e/polish.spec.ts`: kk + запоминание языка + заголовок, 404 товара, пустой поиск и очистка поля, skip-link (только desktop).
- GitHub: ветка `main` уже была (на initial commit), сделана дефолтной через API (у `gh` нет установки — токен из git credential manager).
- Проверено: typecheck, oxlint, 63 unit-теста, build, E2E 15 passed + 1 skipped (desktop+iPhone), консоль — только ожидаемый битый URL из моков.
- Закоммичено и запушено в `feat/frontend`: `3e10071`.

### Сессия 4 — 2026-09-23
- **`/dashboard`** (`pages/DashboardPage.tsx`; `StubPage` и ключ `stub.soon` удалены): summary, разброс цен, карта + список магазинов (детали — «Dashboard» в таблице решений). Зависимости: `leaflet`, `react-leaflet` 5, `@types/leaflet`.
- `lib/stores.ts` (цвет сети, `locationKey`, `groupByStore`), `formatPercent` в `lib/format.ts`. i18n ru+kk: `dashboard.*` (плюралы `points_one/few/many/other`).
- Мобильный: значения плиток 22px (иначе «24.09.2026» упирается в край на 390px).
- Нестабильный тест `SearchPage › searches while typing` (дефолтный таймаут `expect.poll` 1 с под нагрузкой не хватало) — таймаут 3 с. `.vitest/` (кэш) добавлен в `.gitignore`.
- Проверено: typecheck, oxlint, 60 unit-тестов (+ DashboardPage 4 с заглушкой карты, stores 3, formatPercent), build (StoreMap-чанк 155 КБ / 45 КБ gzip, главный не вырос), E2E desktop+iPhone (8: + «шапка → dashboard → маркеры, popup, список → товар»), скриншоты 1280/390, консоль без ошибок.
- Закоммичено: сессии 1–4 — коммиты `632481c`…`d057fc5`.

### Сессия 3 — 2026-09-23
- **`/search`** (`pages/SearchPage.tsx`, `SearchStub` удалён): `useProductPages({ search, sort })`, общий `ProductGrid` (wide), `SortSelect`, «Показать ещё», loading/error/empty («По запросу «…» ничего не нашлось» + ссылка в каталог), пустой запрос — подсказка.
- **`SearchBox`**: живой поиск с debounce (правила — в таблице решений). Таймер на `useEffectEvent`; синхронизация с URL не затирает ввод, если URL просто догнал набранное.
- **`/products/:id`** (`pages/ProductPage.tsx`, `ProductStub` удалён): см. «Товар» в таблице решений. `useCategoryFilters(slug | undefined)` — без slug запрос не шлётся.
- i18n (ru+kk): `search.title/titleFor/prompt*/empty*`, `product.*`.
- Проверено: typecheck, oxlint, 52 unit-теста (+ SearchPage 6, ProductPage 4), build, E2E desktop+iPhone (6: + «поиск при вводе → товар → назад к результатам»), скриншоты 1280/390.
- Заметка: `pnpm lint` через rtk-хук уходит в eslint — запускать `rtk proxy pnpm exec oxlint`.
- Не закоммичено.

### Сессия 2 — 2026-09-23
- **ProductCard** (`components/product/`): на мобильном горизонтальная (картинка 96px слева), с `sm` — вертикальная в сетке. Бренд, название (2 строки, растянутая ссылка на `/products/:id`), min price (Unbounded), old price лучшего предложения зачёркнута, строка выгоды «На X ₸ дешевле, чем в <самый дорогой>» (`accent`), список offers по возрастанию (карточка сама сортирует), мин. предложение — `accent-soft` + sr-only «самая низкая цена», дата снимка. `ProductImage` — плейсхолдер-ценник при `null` и `onError`. `ProductGrid` — 1/2/3 колонки (4 без панели фильтров).
- **Главная**: категории + топ-8 товаров с наибольшим разбросом цен.
- **`/collections/:slug`** (`pages/CategoryPage.tsx`): хлебная крошка, `DynamicFilters`, `SortSelect`, «Показать ещё», loading/error/empty (с кнопкой «Сбросить фильтры»), 404 → NotFound. `CategoryStub` удалён.
- `States.tsx`: добавлены `EmptyState` и `Button`. i18n (ru+kk): `card.*`, `category.*`, `sort.*`, `home.deals*`.
- **По просьбе пользователя** убраны полоса «Цены актуальны на… / Актау» (`SnapshotBar`, `useSnapshotDate`, ключи `snapshot.*`) и список магазинов в футере (`footer.sources`). У шапки теперь `border-b`.
- Мелочи: логотип не переносится на мобильном (`whitespace-nowrap`); подпись «Сортировка» на мобильном sr-only.
- Проверено: typecheck, lint, 42 unit-теста (ProductCard, DynamicFilters, CategoryPage, filterParams, getNextOffset), build, E2E desktop+iPhone (главная; категория → фильтр → min price → переход на товар), скриншоты 1280/390.
- Заметка: `pnpm test:e2e` переиспользует уже запущенный сервер на :4173 — если там висит старый preview, тесты видят старую сборку. Bash-heredoc с кириллицей/кавычками в этой среде ломается — файлы писать через Write.
- Не закоммичено.

### Сессия 1 — 2026-09-23
- Scaffold `frontend/` (create-vite react-ts, pnpm). Подключены Tailwind 4, React Router 8, TanStack Query 5, i18next, Vitest + Testing Library, Playwright.
- Дизайн: по просьбе пользователя — без флага, симпатично и минималистично. Токены, шрифты, логотип, favicon.
- API-слой: `src/api/types.ts` (контракт из 05), `mockAdapter` (фильтры OR/AND, поиск, сортировки, limit/offset, 404 → `ApiError`), `httpAdapter` (повтор параметров, ошибки NestJS), `catalogApi` (переключение `VITE_API_MODE`), хуки `queries.ts` (staleTime ∞ — данные snapshot).
- Моки генерирует `scripts/generate-mocks.mjs` (`pnpm mocks`): 5 категорий, схемы фильтров (`{value,label}` + boolean), 30 товаров, дашборд (top-10 разброс, 8 точек в Актау), meta. Картинок нет; у одного товара битый URL для проверки fallback.
- Layout: sticky header (лого, поиск → `/search?q=`, «Аналитика», Рус/Қаз с запоминанием в localStorage), полоса «Цены актуальны на 24.09.2026» (дата по Asia/Aqtau), footer. Главная пока показывает только категории; остальные роуты — заглушки (`StubPage.tsx`).
- Проверено: typecheck, lint (0 предупреждений), 16 unit-тестов, build, Playwright smoke на desktop + iPhone, скриншоты 1280 и 390 px, консоль без ошибок.
- **Дополнение: ответы Backend 1.** `getProducts` → `ProductCardDto[]`; `getMeta`/`meta.json` удалены, дата из дашборда; `FilterDto.options` → примитивы, строковые значения в моках — по-русски («Ржаной»); optional-поля убраны из моков; добавлен `lib/attributes.ts` + i18n `units.*`, `attr.yes/no`. 21 unit-тест, E2E зелёные.
- Коммитов пока нет.

### Сессия 0 — 2026-09-23
- Изучены все docs. Зафиксированы решения выше.
- Создан `05_FRONTEND_QUESTIONS_FOR_BACKEND.md` (8 блоков вопросов по DTO/query/filters/meta/dashboard).
- `git init` + remote `origin` → `kiratonine/AdilBaga`. Remote содержал только пустой initial commit в `feat/backend-2`; от него создана локальная ветка `feat/frontend`. Коммитов пока нет.

---

## Следующий шаг

**External review Production Part 01.** После внешнего PASS следующая задача —
Production Part 02: API Contract Freeze + OpenAPI; сейчас не начинать.

Хвосты дизайна (по желанию, мелочи):
- `Sheet` — проверить вручную Esc и блокировку прокрутки на iOS; у `Button` в режиме ссылки нет `aria-*`/`onClick` — расширить, если понадобится.
- Плейсхолдер-иконка категории в карточке сетки (сейчас только на странице товара) — если пользователь захочет.
- Lint: `pnpm lint` переписывается хуком rtk на eslint — запускать `rtk proxy pnpm lint`.

Next migration COMPLETE. Возможные будущие улучшения (не scope Part 01):
индикатор перехода `useLinkStatus`; после отдельного deploy — Rich Results Test,
sitemap в Search Console/Яндекс.Вебмастер. Physical Siri — PENDING OWNER.

Старое (до решения о переезде): **фронт по плану закончен.** Осталась одна задача, и она ждёт бэк: когда Backend 1 подключит к API датасет backend-2 (или ветки смёржат в `main`), поднять бэк, прогнать `E2E_API=http PW_CHANNEL=chrome pnpm test:e2e` и посмотреть вёрстку на 1280/390: длинные названия капсом, много товаров с одной ценой, мало `priceSpreads` (на главной может быть < 8 карточек), реальные картинки и точки. По желанию: моки из `final_dataset.json`, Lighthouse, маркеры карты с клавиатуры. Деплой — не наша зона.

## Открытые вопросы / заметки

- Дедлайн хакатона не назван, snapshot датирован 24.09.2026.
- Логотипа и брендинга нет — делаем сами в сессии 1.
