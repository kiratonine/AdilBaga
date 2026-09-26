# Adil Bağa — Backend 1 Scope

## 1. Роль

Ты отвечаешь за **application backend и Siri Shortcut**.

Твои зоны:

- NestJS public API;
- categories/products/search/filter/sort;
- dashboard API;
- Siri/voice API;
- Gemini NLP;
- Redis voice sessions;
- geolocation / nearest store;
- Shortcut **«Продукты»**.

Ты не отвечаешь за:

- scraping;
- snapshot ingestion;
- canonical matching pipeline;
- migrations ownership.

Это зона Backend 2.

## 2. Ветка

```bash
git checkout -b feat/backend-1
```

## 3. Параллельная работа

Backend 2 владеет физической моделью данных. Ты работаешь через application interfaces и до готовности БД используешь fixtures/mock repositories.

Не ждать полного parser pipeline.

## 4. Рекомендуемые модули

```text
src/modules/catalog/
src/modules/categories/
src/modules/dashboard/
src/modules/voice/
src/modules/location/
src/modules/stores/
```

## 5. HTTP API contract

Минимум:

```text
GET  /api/categories
GET  /api/categories/:slug/filters
GET  /api/products
GET  /api/products/:id
GET  /api/dashboard
POST /api/voice/start
POST /api/voice/continue
```

## 6. Categories API

`GET /api/categories`

```json
[
  {"id": "uuid", "slug": "milk", "name": "Молоко"}
]
```

`GET /api/categories/:slug/filters`

```json
{
  "category": "milk",
  "filters": [
    {"key": "volumeMl", "label": "Объём", "type": "multi-select", "options": [500, 900, 1000]},
    {"key": "fatPercent", "label": "Жирность", "type": "multi-select", "options": [1, 2.5, 3.2, 6]}
  ]
}
```

## 7. Products API

`GET /api/products` поддерживает:

```text
category
search
sort
limit
offset
dynamic filters
```

Default:

```text
sort=price_asc
```

Backend возвращает уже агрегированный DTO с `minPrice`, отсортированными offers и `snapshotAt`.

Пример:

```json
{
  "id": "uuid",
  "name": "Молоко FoodMaster 3.2% 1 л",
  "brand": "FoodMaster",
  "imageUrl": "...",
  "attributes": {"volumeMl": 1000, "fatPercent": 3.2},
  "minPrice": 570,
  "offers": [
    {"storeCode": "DINA", "storeName": "Dina", "price": 570, "oldPrice": null}
  ],
  "snapshotAt": "..."
}
```

## 8. Dashboard API

`GET /api/dashboard`

Пример:

```json
{
  "summary": {
    "canonicalProducts": 126,
    "stores": 3,
    "matchedAcrossStores": 43,
    "snapshotAt": "..."
  },
  "priceSpreads": [
    {
      "productId": "...",
      "name": "...",
      "minPrice": 510,
      "maxPrice": 670,
      "differencePercent": 31.37
    }
  ],
  "locations": []
}
```

## 9. Siri Shortcut — твоя ответственность

Shortcut называется:

> **Продукты**

Минимальный flow:

```text
Siri
→ Dictate Text
→ Get Current Location
→ POST API
→ Speak Text
→ Show Notification
```

Сначала реализовать этот минимум. Потом clarification/image/screenshot.

## 10. POST /api/voice/start

Request:

```json
{
  "text": "найди самое дешевое молоко",
  "latitude": 43.6,
  "longitude": 51.1
}
```

Clarification response:

```json
{
  "status": "needs_clarification",
  "sessionId": "abc",
  "question": "Какой объём и жирность молока вам нужны?",
  "missingFields": ["volumeMl", "fatPercent"]
}
```

Result response:

```json
{
  "status": "result",
  "mode": "single",
  "speech": "Самое дешёвое молоко...",
  "items": []
}
```

## 11. POST /api/voice/continue

Request:

```json
{
  "sessionId": "abc",
  "text": "один литр, 3.2 процента"
}
```

Flow:

```text
load Redis session
→ Gemini parse
→ merge parameters
→ validate
→ DB query
→ response
```

## 12. Gemini contract

Только structured JSON:

```json
{
  "intent": "cheapest",
  "category": "milk",
  "volumeMl": 1000,
  "fatPercent": 3.2
}
```

Минимальные intents:

```text
cheapest → TOP-1
search   → TOP-3
```

Gemini не выбирает цену и магазин.

## 13. Gemini validation/fallback

Валидировать:

- schema;
- category allowlist;
- numeric sanity.

Если Gemini недоступен — простой keyword/regex fallback для demo-категорий.

Поддержать минимум:

```text
молоко
хлеб
яйца
сахар
масло
500 мл
1 литр
3.2%
6%
самое дешёвое
цены
```

## 14. Redis

Upstash Redis:

```text
voice-session:<sessionId>
TTL: 600 sec
```

Пример:

```json
{
  "intent": "cheapest",
  "category": "milk",
  "volumeMl": null,
  "fatPercent": null,
  "latitude": 43.6,
  "longitude": 51.1
}
```

## 15. Nearest store

Получить `StoreLocation` из БД и посчитать Haversine distance.

External routing API не использовать.

## 16. Shortcut result

TOP-1:

- Speak Text;
- Show Notification;
- если есть imageUrl — rich notification.

TOP-3:

- короткий voice summary;
- текстовый список в notification;
- изображения optional.

Screenshot добавлять только после готовности основного flow.

## 17. Lock screen test

Обязательно проверить реальный сценарий на демонстрационном iPhone:

```text
locked iPhone
→ Siri
→ Shortcut
→ API
→ response
→ notification
```

Без этого Shortcut не считается готовым.

## 18. Repository interfaces

До готовности DB adapter использовать interfaces.

Пример:

```ts
interface ProductRepository {
  findProducts(query: ProductQuery): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
}

interface CategoryRepository {
  findAll(): Promise<Category[]>;
  findFilters(slug: string): Promise<FilterSchema>;
}

interface DashboardRepository {
  getDashboard(): Promise<DashboardData>;
}
```

Сначала mock adapter, после merge — real DB adapter.

## 19. DB migrations

Не создавать параллельную migration history. Schema принадлежит Backend 2.

Если нужен field:

```text
Backend 1 → Backend 2 request
Backend 2 → migration
Backend 1 → pull/rebase
```

## 20. Тесты

Минимум:

- product sorting;
- filter mapping;
- Haversine;
- Gemini response validation;
- voice session merge;
- `/api/products`;
- `/api/voice/start`;
- `/api/voice/continue`.

Отдельно manual real-iPhone test.

## 21. Env

```text
DATABASE_URL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
GEMINI_API_KEY
```

Secrets не коммитить.

## 22. Что не делать

Не делать:

- parsers;
- cron/queues;
- product matching;
- user auth;
- payments;
- history;
- сложный rate limiting;
- production observability.

## 23. Definition of Done

Backend 1 готов, если:

- categories API работает;
- filters API работает;
- products API работает;
- search/sort/filter работают;
- dashboard API работает;
- nearest store работает;
- Gemini parsing работает;
- Redis session работает;
- Shortcut запускается Siri;
- clarification работает;
- TOP-1 работает;
- TOP-3 работает;
- notification работает;
- production URL проверен;
- real-iPhone flow пройден.

## 24. Контракт с Backend 2

Backend 2 предоставляет нормализованные:

```text
CanonicalProduct
Offer
Category
Store
StoreLocation
```

RawProduct не используется как основной runtime source.
