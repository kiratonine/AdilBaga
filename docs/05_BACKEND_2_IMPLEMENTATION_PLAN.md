# План реализации Backend 2 (Data Layer) — Adil Bağa (Әділ баға)

Комплексный технический план разработки слоя данных для сервиса мониторинга и сравнения цен на продукты питания в городе Актау в рамках хакатона Smart City Aktau.

Backend 2 является владельцем модели данных, схемы PostgreSQL / Prisma, миграций, парсеров/импортеров, нормализации, алгоритмов сопоставления (Product Matching), сидирования точек магазинов Актау и формирования воспроизводимого снапшота для демонстрации (Snapshot-only архитектура).

---

## 1. Архитектурные принципы и границы

### 1.1 Snapshot-only архитектура
- Данные парсятся и сопоставляются **один раз** до демо.
- База наполняется готовыми сущностями (`CanonicalProduct`, `Offer`, `Category`, `Store`, `StoreLocation`).
- Никаких фоновых кронов, воркеров и runtime-запросов к сайтам магазинов во время live demo.

### 1.2 Зона ответственности Backend 2
```text
backend/prisma/schema.prisma          # Единственный владелец схемы БД
backend/prisma/migrations/**          # Владелец истории миграций
backend/src/modules/import/**         # Парсеры и ingestion
backend/src/modules/normalization/**  # Очистка и нормализация признаков
backend/src/modules/matching/**       # Алгоритмы сопоставления (EAN, fingerprint, AI)
scripts/**                            # Скрипты парсинга, сидирования и отчётов
data/snapshots/**                     # Зафиксированные снапшоты данных
```

### 1.3 Вне зоны ответственности Backend 2 (Out of Scope)
- Siri Shortcut.
- Gemini Voice NLP endpoint.
- Redis-сессии для голоса.
- Публичные HTTP API контроллеры (`GET /api/products`, `GET /api/dashboard` — зона Backend 1).
- Frontend web application.

---

## 2. Этапы реализации

### Этап 1: Инициализация проекта, Prisma и схема данных
1. Настройка TypeScript и Node.js окружения в `backend/`.
2. Установка `@prisma/client`, `prisma`, `axios`, `cheerio`, `zod`, `dotenv`.
3. Создание `backend/prisma/schema.prisma` со всеми 7 моделями:
   - `Store` (DINA, DANA, FIX_PRICE)
   - `StoreLocation` (точки Актау: lat, lon, address)
   - `Category` (slug, name, filterSchema JSONB)
   - `RawProduct` (rawPayload JSONB, storeId, rawPrice)
   - `CanonicalProduct` (name, brand, categoryId, attributes JSONB)
   - `ProductMapping` (rawProductId, canonicalProductId, matchMethod, matchConfidence)
   - `Offer` (price, oldPrice, inStock, snapshotAt)
4. Генерация Prisma Client и применение миграций.

### Этап 2: Сбор данных и парсеры (Dina, Dana, Fix Price)
1. **Dina Market**:
   - GraphQL клиент `https://backend.dinamarket.kz/api/v1.1/customer/graph`.
   - Контекст Актау: `shop_id: "28"` (гипермаркет 301, 33 мкр).
   - Постраничная выгрузка целевых категорий в DTO `RawImportedProduct`.
2. **Dana Market**:
   - HTTP GET + Cheerio парсер каталога Aspro 1C-Bitrix `https://dana-market.kz/catalog/`.
   - Выгрузка целевых разделов (молоко, хлеб, яйца, сахар, масло) в DTO `RawImportedProduct`.
3. **Fix Price**:
   - Загрузчик зафиксированного снапшота `data/snapshots/fixprice_aktau.json` (20 проверенных позиций Актау).
4. Сохранение всех выгруженных товаров в таблицу `RawProduct` с сохранением полного сырого JSON payload.

### Этап 3: Детерминированная нормализация признаков
1. Очистка строк:
   - Приведение к нижнему регистру, замена `ё` → `е`, удаление двойных пробелов.
   - Запятые в числах → точки (`3,2%` → `3.2%`, `0,5 л` → `0.5 л`).
2. Извлечение физических характеристик:
   - Объём (`volumeMl`): `1 л`, `1000 мл` → `1000`; `0.5 л`, `500 мл` → `500`.
   - Вес (`weightGrams`): `1 кг` → `1000`; `450 г` → `450`.
   - Жирность (`fatPercent`): `3.2%`, `2.5%`, `6%`, `8.5%`.
3. Словарь алиасов брендов (`фудмастер` / `food master` → `FoodMaster`).

### Этап 4: Алгоритм сопоставления товаров (Product Matching)
1. **EAN Exact Match**: объединение со 100% уверенностью при совпадении штрихкода.
2. **Deterministic Fingerprint**: `category|brand|volumeMl|fatPercent` (например, `milk|foodmaster|1000|3.2`).
3. **Rule Filter**: строгая проверка — разные размеры и разная жирность являются **разными SKU** и не могут быть объединены.
4. **AI-Assisted Verification / Levenshtein Threshold**:
   - Сравнение очищенных названий товаров.
   - Порог: $\ge 0.95$ → авто-объединение; $0.80 - 0.949$ → pending; $< 0.80$ → раздельные товары.
5. Создание записей `CanonicalProduct`, связок `ProductMapping` и отсортированных по цене `Offer`.

### Этап 5: Сидирование точек магазинов Актау и динамические фильтры
1. Сидирование `StoreLocation` с реальными координатами в микрорайонах Актау:
   - **Dina**: 33 мкр (Акку), 4 мкр (ТЦ Shum), 4 мкр (ТД Атлант), 19 мкр (Royal House), 27 мкр.
   - **Dana**: 17 мкр д. 1, 14 мкр д. 38, 28 мкр д. 45.
   - **Fix Price**: 16 мкр д. 6 (ТРК Актау), 11А мкр д. 1Б, 12 мкр д. 16, 19 мкр д. 11.
2. Заполнение динамических схем фильтров в `Category.filterSchema` для молока, хлеба, яиц, сахара, масла.

### Этап 6: Воспроизводимость и отчёт о качестве данных
1. Создание сквозной команды `npm run data:pipeline` (парсинг + нормализация + сопоставление).
2. Создание команды сидирования `npm run db:seed` для быстрого развёртывания Backend 1.
3. Генерация отчёта `npm run data:report`:
   - Количество сырых товаров по сетям.
   - Количество сформированных канонических товаров.
   - Процент пересечения между 2 и 3 сетями.
   - Товары с максимальным ценовым разбросом.

---

## 3. Критерии готовности (Definition of Done)
1. Prisma схема и миграции применены к PostgreSQL.
2. Парсеры отработали, таблица `RawProduct` заполнена.
3. Нормализация извлекла все атрибуты (объём, вес, жирность).
4. Канонические товары `CanonicalProduct` и офферы `Offer` сформированы.
5. Точки магазинов `StoreLocation` с координатами Актау внесены в БД.
6. Отчёт `data:report` формируется без ошибок.
7. База данных готова для чтения Backend 1 без runtime-запросов к внешним сайтам.
