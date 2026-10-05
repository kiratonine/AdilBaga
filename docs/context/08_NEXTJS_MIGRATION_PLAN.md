# Переезд фронтенда Adil Bağa: Vite SPA → Next.js (App Router) ради SEO

> **Выполнено 2026-10-05 (сессия 20).** `frontend-next/` стал `frontend/`, Vite-фронт удалён. Пути `frontend-next/` ниже — исторические, сейчас это `frontend/`.

## Context
Проект выиграл конкурс, покупается домен, нужна индексация в Google/Yandex. Сейчас `frontend/` — Vite SPA: поисковик получает пустой `<div id="root">`, title ставится через `document.title` в `useEffect`, язык (ru/kk) хранится в localStorage → казахская версия не индексируется вовсе. Бэкенд переезжает на Go (не наша зона, контракт — через Backend 1). Наша зона — только фронтенд.

Решения пользователя: язык в URL-префиксе `/ru` и `/kk`; новый проект `frontend-next/` рядом со старым, перенос по страницам, старый `frontend/` живёт до переключения.

## Целевая структура (`frontend-next/`)
```
app/
  [lang]/layout.tsx          ← <html lang>, Header/Footer, Providers (QueryClient, i18n)
  [lang]/page.tsx            ← Landing        (было /)
  [lang]/catalog/page.tsx    ← HomePage
  [lang]/collections/[slug]/page.tsx
  [lang]/products/[id]/page.tsx
  [lang]/search/page.tsx     ← noindex
  [lang]/dashboard/page.tsx
  [lang]/not-found.tsx
  sitemap.ts, robots.ts
middleware.ts                ← / → /ru (по Accept-Language / cookie), старые URL без префикса → 301
```

## Шаги
1. **Каркас.** `create-next-app` (TS, Tailwind 4, без src-alias конфликтов), pnpm, oxlint, Vitest (+jsdom), Playwright. Шрифты Golos/Montserrat — через `next/font` или оставить fontsource. Перенести `index.css`, `public/`.
2. **Перенос без изменений:** `src/lib/*`, `src/api/types.ts`, `httpAdapter`, `mockAdapter`, `mocks/`, `components/*` + их тесты. Компоненты с хуками → `'use client'`.
3. **API-слой.** [catalogApi.ts](frontend/src/api/catalogApi.ts): `import.meta.env.VITE_*` → `process.env.API_MODE` / `API_BASE_URL` (серверный, для Go внутри сети) + `NEXT_PUBLIC_API_BASE_URL` (браузер). Контракт Go-API согласовать с Backend 1, пока работаем на моках.
4. **Роутинг.** `react-router` → `next/link`, `useParams`/`useSearchParams`/`useRouter` из `next/navigation` (затронуты: Header, Logo, SearchBox, ProductCard, Baskets, все pages). Все ссылки — с префиксом языка (хелпер `href(lang, path)`). [filterParams.ts](frontend/src/lib/filterParams.ts) остаётся, читает из searchParams.
5. **i18n.** [i18n/index.ts](frontend/src/i18n/index.ts): язык берётся из `params.lang`, не из localStorage; на сервере — словари ru/kk напрямую, на клиенте — i18next инициализируется с `lng` из URL (без гидрационных расхождений). LanguageSwitch меняет префикс URL, cookie запоминает выбор для редиректа с `/`.
6. **Данные на сервере.** Страницы товара, категории, каталога, лендинга, дашборда: серверный prefetch через `catalogApi` + TanStack Query `HydrationBoundary` (переиспользуем `queryKeys` из [queries.ts](frontend/src/api/queries.ts)) → HTML уже с ценами; «Показать ещё» и фильтры остаются клиентскими через `useProductPages`. ISR (`revalidate`) — данные snapshot'ные.
7. **SEO.**
   - `useDocumentTitle` → `generateMetadata` на каждой странице: title, description, canonical, `alternates.languages` (hreflang ru/kk + x-default), Open Graph.
   - JSON-LD: `Product` + `AggregateOffer` (lowPrice/highPrice по сетям) на странице товара, `BreadcrumbList` на категории/товаре.
   - `sitemap.ts` (категории + товары из API, обе локали), `robots.ts`, `/search` — `noindex`.
   - OG-картинка по умолчанию (`opengraph-image`).
8. **Leaflet.** [StoreMap.tsx](frontend/src/components/dashboard/StoreMap.tsx) → `next/dynamic(..., { ssr: false })`.
9. **Тесты.** Unit-тесты переносятся; `test/render.tsx` — моки `next/navigation` вместо MemoryRouter. e2e (`smoke`, `http`, `polish`) — обновить URL на `/ru/...`, добавить проверку: в исходном HTML (без JS) есть название и цена товара, `<title>`, `hreflang`, JSON-LD.
10. **Переключение.** Когда всё перенесено и e2e зелёные — `frontend-next/` становится `frontend/` (отдельный коммит), старый удаляется. Обновить README и `docs/context/06_FRONTEND_WORKLOG.md`.

## Разбивка по сессиям (одна сессия = один этап)
Передача между сессиями — через репозиторий: план копируется в `docs/context/08_NEXTJS_MIGRATION_PLAN.md`, в конце каждой сессии — запись в `06_FRONTEND_WORKLOG.md` (что сделано, что дальше) + коммит. Новая сессия начинает с чтения этих двух файлов.

| Сессия | Шаги | Готово, когда |
|---|---|---|
| 1. Каркас и перенос | 1, 2, 3 | `frontend-next/` собирается, unit-тесты lib/api/components зелёные |
| 2. Язык и роутинг | 4, 5 | `/ru` и `/kk` работают, middleware-редиректы, Layout/Header/LanguageSwitch, Landing + Catalog |
| 3. Страницы с SSR | 6, 8 | Category, Product, Search, Dashboard (с картой), NotFound; HTML отдаётся с данными |
| 4. SEO | 7 | metadata, hreflang, JSON-LD, sitemap, robots, OG |
| 5. e2e и переключение | 9, 10 | e2e зелёные, `frontend-next/` → `frontend/`, README и worklog обновлены |

Субагенты: основную работу веду сам (проект маленький, связанный контекст важнее параллелизма). Субагенты — точечно: параллельный перенос независимых страниц в сессии 3 и независимое код-ревью в конце каждой сессии.

## Вне нашей зоны, но надо согласовать
- Хостинг: Next с SSR требует Node-рантайм (Vercel или Docker на VPS рядом с Go) — не статика.
- Серверный адрес Go-API для Next (внутренний) и CORS для браузерных запросов.
- После деплоя: Google Search Console + Яндекс.Вебмастер, отправка sitemap.

## Verification
- `pnpm typecheck && pnpm lint && pnpm test` в `frontend-next/`.
- `pnpm build && pnpm start`, затем `curl http://localhost:3000/ru/products/<id>` — в HTML есть название, цены, `<title>`, `<link rel="alternate" hreflang>`, `application/ld+json`.
- `pnpm test:e2e` против моков и против http-режима.
- Lighthouse SEO-аудит (цель ≥ 95), Rich Results Test для JSON-LD на странице товара.
