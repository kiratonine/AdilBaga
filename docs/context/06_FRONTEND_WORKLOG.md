# Frontend Worklog — рабочий контекст (я + Claude)

> **Как пользоваться.** В начале новой сессии скажи: «прочитай `docs/context/06_FRONTEND_WORKLOG.md` и делай следующую сессию». Одна сессия = одна большая задача из плана ниже. В конце сессии Claude обновляет разделы «Статус», «Журнал» и «Следующий шаг».
>
> Источники правды: `docs/00_TECHNICAL_SPEC.md`, `docs/01_RISKS_AND_DECISIONS.md`, `docs/context/02_FRONTEND_SCOPE.md`. API-контракт: **`docs/context/05_FRONTEND_ANSWERS_FROM_BACKEND_1.md`** (вопросы — `05_FRONTEND_QUESTIONS_FOR_BACKEND.md`).

---

## Зафиксированные решения

| Тема | Решение |
|---|---|
| Стек | Vite + React + TypeScript, React Router, TanStack Query, Tailwind CSS, pnpm |
| Тесты | Vitest + Testing Library (unit), Playwright (E2E) |
| Карта | Leaflet + OpenStreetMap (react-leaflet), без ключей |
| Языки UI | **ru** (default) + **kk**, i18n через `react-i18next`. Данные товаров остаются как с бэка (ru) |
| Дизайн | Минималистично, **без мотивов флага**. Белый фон, графит `ink #1A1F24`, серый `surface #F3F5F4`, один акцент — зелёный `accent #17744A` = «здесь дешевле» (только min price / выгода). Шрифты: Golos Text (UI) + **Montserrat** (цены — bold, логотип — extrabold; выбран пользователем в сессии 6 из сравнения 9 шрифтов, до этого Unbounded → Onest). Шрифты без казахских букв (Manrope, Jost) не подходят, self-host через `@fontsource-variable`. Лого: зелёный ценник со знаком «=». Токены — `@theme` в `src/index.css` |
| Деплой | **Не наша зона** — фронтенд деплой не делает (решение пользователя, сессия 6) |
| Репо | `https://github.com/kiratonine/AdilBaga`, ветка `feat/frontend`, код в `frontend/**` |
| Роуты | `/` — каталог (категории + товары с наибольшей экономией), `/collections/:slug` — категория, `/search?q=` — поиск по всем категориям, `/products/:id` — страница товара, `/dashboard` |
| API-слой | `catalogApi` с двумя адаптерами: mock (JSON из `src/mocks/`) и http. Переключение через `VITE_API_MODE=mock\|http` + `VITE_API_BASE_URL` |
| Пагинация | «Показать ещё» (limit/offset, `PAGE_SIZE = 24`). Бэк отдаёт **массив без total**: следующей страницы нет, если пришло < limit. Счётчик «Найдено N» не показываем (максимум — число загруженных) |
| Фильтры | Только из schema бэка. Типы: `multi-select`, `boolean` (`?key=true|false`). Мульти-значения — повтор параметра, OR внутри ключа, AND между ключами. `options` — **голые значения**; подписи через `lib/attributes.ts` (единицы по суффиксу ключа: `*Ml`, `*Grams`, `*Percent`, `count`). Подписи атрибутов на странице товара — `filter.label` из schema категории. Состояние фильтров в URL query |
| Дата | **Плашки «Цены актуальны на…» в шапке нет** (убрана по просьбе пользователя в сессии 2). Дата snapshot — на каждой карточке: «Цена на DD.MM.YYYY» из `product.snapshotAt` (testid `snapshot-date`). Никогда не писать «в реальном времени» |
| Необязательные поля | `offer.inStock`, `location.id`, `priceSpread.imageUrl/category/minStoreName/maxStoreName` — optional в типах, в моках отсутствуют, UI от них не зависит. Ключ маркера карты — `storeCode + address` |
| Прочее из контракта | `brand` может быть `null`; категории только из `GET /api/categories` (слаги не хардкодить); `nameKk` нет; неизвестный sort → 400 |
| Testid | `category-card`, `product-card`, `min-price`, `filter-<key>`, `offer-list` (мин. предложение — `li[data-best]`), `search-input`, `sort-select`, `load-more`, `snapshot-date`, `nav-dashboard`, `loading-state`, `error-state`, `empty-state`, `image-placeholder`, `product-attributes`, `summary-card`, `price-spread`, `store-map` (маркеры — `path.store-marker`), `store-list`, `store-group` |
| Футер | Слева логотип + «Сравниваем цены на продукты в сетях Актау.», справа «© {год} Все права защищены» (`footer.rights`, testid `copyright`). Без списка магазинов и без фразы о снимке |
| Главная | Заголовок «Где сегодня выгоднее» (kk «Бүгін қай жерде тиімдірек»). Чипы категорий + «Самая большая разница в цене»: топ-8 `dashboard.priceSpreads` → карточки через `useProductsByIds` (по `getProduct` на id), без подписи-пояснения |
| Категория | Фильтры: multi-select — чипы (`aria-pressed`), boolean — один чип (вкл = `?key=true`). URL: `lib/filterParams.ts` (невалидные ключи/значения/sort из URL игнорируются, `price_asc` в URL не пишется), `replace: true`. Мобильный: панель фильтров по кнопке «Фильтры (n)». Запрос товаров ждёт schema. `useProductPages` = `useInfiniteQuery`, при смене фильтров держит прежний список (opacity 50%) |
| Поиск | Единственное поле — `SearchBox` в шапке, отдельного инпута на `/search` нет. Живой поиск: debounce 350 мс, от 2 символов (1 символ — только по Enter). С других страниц — push на `/search?q=`, на `/search` — `replace` с сохранением `sort`; очистка поля на `/search` убирает `q`. Пустой `q` — подсказка «Что ищем?», запрос не шлём. Сортировка скрыта, если ничего не найдено |
| Товар | `/products/:id`: крошки Каталог / категория, картинка (sticky на desktop), бренд, h1, «Самая низкая цена» + old price + строка выгоды, offers по возрастанию: минимум — `accent-soft` «Дешевле всего», остальные «дороже на X ₸». Характеристики (`dl`) — только ключи, у которых есть `filter.label` в schema категории, в порядке schema. 404 → NotFound |
| Версии | React 19, React Router **8** (импорт из `react-router`), Vite 8, Tailwind 4, Vitest 5, TS 6 |
| E2E | Playwright: проекты `desktop` + `iphone` (chromium). CDN браузеров недоступен → `PW_CHANNEL=chrome pnpm test:e2e` |
| Dashboard | `/dashboard`: 4 summary-плитки (`dl`, testid `summary-card`; у «Сопоставлено» подпись «N% каталога»), список `priceSpreads` в порядке бэка (`price-spread`: название → `/products/:id`, min (`accent`) – max, без процентов и полосы — только min–max, по просьбе пользователя в сессии 6), карта + текстовый список точек по сетям (`store-list`/`store-group`, это же легенда). Карта — `components/dashboard/StoreMap.tsx`, `lazy` (Leaflet в отдельном чанке), `CircleMarker` с классом `store-marker` (**`className` прямым пропом** — через `pathOptions` не применяется), popup: сеть + адрес, `fitBounds` по точкам, `scrollWheelZoom` выкл., обёртка `isolate` (иначе панели Leaflet перекрывают sticky-шапку) |
| Строка выгоды | `components/product/SavingLine.tsx` (карточка + страница товара): фраза — `ink`, сумма — `accent` semibold (по просьбе пользователя: «цифра должна выделяться»). i18n через `<Trans>` с тегом `<price>` в `card.saving` |
| Заголовок вкладки | `lib/useDocumentTitle.ts`: «<страница> — Adil Bağa», на главной — `brand.title`; меняется с языком. В `CategoryPage` 404-заголовок ставится самой страницей (эффект родителя идёт после эффекта `NotFoundPage`) |
| Skip-link | Первый Tab — «Перейти к содержимому» → `main#main` (`tabIndex=-1`) |
| Git | На GitHub дефолтная ветка — **`main`** (была `feat/backend-2`, сменено 2026-09-23) |
| Одно предложение | Если у товара одна цена (в датасете backend-2 так у большинства) — **без зелёной подсветки** и без «Дешевле всего»: на странице товара «Цена» вместо «Самая низкая цена» и подпись «Только в этой сети». Ключ offer — `storeCode-index` |
| Фактический DTO бэка | `attributes` — значения могут быть `null` (не показываем); `FilterDto.options` у multi-select необязательны и бывают boolean (фильтр без options скрыт, boolean → «Да/Нет») |
| E2E http | `E2E_API=http PW_CHANNEL=chrome pnpm test:e2e` → только `e2e/http.spec.ts`, preview на **:4174**, ожидания берутся из API (data-agnostic). Обычный прогон этот spec игнорирует |
| Цвета сетей | `lib/stores.ts`: DINA `#2a78d6`, DANA `#eb6834`, FIX_PRICE `#4a3aa7` (прошли валидатор dataviz: CVD/контраст), неизвестная сеть — `#697178`. Зелёный для сетей не используем |

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

---

## Статус контракта с бэком

- Вопросы отправлены: ✅
- Ответы получены: ✅ 2026-09-23 (`05_FRONTEND_ANSWERS_FROM_BACKEND_1.md`)
- Расхождения поправлены в типах/моках/адаптерах: ✅ (сессия 1, дополнение)

---

## Журнал

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

**Фронт по плану закончен.** Осталась одна задача, и она ждёт бэк: когда Backend 1 подключит к API датасет backend-2 (или ветки смёржат в `main`), поднять бэк, прогнать `E2E_API=http PW_CHANNEL=chrome pnpm test:e2e` и посмотреть вёрстку на 1280/390: длинные названия капсом, много товаров с одной ценой, мало `priceSpreads` (на главной может быть < 8 карточек), реальные картинки и точки. По желанию: моки из `final_dataset.json`, Lighthouse, маркеры карты с клавиатуры. Деплой — не наша зона.

## Открытые вопросы / заметки

- Дедлайн хакатона не назван, snapshot датирован 24.09.2026.
- Логотипа и брендинга нет — делаем сами в сессии 1.
