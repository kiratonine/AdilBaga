# Adil Bağa (Әділ баға) — AI Agent Guidelines & Architecture Rules

## 1. Project Overview & Hackathon Mission
**Adil Bağa** («Справедливая цена») — сервис мониторинга и сравнения цен на социально значимые и повседневные продукты питания в городе **Актау** (Мангистауская область, Казахстан).
Проект разрабатывается в рамках хакатона Smart City Aktau.

**Ключевой принцип MVP:**
- **Snapshot-only архитектура**: данные парсятся **один раз** до демо.
- Никаких фоновых кронов, очередей, воркеров и runtime-запросов к сайтам магазинов во время live demo.
- Источники данных: **Dina Market**, **Dana Market**, **Fix Price**.
- Целевая локация строго: **Актау**.

---

## 2. Team Split & Branch Conventions
Проект разрабатывается тремя параллельными стримами:
- `feat/frontend` — React UI (каталог, фильтры, карточка товара, аналитический дашборд, карта).
- `feat/backend-1` — NestJS Application Backend & Siri Shortcut (HTTP API, voice endpoint, Gemini NLP, Redis session, геодистанция).
- `feat/backend-2` — **ТЕКУЩАЯ РОЛЬ**: Data Layer, PostgreSQL/Prisma Schema, Scrapers/Ingestion, Normalization, Product Matching, CanonicalProduct + Offer creation, StoreLocation seed, Data Quality Report.

### File Ownership (Backend 2)
```text
backend/prisma/schema.prisma          # Единственный владелец схемы БД
backend/prisma/migrations/**          # Владелец истории миграций
backend/src/modules/import/**         # Парсеры и ingestion
backend/src/modules/normalization/**  # Очистка и нормализация признаков
backend/src/modules/matching/**       # Алгоритмы сопоставления (EAN, fingerprint, AI)
scripts/**                            # Скрипты парсинга, сидирования и отчётов
```

### Запрещено для Backend 2 (Out of Scope):
- Создавать/модифицировать Siri Shortcut.
- Писать контроллеры публичного HTTP API (`GET /api/products`, `POST /api/voice/start` и т.д. — зона Backend 1).
- Настраивать Upstash Redis для голосовых сессий.
- Трогать код frontend.

---

## 3. Data Model & PostgreSQL Specification
Схема базы данных управляется через Prisma (`backend/prisma/schema.prisma`):

1. **`Store`**:
   - `id` (UUID), `code` (`DINA` | `DANA` | `FIX_PRICE`), `name`, `logoUrl`.
2. **`StoreLocation`**:
   - `id` (UUID), `storeId` (FK), `name`, `address`, `latitude` (Float), `longitude` (Float).
   - Точки строго привязаны к микрорайонам Актау.
3. **`Category`**:
   - `id` (UUID), `slug` (unique: `milk`, `bread`, `eggs`, `sugar`, `oil`), `name`, `filterSchema` (JSONB).
4. **`RawProduct`**:
   - `id` (UUID), `storeId` (FK), `sourceProductId`, `sourceUrl`, `rawName`, `rawBrand`, `rawCategory`, `rawPrice` (Int), `rawOldPrice` (Int, optional), `rawImageUrl`, `rawPayload` (JSONB), `createdAt`.
5. **`CanonicalProduct`**:
   - `id` (UUID), `name`, `brand`, `categoryId` (FK), `imageUrl`, `attributes` (JSONB), `createdAt`.
6. **`ProductMapping`**:
   - `id` (UUID), `rawProductId` (FK), `canonicalProductId` (FK), `matchMethod` (`barcode` | `deterministic` | `ai` | `manual`), `matchConfidence` (Float), `reviewStatus` (`approved` | `pending` | `rejected`).
7. **`Offer`**:
   - `id` (UUID), `canonicalProductId` (FK), `rawProductId` (FK), `storeId` (FK), `price` (Int), `oldPrice` (Int, optional), `inStock` (Boolean), `snapshotAt` (DateTime).

---

## 4. Ingestion & Scraper Specifications

### 4.1 Dina Market
- **Endpoint**: GraphQL POST `https://backend.dinamarket.kz/api/v1.1/customer/graph`
- **Shop Context**: г. Актау, гипермаркет 301 (33 мкр) — `shop_id: "28"` (также точки 30, 31, 44, 45, 47).
- **Query**: `products(shop_id: $shopId, category_id: $categoryId, _page: $page, _limit: $limit)`
- Извлекаемые поля: `id`, `name`, `price`, `oldPrice`, `stock { amount }`, `image`, `weight/packaging`.

