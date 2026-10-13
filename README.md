<p align="center">
  <img
    src="frontend/src/app/icon.svg"
    alt="Логотип Aktau Market — зелёный ценник со знаком равенства"
    width="150"
  />
</p>

<h1 align="center">Aktau Market</h1>

<p align="center">
  <strong>Сервис для жителей Актау, который сравнивает цены на продукты, показывает городскую аналитику и помогает найти самое выгодное предложение через web и Siri.</strong>
</p>

<p align="center">
  <a href="https://drive.google.com/file/d/1-tAK564vpBrJkKRu9fofxACQNTRgFW72/view?usp=sharing">
    <img src="https://img.shields.io/badge/Презентация-Google%20Drive-4285F4?logo=googledrive&logoColor=white" alt="Презентация" />
  </a>
  <a href="https://aktau.market/">
    <img src="https://img.shields.io/badge/Live%20App-Vercel-000000?logo=vercel&logoColor=white" alt="Live App" />
  </a>
  <a href="docs/">
    <img src="https://img.shields.io/badge/Документация-docs-17744A" alt="Документация" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?logo=postgresql&logoColor=white" alt="PostgreSQL / Supabase" />
</p>

---

## Что такое Aktau Market? 🏷️

**Aktau Market** — веб-сервис мониторинга и сравнения цен на социально значимые и повседневные продукты в Актау.

Публичное имя **Aktau Market** утверждено одинаково для RU/KK. Историческое имя —
Adil Bağa (Әділ баға, «Справедливая цена»); GitHub repository `kiratonine/AdilBaga`
и Vercel project `adil-baga` не переименовываются. Existing зелёный SVG-знак выше
утверждён как финальный логотип; новый знак не требуется. Старый `assets/logo/Logo.jpg`
и скриншоты сохранены как исторические материалы. Frontend branding/SEO implementation
подготовлена как source candidate, ещё не merged/deployed. Контакты и юридические
данные остаются pending: [Part17 Frontend handoff](docs/production/PART_17_FRONTEND_HANDOFF.md).

Проект объединяет данные магазинов в единый каталог и помогает быстро получить ответ на простой вопрос:

> **Где нужный товар сегодня дешевле и где находится ближайшая точка этого магазина?**

Используются данные трёх торговых сетей:

- **Dana Market**;
- **Dina Market**;
- **Fix Price**.

Во время работы приложения backend **не обращается к сайтам магазинов**. Каталоги были собраны заранее, нормализованы и сохранены как snapshot в PostgreSQL.

---

## Проблема 🔍

Цена одного и того же продукта может отличаться от магазина к магазину, но сравнивать её неудобно:

- нужно открывать несколько каталогов;
- одинаковые товары могут называться по-разному;
- цены приходится сопоставлять вручную;
- после сравнения ещё нужно искать ближайшую точку выбранной сети;
- для городского мониторинга нет единой картины ценового разброса.

В результате более выгодное предложение может находиться в нескольких минутах от человека, но он о нём не знает.

---

## Решение ✅

Aktau Market сокращает путь от поиска до конкретного решения:

```text
Нужный товар
      ↓
Единый каталог
      ↓
Сравнение предложений
      ↓
Минимальная цена
      ↓
Магазин
      ↓
Ближайшая точка
```

Пользователь получает уже подготовленный результат — frontend не агрегирует цены самостоятельно.

---

## Основные возможности ✨

- 🛒 **Единый каталог** — товары Dana Market, Dina Market и Fix Price в одном интерфейсе;
- 💸 **Сравнение цен** — минимальная цена показывается первой, остальные предложения идут ниже;
- 🔎 **Поиск и динамические фильтры** — фильтры зависят от реальных характеристик категории;
- 📊 **Городская аналитика** — ценовой разброс и сравнение фиксированной продуктовой корзины;
- 🗺 **Карта магазинов** — физические точки сетей в Актау;
- 📍 **Ближайший магазин** — расстояние рассчитывается по геолокации пользователя;
- 🎙 **Интеграция с Siri** — голосовой запрос возвращает товар, цену, сеть, адрес и изображение;
- 🤖 **Gemini только для NLP** — AI извлекает intent и фильтры, но не выбирает самый дешёвый товар;
- 🧯 **Fallback для voice-flow** — при недоступности внешнего AI используется утверждённый deterministic degradation path.

---

## Скриншоты

### Каталог

<p align="center">
  <img
    src="assets/screenshots/catalog.png"
    alt="Каталог Adil Bağa"
    width="900"
  />
</p>

### Аналитика

<p align="center">
  <img
    src="assets/screenshots/analytics.png"
    alt="Городская аналитика Adil Bağa"
    width="900"
  />
</p>

### Siri

<p align="center">
  <img
    src="assets/screenshots/siri.PNG"
    alt="Интеграция Adil Bağa с Siri"
    height="560"
  />
