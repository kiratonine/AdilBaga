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
| Дизайн | Минималистично, **без мотивов флага**. Белый фон, графит `ink #1A1F24`, серый `surface #F3F5F4`, один акцент — зелёный `accent #17744A` = «здесь дешевле» (только min price / выгода). Шрифты: Golos Text (UI) + Unbounded (цены, логотип), self-host через `@fontsource-variable`. Лого: зелёный ценник со знаком «=». Токены — `@theme` в `src/index.css` |
| Деплой | Отложен, вернёмся позже |
| Репо | `https://github.com/kiratonine/AdilBaga`, ветка `feat/frontend`, код в `frontend/**` |
| Роуты | `/` — каталог (категории + товары с наибольшей экономией), `/collections/:slug` — категория, `/search?q=` — поиск по всем категориям, `/products/:id` — страница товара, `/dashboard` |
| API-слой | `catalogApi` с двумя адаптерами: mock (JSON из `src/mocks/`) и http. Переключение через `VITE_API_MODE=mock\|http` + `VITE_API_BASE_URL` |
| Пагинация | «Показать ещё» (limit/offset, `PAGE_SIZE = 24`). Бэк отдаёт **массив без total**: следующей страницы нет, если пришло < limit. Счётчик «Найдено N» не показываем (максимум — число загруженных) |
| Фильтры | Только из schema бэка. Типы: `multi-select`, `boolean` (`?key=true|false`). Мульти-значения — повтор параметра, OR внутри ключа, AND между ключами. `options` — **голые значения**; подписи через `lib/attributes.ts` (единицы по суффиксу ключа: `*Ml`, `*Grams`, `*Percent`, `count`). Подписи атрибутов на странице товара — `filter.label` из schema категории. Состояние фильтров в URL query |
| Дата | «Цены актуальны на DD.MM.YYYY» в шапке, из `dashboard.summary.snapshotAt` (`useSnapshotDate`, `/api/meta` нет). Никогда не писать «в реальном времени» |
| Необязательные поля | `offer.inStock`, `location.id`, `priceSpread.imageUrl/category/minStoreName/maxStoreName` — optional в типах, в моках отсутствуют, UI от них не зависит. Ключ маркера карты — `storeCode + address` |
| Прочее из контракта | `brand` может быть `null`; категории только из `GET /api/categories` (слаги не хардкодить); `nameKk` нет; неизвестный sort → 400 |
| Testid | `category-card`, `product-card`, `filter-<key>`, `offer-list`, `search-input`, `snapshot-date`, `nav-dashboard`, `loading-state`, `error-state` |
| Версии | React 19, React Router **8** (импорт из `react-router`), Vite 8, Tailwind 4, Vitest 5, TS 6 |
| E2E | Playwright: проекты `desktop` + `iphone` (chromium). CDN браузеров недоступен → `PW_CHANNEL=chrome pnpm test:e2e` |

Моки и типы приведены к **подтверждённому** контракту Backend 1 (см. `05_FRONTEND_ANSWERS_FROM_BACKEND_1.md`).

---

## План сессий

| # | Задача | Статус |
|---|---|---|
| 0 | Изучение docs, вопросы бэку, этот файл, git-ветка | ✅ |
| 1 | **Каркас + дизайн-система.** Vite/TS/Tailwind/Router/Query/i18n/Vitest/Playwright; DTO-типы; моки (categories, filters, products, dashboard, meta); `catalogApi` mock+http; дизайн-направление (skill frontend-design) → токены, шрифты, логотип; Layout: header (лого, поиск, язык, dashboard), footer, плашка даты | ✅ |
| 2 | **Каталог и категория.** ProductCard, главная, `/collections/:slug`, DynamicFilters, сортировка, «Показать ещё», loading/empty/error, image fallback; unit-тесты (ProductCard, filters, empty) | ⏳ |
| 3 | **Поиск + страница товара.** `/search?q=` с debounce, `/products/:id` (картинка, бренд, атрибуты, offers, min price) | ⏳ |
| 4 | **Dashboard.** Summary cards, price spread list, карта Leaflet с маркерами по сетям | ⏳ |
| 5 | **Полировка.** Responsive (desktop + iPhone), kk-переводы, Playwright E2E основного flow, `pnpm build`, консоль без ошибок | ⏳ |
| 6 | **Интеграция с реальным API** (после ответов бэка / merge): http-адаптер, правки DTO, прогон E2E | ⏳ |
| 7 | Деплой | отложено |

---

## Статус контракта с бэком

- Вопросы отправлены: ✅
- Ответы получены: ✅ 2026-09-23 (`05_FRONTEND_ANSWERS_FROM_BACKEND_1.md`)
- Расхождения поправлены в типах/моках/адаптерах: ✅ (сессия 1, дополнение)

---

## Журнал

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

**Сессия 2 — каталог и категория.** ProductCard (цена — Unbounded, минимальное предложение — `accent`/`accent-soft`, image fallback), главная (категории + товары с наибольшей экономией), `/collections/:slug` с DynamicFilters из schema (состояние в URL, подписи через `formatAttributeValue`), сортировка, «Показать ещё» (`useInfiniteQuery`, `getNextPageParam`: страница < `PAGE_SIZE` → конец), loading/empty/error. Заменить `CategoryStub` в `src/app/router.tsx`. Unit-тесты: ProductCard, фильтры, empty.

## Открытые вопросы / заметки

- Дедлайн хакатона не назван, snapshot датирован 24.09.2026.
- Логотипа и брендинга нет — делаем сами в сессии 1.