### 4.2 Dana Market
- **Endpoint**: HTML Catalog `https://dana-market.kz/catalog/`
- **Engine**: HTTP GET + Cheerio / HTML parser (движок Aspro 1C-Bitrix).
- **Target Categories**:
  - Молоко: `/catalog/produkty_pitaniya_/molochnye_produkty/moloko/`
  - Хлеб: `/catalog/produkty_pitaniya_/khlebobulochnye_izdeliya/khleb_lepyeshki_/`
  - Яйца: `/catalog/produkty_pitaniya_/molochnye_produkty/yaytsa/`
  - Сахар: `/catalog/produkty_pitaniya_/bakaleya/sakhar_sol/`
  - Масло: `/catalog/produkty_pitaniya_/bakaleya/rasitelnye_masla/`
- **Selectors**: контейнеры `[data-id]`, название `.item-title a`, цена `.price_value`.

### 4.3 Fix Price
- **Catalog**: `https://fix-price.kz/ru/catalog`
- **Особенность**: Cloudflare Challenge (403 Forbidden на обычный HTTP).
- **Решение**: Использование браузерного контекста (Playwright) или статически зафиксированного снапшота для города Актау. Не тратить время хакатона на взлом Cloudflare.

### Unified Ingestion DTO
Все парсеры преобразуют входные данные в промежуточный DTO:
```typescript
export interface RawImportedProduct {
  storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
  sourceProductId: string;
  sourceUrl?: string;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  oldPrice?: number;
  imageUrl?: string;
  rawPayload?: Record<string, unknown>;
}
```

---

## 5. Normalization & Matching Rules

### 5.1 Нормализация (Deterministic Normalizer)
- Приведение к нижнему регистру, замена `ё` → `е`, удаление двойных пробелов.
- Запятые в числах → точки (`3,2%` → `3.2%`).
- Единицы объёма: `1 л`, `1л`, `1000 мл` → `volumeMl: 1000`. `0.5 л`, `500 мл` → `volumeMl: 500`.
- Единицы веса: `1 кг` → `weightGrams: 1000`, `450 г` → `weightGrams: 450`.
- Жирность: `3.2%` → `fatPercent: 3.2`.
- Алиасы брендов: `фудмастер` / `food master` / `foodmaster` → `FoodMaster`.

### 5.2 Product Matching Pipeline
1. **Barcode / EAN exact match**: если штрихкод совпал — объединение со 100% уверенностью (`matchMethod: barcode`).
2. **Deterministic Fingerprint**: `category|brand|volumeMl|fatPercent` (например, `milk|foodmaster|1000|3.2`).
3. **Similarity & Rule Check**: сравнение типов и числовых характеристик. Если объём или жирность различаются — **НЕ объединять** (разные SKU).
4. **AI-Assisted Verification (Gemini)**:
   - Только для спорных кандидатов одной категории и бренда.
   - Строгий JSON: `{"sameProduct": boolean, "confidence": number, "reason": string}`.
   - Порог: `>= 0.95` → авто-объединение; `0.80 - 0.94` → pending; `< 0.80` → раздельные товары.

---

## 6. Execution Commands & Reproducibility
```bash
# Инициализация и миграции БД
npx prisma migrate dev --name init

# Запуск парсеров (по отдельности или вместе)
npm run import:dina
npm run import:dana
npm run import:fixprice

# Полный пайплайн нормализации и сопоставления
npm run data:pipeline

# Сидирование готового снапшота (для Backend 1 и демо)
npm run db:seed

# Отчёт о качестве данных
npm run data:report
```

---

## 7. Definition of Done (Backend 2)
1. Schema и миграции Prisma созданы и применены.
2. Контекст Актау подтверждён для всех магазинов.
3. Парсеры отработали, `RawProduct` сохранены в БД.
4. Нормализация извлекла численные атрибуты (volume, weight, fat).
5. Matching объединил одинаковые SKU между 2–3 сетями без ложных срабатываний.
6. Сформированы `CanonicalProduct` и отсортированные по цене `Offer`.
7. Точки `StoreLocation` с координатами Актау заполнены.
8. Сгенерирован финальный отчёт `data:report` (количество товаров, процент совпадений, разброс цен).
9. База готова для чтения Backend 1 без runtime-запросов к внешним сайтам.
