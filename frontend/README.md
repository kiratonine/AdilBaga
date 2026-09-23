# Adil Bağa — frontend

Vite + React + TypeScript, React Router, TanStack Query, Tailwind CSS v4, react-i18next (ru/kk).

## Запуск

```bash
pnpm install
cp .env.example .env   # по умолчанию mock-режим
pnpm dev               # http://localhost:5173
```

## API: mock ↔ http

| Переменная | Значения |
|---|---|
| `VITE_API_MODE` | `mock` (фикстуры из `src/mocks/`, по умолчанию) или `http` |
| `VITE_API_BASE_URL` | адрес NestJS API, например `http://localhost:3000` (запросы идут на `${base}/api/...`) |

Весь доступ к данным — через `catalogApi` (`src/api/catalogApi.ts`) и хуки из `src/api/queries.ts`.
Контракт — `src/api/types.ts`. Фикстуры генерируются: `pnpm mocks`.

## Проверки

```bash
pnpm typecheck
pnpm lint
pnpm test        # Vitest
pnpm build
pnpm test:e2e    # Playwright (desktop + iPhone), сам собирает и поднимает preview на :4173
```

Если `playwright install` не может скачать браузеры, запускайте через установленный Chrome:
`PW_CHANNEL=chrome pnpm test:e2e`.

## Дизайн-токены

`src/index.css`, блок `@theme`. Нейтральная база и один акцент: зелёный (`accent`) означает «здесь дешевле» и используется только для минимальной цены и выгоды.
Шрифты: Golos Text (интерфейс), Unbounded (цены и логотип).
