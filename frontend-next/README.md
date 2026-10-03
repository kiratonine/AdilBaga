# Adil Bağa — frontend (Next.js)

Переезд с Vite SPA (`../frontend/`) на Next.js App Router ради SEO. План — `docs/context/08_NEXTJS_MIGRATION_PLAN.md`.
Все страницы перенесены, язык — в префиксе URL (`/ru`, `/kk`), данные приходят в HTML с сервера.

Next 16, React 19, TanStack Query, Tailwind CSS v4, react-i18next (ru/kk).

## Запуск

```bash
pnpm install
cp .env.example .env.local   # по умолчанию mock-режим
pnpm dev                     # http://localhost:3000
```

## API: mock ↔ http

| Переменная | Значения |
|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (фикстуры из `src/mocks/`, по умолчанию) или `http` |
| `NEXT_PUBLIC_API_BASE_URL` | адрес API для браузера (запросы идут на `${base}/api/...`) |
| `API_BASE_URL` | адрес API для сервера Next (внутренний); не задан — берётся `NEXT_PUBLIC_API_BASE_URL` |

`NEXT_PUBLIC_*` подставляются при сборке — после смены нужен `pnpm build`.
Весь доступ к данным — через `catalogApi` (`src/api/catalogApi.ts`), контракт — `src/api/types.ts`. Фикстуры генерируются: `pnpm mocks`.

## SEO

| Что | Где |
|---|---|
| Адрес сайта для абсолютных URL | env `NEXT_PUBLIC_SITE_URL` (при сборке; не задан — `http://localhost:3000` и предупреждение в `next build`) → `src/lib/site.ts` |
| title, description, canonical, hreflang (ru/kk/x-default), Open Graph | `pageMetadata` в `src/lib/seo.ts`, вызывается из `generateMetadata` страниц; тексты — `meta.*` в словарях |
| JSON-LD: `Product` + `AggregateOffer`, `BreadcrumbList` | `src/lib/structuredData.ts`, компонент `src/components/seo/JsonLd.tsx` |
| `/sitemap.xml`, `/robots.txt` | `src/app/sitemap.ts` (страницы, категории, товары из API на обоих языках), `src/app/robots.ts` |
| Картинка для соцсетей | `public/og/{ru,kk}.png`, генерирует `pnpm og` (Playwright, шрифты сайта) — перезапустить после правки `brand` в словарях или текстов в самом скрипте |

Поиск — `noindex, follow`, в sitemap не входит. После деплоя: Rich Results Test для страницы товара, sitemap — в Google Search Console и Яндекс.Вебмастер.

## Проверки

```bash
pnpm typecheck   # next typegen + tsc
pnpm lint
pnpm test        # Vitest
pnpm build
pnpm test:e2e    # Playwright (desktop + iPhone), сам собирает и поднимает сервер на :3100
```

Если `playwright install` не может скачать браузеры: `PW_CHANNEL=chrome pnpm test:e2e`.

## Дизайн-токены

`src/app/globals.css`, блок `@theme`. Шрифты Golos Text и Montserrat — self-host через `@fontsource-variable`.