</p>

---

## Что уже работает? ✅

Числа 849 товаров / 6 категорий ниже относятся к историческому исходному snapshot,
не являются текущими live counts; актуальный опубликованный каталог меняется.

- единый snapshot данных магазинов Актау;
- **849** canonical products;
- **3** торговые сети;
- **15** физических точек на карте;
- **6** публичных категорий;
- поиск, фильтрация и сортировка;
- карточка товара с предложениями разных сетей;
- dashboard с ценовым разбросом;
- фиксированная продуктовая корзина по сетям;
- карта магазинов;
- поиск ближайшей точки по Haversine distance;
- voice API;
- clarification-flow для неполного голосового запроса;
- Gemini structured NLP;
- три Gemini API key с failover;
- Upstash Redis для коротких voice sessions;
- rich notification Siri с изображением товара;
- frontend и backend доступны в production; локальный flow также сохранён;
- unit, integration и Playwright E2E проверки.

---

## Как устроен проект? 🧩

### Подготовка данных

```text
Dana Market / Dina Market / Fix Price
                ↓
         одноразовый import
                ↓
      deterministic normalization
                ↓
        product matching
                ↓
         canonical snapshot
                ↓
        PostgreSQL / Supabase
```

### Runtime

```text
Next.js App Router (SSR, ru/kk)
     ↓ REST
  Go API (production)
     ↓
PostgreSQL
```

### Voice flow

`backend-go/` уже реализует frozen v1 business parity для catalog/dashboard/voice.
Production frontend: `main` → Vercel → **https://aktau.market**.
Production API: immutable Go container на VPS → Cloudflare Tunnel →
**https://api.aktau.market**; PostgreSQL остаётся Supabase. Railway retired.
NestJS `backend/` остаётся reference для frozen v1 parity, не production traffic
owner. Запуск и проверки: [backend-go/README.md](backend-go/README.md).
Это документирование принятого deployment, не новая проверка VPS.

```text
Siri
 ↓
POST /api/voice/start
 ↓
Gemini: текст → intent + filters
 ↓
Go / PostgreSQL: поиск и сравнение цен
 ↓
Nearest Store / Haversine
 ↓
готовый structured result
 ↓
Siri speech + notification
```

> **Важно:** Gemini не сравнивает цены, не выбирает магазин и не определяет самый дешёвый товар. Эти решения выполняются детерминированно в Go/PostgreSQL; NestJS сохранён как reference.

---

## Технологии 🛠️

| Слой | Технологии |
|---|---|
| Frontend | Next.js 16 App Router, React 19, TypeScript |
| UI / routing | Tailwind CSS, Next.js routing, ru/kk URL prefixes |
| Data fetching | TanStack Query |
| Карта | Leaflet / React Leaflet |
| Backend | Go — production API с frozen v1 parity; NestJS 11 / TypeScript — reference |
| Database | PostgreSQL / Supabase |
| DB tooling / reference ORM | Prisma; Go runtime — pgx |
| Voice NLP | Gemini API |
| Voice sessions | Upstash Redis |
| Geolocation | Haversine distance |
| Tests | Node Test Runner, Vitest, Playwright |
| Frontend deploy | Vercel |
| Backend production target | VPS / immutable Go container; Cloudflare Tunnel, loopback-only origin |
| Railway | Retired; not a production target |

---

## API

Основные публичные endpoints:

```text
GET  /api/categories
GET  /api/categories/:slug/filters
GET  /api/products
GET  /api/products/:id
GET  /api/dashboard
POST /api/voice/start
POST /api/voice/continue
```

`GET /api/products` поддерживает:

- category;
- search;
- sort;
- pagination;
- dynamic filters.

По умолчанию товары сортируются по минимальной цене; `limit=24`, максимум 100.
Wire contract v1: [OpenAPI](contracts/openapi.yaml),
[семантика и совместимость](docs/production/API_V1_CONTRACT.md),
[reproducible contract checks](contracts/README.md).

---

## Быстрый запуск 🚀

### Требования

- Git;
- Node.js 24;
- pnpm 10;
- PostgreSQL / Supabase.

### 1. Клонирование

```bash
git clone https://github.com/kiratonine/AdilBaga.git
cd AdilBaga
```

### 2. Backend

```bash
cd backend
pnpm install
cp .env.example .env
```

Заполните `backend/.env`:

```env
DATABASE_URL=
DIRECT_URL=

GEMINI_API_KEY=
GEMINI_API_KEY2=
GEMINI_API_KEY3=
GEMINI_MODEL=gemini-3.1-flash-lite

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Подготовьте Prisma client и соберите backend:

```bash
pnpm db:generate
pnpm build
```

Запуск:

```bash
node --env-file=.env dist/src/main.js
```

Backend по умолчанию доступен на:

```text
http://localhost:3000
```

### 3. Frontend

В новом терминале:

```bash
cd frontend
pnpm install
cp .env.example .env
```

Для работы с локальным backend (не записывайте secrets в frontend env):

```env
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
API_BASE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3100
NEXT_PUBLIC_ENABLE_TEST_MOCKS=0
```

Запуск:

```bash
pnpm dev --port 3100
```

Frontend:

```text
http://localhost:3100/ru/catalog
```

---

## База данных 🗄️

Для runtime используется PostgreSQL snapshot.

Если поднимается новая локальная база:

```bash
cd backend

pnpm db:generate
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm db:verify
```

> Для обычного runtime и live demo повторный парсинг сайтов магазинов не требуется.

---

## Проверка проекта 🧪

### Backend

```bash
cd backend

pnpm build
pnpm test
pnpm test:matching
pnpm test:audit
```

### Frontend (единственный frontend — Next.js в `frontend/`)

```bash
cd frontend

rtk proxy pnpm typecheck
rtk proxy pnpm lint
NEXT_PUBLIC_API_MODE=mock rtk pnpm test
# HTTP env из раздела запуска обязателен и для build/start.
rtk pnpm build
PW_CHANNEL=chrome rtk pnpm test:e2e  # explicit test-only mock build
```

### Real HTTP E2E

При запущенном backend:

```bash
cd frontend

E2E_API=http \
NEXT_PUBLIC_API_MODE=http \
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000 \
API_BASE_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
PW_CHANNEL=chrome \
pnpm test:e2e
```

Siri-flow дополнительно проверяется вручную на реальном iPhone.

Production build/start требуют явных HTTP mode, публичного API URL и site URL.
Production адреса: `https://aktau.market` и `https://api.aktau.market`.
Публичное имя — **Aktau Market**; frontend branding/SEO изменения реализованы
как source candidate и ещё не выпущены в production.
Part16 signed production verification ещё открыт; Automatic CI/CD Activation
остаётся **FROZEN / WAITING_FOR_OWNER**. Backend может быть
недоступен при `next build`: каталог, Dashboard и sitemap читают API в runtime;
серверные GET кешируются до 3600 секунд. Mock production build разрешён только
через `NEXT_PUBLIC_ENABLE_TEST_MOCKS=1` для Playwright, не для deployment.
На `/mnt/d` известен Vitest worker-startup issue: см. Production Part 01 report
для проверки byte-identical native-WSL test copy без изменения timeout/dependencies.

---

## Структура репозитория 📁

```text
AdilBaga/
├── assets/
│   ├── logo/
│   │   └── Logo.jpg
│   └── screenshots/
│       ├── catalog.png
│       ├── analytics.png
│       └── siri.png
│
├── backend/
│   ├── prisma/                 # Prisma schema, migration, seed
│   ├── scripts/                # audit / verification utilities
│   └── src/
│       ├── database/           # PostgreSQL adapters
│       ├── modules/            # import / normalization / matching
│       └── voice/              # Gemini, sessions, voice flow
│
├── data/
│   └── snapshots/              # frozen dataset used by the MVP
│
├── docs/                       # техническая документация и reports
│
├── frontend/
│   ├── public/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── app/                # Next App Router, SSR/SEO
│       ├── views/
│       └── mocks/
│
├── scripts/
└── README.md
```

---

## Roadmap 🛣️

### Уже готово

- [x] сравнение цен в Актау;
- [x] единый canonical catalog;
- [x] поиск и динамические фильтры;
- [x] dashboard и карта;
- [x] фиксированная продуктовая корзина;
- [x] ближайшая точка магазина;
- [x] интеграция с Siri;
- [x] Gemini NLP + deterministic fallback;
- [x] локальный end-to-end frontend/backend flow;
- [x] end-to-end demo flow.

### Следующие шаги

- [ ] подключить больше магазинов и торговых сетей Актау;
- [ ] расширить количество категорий и товаров;
- [ ] автоматизировать регулярное обновление snapshot;
- [ ] усилить автоматический контроль качества данных;
- [ ] добавить голосовые сценарии для Gemini на Android;
- [ ] исследовать Samsung Bixby и Xiaomi / HyperOS voice integrations;
- [ ] добавить историю изменения цен;
- [ ] показывать динамику стоимости продуктовой корзины;
- [ ] добавить уведомления о заметных изменениях цен;
- [ ] расширить городской аналитический dashboard.

---

## Документация 📚

- [Техническое задание MVP](docs/00_TECHNICAL_SPEC.md)
- [Риски и технические решения](docs/01_RISKS_AND_DECISIONS.md)
- [Вся документация проекта](docs/)

---

<p align="center">
  <strong>Aktau Market — сравнение цен на продукты в Актау.</strong>
</p>
