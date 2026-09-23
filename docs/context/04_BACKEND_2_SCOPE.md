# Adil Bağa — Backend 2 Scope

## 1. Роль

Ты отвечаешь за **data layer проекта**.

Твои зоны:

- PostgreSQL / Supabase schema;
- migrations;
- одноразовый import;
- Dina parser;
- Dana parser;
- Fix Price parser;
- RawProduct storage;
- normalization;
- product matching;
- CanonicalProduct;
- Offer;
- snapshot/seed;
- StoreLocation data.

Ты не отвечаешь за:

- Siri Shortcut;
- Gemini voice flow;
- Redis voice session;
- frontend;
- public HTTP API contract.

## 2. Ветка

```bash
git checkout -b feat/backend-2
```

## 3. Главный результат

После твоей работы PostgreSQL должен содержать:

```text
Category
Store
StoreLocation
RawProduct
CanonicalProduct
ProductMapping
Offer
```

Runtime backend после этого не обращается к сайтам магазинов.

## 4. Snapshot only

Парсинг выполняется **один раз**.

Не делать:

- cron;
- scheduler;
- BullMQ;
- worker infrastructure;
- auto-refresh.

Достаточно scripts/commands:

```text
import:dina
import:dana
import:fixprice
normalize
match
finalize
```

## 5. DB ownership

Ты владеешь migration history во время основной разработки.

Backend 1 не должен параллельно менять schema.

## 6. Schema

### Store

```text
id
code
name
logoUrl
```

Codes:

```text
DINA
DANA
FIX_PRICE
```

### StoreLocation

```text
id
storeId
name
address
latitude
longitude
```

### Category

```text
id
slug
name
filterSchema JSONB
```

Примеры slug:

```text
milk
bread
eggs
sugar
oil
```

### RawProduct

```text
id
storeId
sourceProductId
sourceUrl
rawName
rawBrand
rawCategory
rawPrice
rawOldPrice
rawImageUrl
rawPayload JSONB
createdAt
```

### CanonicalProduct

```text
id
name
brand
categoryId
imageUrl
attributes JSONB
createdAt
```

### ProductMapping

```text
id
rawProductId
canonicalProductId
matchMethod
matchConfidence
reviewStatus
```

`matchMethod`:

```text
barcode
deterministic
ai
manual
```

### Offer

```text
id
canonicalProductId
rawProductId
storeId
price
oldPrice
inStock
snapshotAt
```

## 7. Dina Market

Источник:

```text
https://backend.dinamarket.kz/api/v1.1/customer/graph
```

Получать:

- id/xid;
- name;
- brand;
- price/oldPrice;
- stock;
- image;
- weight/package;
- category;
- raw payload.

До массового import:

1. определить `shop_id` Актау;
2. проверить полный catalog query;
3. проверить pagination;
4. проверить, не является ли `categoriesPreviewProducts` только preview;
5. вручную сравнить 2–3 товара с сайтом.

## 8. Dana Market

Источник:

```text
https://dana-market.kz/catalog/
```

Если HTML уже содержит данные, использовать HTTP + HTML parser.

Извлекать:

- source id/URL;
- name;
- price;
- image;
- category;
- brand, если есть.

Playwright не использовать без необходимости.

## 9. Fix Price

Источник:

```text
https://fix-price.kz/ru/catalog
```

Критично получить **Актау** locality/city context.

До snapshot:

1. выбрать Актау на сайте;
2. определить cityId/locality;
3. повторить request;
4. сравнить цену вручную;
5. затем запускать import.

Если HTTP блокируется Cloudflare — не тратить часы. Использовать реальную browser session/Playwright, получить dataset и продолжить.

## 10. Unified parser DTO

Каждый parser возвращает единый internal DTO.

```ts
type RawImportedProduct = {
  storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
  sourceProductId: string;
  sourceUrl?: string;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  oldPrice?: number;
  imageUrl?: string;
  rawPayload?: unknown;
};
```

Parser **не создаёт CanonicalProduct напрямую**.

## 11. Normalization

Минимум:

```text
lowercase comparison value
ё → е
trim
collapse spaces
comma decimals → dot
1 л → 1000 ml
0.5 л → 500 ml
1 кг → 1000 g
normalize percent
normalize known brand aliases
```

## 12. Attribute extraction

Только нужные атрибуты MVP.

Milk:

```json
{
  "volumeMl": 1000,
  "fatPercent": 3.2
}
```

Bread:

```json
{
  "weightGrams": 450,
  "breadType": "rye",
  "sliced": true
}
```

Не строить универсальную ontology всех продуктов.

## 13. Barcode / EAN

Во время исследования обязательно проверить:

- detail JSON;
- microdata/schema.org;
- hidden HTML;
- GraphQL fields.

Если EAN найден — сохранять, так как это лучший matching signal.

