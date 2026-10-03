# Adil Bağa — frontend (Next.js)

Единственный frontend проекта после Production Part 01. План — `../docs/context/08_NEXTJS_MIGRATION_PLAN.md` (COMPLETE).
Все страницы перенесены, язык — в префиксе URL (`/ru`, `/kk`), данные приходят в HTML с сервера.

Next 16, React 19, TanStack Query, Tailwind CSS v4, react-i18next (ru/kk).

## Запуск

```bash
pnpm install
cp .env.example .env.local   # HTTP; задайте реальные адреса среды, не secrets
pnpm dev --port 3100         # Backend отдельно на :3000
```

## API: mock ↔ http

| Переменная | Значения |
|---|---|
| `NEXT_PUBLIC_API_MODE` | обязательный `http`; явный `mock` только для dev/tests |
| `NEXT_PUBLIC_API_BASE_URL` | адрес API для браузера (запросы идут на `${base}/api/...`) |
| `API_BASE_URL` | адрес API для сервера Next (внутренний); не задан — берётся `NEXT_PUBLIC_API_BASE_URL` |
| `NEXT_PUBLIC_ENABLE_TEST_MOCKS` | только `1` разрешает test-only mock production build для Playwright; не включать в deployment |

`NEXT_PUBLIC_*` подставляются при сборке — после смены нужен `pnpm build`.
Весь доступ к данным — через `catalogApi` (`src/api/catalogApi.ts`), контракт — `src/api/types.ts`. Фикстуры генерируются: `pnpm mocks`.

## SEO

| Что | Где |
|---|---|
| Адрес сайта для абсолютных URL | `NEXT_PUBLIC_SITE_URL` обязателен для production build/start; planned `https://aktau.market` → `src/lib/site.ts` |
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

Обычный E2E запускает только mock suite с явным test-only opt-in. Real HTTP:

```bash
E2E_API=http NEXT_PUBLIC_API_MODE=http \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000 API_BASE_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 PW_CHANNEL=chrome pnpm test:e2e
```

Этот режим запускает только data-agnostic `e2e/http.spec.ts` против отдельного
реального NestJS, без fixture assumptions. Production API failure не переключает
адаптер на mock. Каталог/Dashboard/sitemap строятся в runtime, server GET cache
ограничен 3600 s и помечен `catalog-data`; build не требует запущенного API.

## Дизайн-токены

`src/app/globals.css`, блок `@theme`. Golos Text/Montserrat — `next/font/google`;
build требует доступа к Google Fonts (независимость от Backend не означает полностью офлайн build).
