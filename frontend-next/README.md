# Adil Bağa — frontend (Next.js)

Переезд с Vite SPA (`../frontend/`) на Next.js App Router ради SEO. План — `docs/context/08_NEXTJS_MIGRATION_PLAN.md`.
Пока перенесены lib, API-слой, моки и компоненты; страницы и роутинг `/ru`, `/kk` — следующие сессии.

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