## 14. Candidate matching

Не сравнивать каждый товар со всеми.

Сначала сузить кандидатов:

```text
same category
compatible brand
same/similar volume
same/similar weight
same fat % where applicable
```

Потом title similarity / AI.

## 15. Matching priority

```text
EAN exact
→ deterministic fingerprint
→ exact key attributes + high title similarity
→ AI review
→ unresolved
```

Пример fingerprint:

```text
milk|foodmaster|1000ml|3.2pct
```

Fingerprint — только сигнал, не абсолютная истина.

## 16. AI-assisted matching

AI получает только ограниченный candidate pair/set.

Expected output:

```json
{
  "sameProduct": true,
  "confidence": 0.97,
  "reason": "same brand, product, volume and fat"
}
```

Strict JSON only.

Рекомендуемая политика:

```text
>= 0.95 → auto accept
0.80–0.949 → manual review
< 0.80 → reject/unresolved
```

Если времени мало — threshold сделать строже.

## 17. Canonical naming

Создавать понятное display name:

```text
Молоко FoodMaster 3.2% 1 л
```

Главное — бренд, тип и ключевые характеристики.

## 18. Canonical image

Выбрать первое валидное изображение. Возможный приоритет:

```text
Dina
→ Dana
→ Fix Price
→ null
```

Frontend должен иметь placeholder.

## 19. Offer creation

Каждый RawProduct, связанный с CanonicalProduct, создаёт Offer:

```text
canonicalProductId
rawProductId
storeId
price
oldPrice
snapshotAt
```

## 20. Dynamic filter schema

Создать `Category.filterSchema` для выбранных категорий.

Пример:

```json
{
  "filters": [
    {"key": "volumeMl", "label": "Объём", "type": "multi-select"},
    {"key": "fatPercent", "label": "Жирность", "type": "multi-select"}
  ]
}
```

Backend 1 может получить реальные options из dataset.

## 21. Store locations

Добавить вручную точки магазинов Актау:

```text
store
address
latitude
longitude
```

Parser точек не нужен.

## 22. Data quality report

После finalization вывести:

```text
Dina raw: X
Dana raw: Y
Fix Price raw: Z
Canonical: N
Offers: M
Matched across 2+ stores: A
Matched across 3 stores: B
Missing image: C
Unresolved: D
```

## 23. Scope dataset

Не обязательно импортировать весь каталог.

Приоритет — 3–5 категорий с хорошим overlap и социально значимыми продуктами, например:

```text
milk
bread
eggs
sugar
oil
```

Demo category желательно выбрать такую, где есть минимум 2 сети.

## 24. Индексы

Минимально полезно:

```text
categoryId
brand
storeId
canonicalProductId
snapshotAt
```

JSONB indexing только если реально понадобится.

## 25. Seed / snapshot воспроизводимость

После final dataset должен быть понятный способ восстановить данные:

```text
pnpm db:seed
```

или

```text
pnpm import:snapshot
```

Production DB можно наполнить один раз, но scripts должны остаться в repo.

## 26. Secrets

Не коммитить:

```text
cf_clearance
PHPSESSID
GraphQL/session cookies
browser cookies
```

Если временный cookie нужен parser-у — брать из env.

## 27. Тесты

Parser smoke для каждого магазина:

```text
returns >= 1 product
name exists
price > 0
```

Normalization fixtures:

```text
1 л → 1000 ml
0,5 л → 500 ml
3,2% → 3.2
```

Matching fixtures:

```text
same SKU → match
different volume → no match
different brand → no match
```

## 28. Контракт с Backend 1

Backend 1 ожидает готовые runtime entities:

```text
CanonicalProduct
Offer
Category
Store
StoreLocation
```

RawProduct не должен быть основным источником public API.

## 29. Что не делать

Не делать:

- Siri;
- Gemini voice intent;
- Redis voice session;
- cron/scheduler/queues;
- regular refresh;
- production anti-bot system;
- full ontology;
- 100% aggressive auto matching;
- admin UI;
- auth.

## 30. Definition of Done

Backend 2 готов, если:

- schema создана;
- migrations применяются;
- Dina context Актау подтверждён;
- Dana parser работает;
- Fix Price context Актау подтверждён;
- snapshot сохранён;
- RawProduct сохранены;
- normalization работает;
- matching выполнен;
- CanonicalProduct сформированы;
- Offer сформированы;
- StoreLocation заполнены;
- data quality report получен;
- seed/import воспроизводим;
- Backend 1 может читать dataset без parser calls.

## 31. Приоритет по времени

Если времени мало:

```text
1. schema
2. 3 source imports
3. 3–5 категорий
4. normalization
5. deterministic/manual matching
6. AI только для ambiguous pairs
7. final dataset
8. quality report
```

Не жертвовать корректностью dataset ради сложной automation.
