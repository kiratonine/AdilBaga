# Adil Bağa — ответы Backend 1 на вопросы Frontend по API-контракту

## Статус

Ответы ниже фиксируют контракт для hackathon/MVP и **не требуют breaking changes во время текущего Part 02**.

Главный принцип: сохраняем уже утверждённые DTO/API максимально стабильными. Новые поля и отдельные endpoints добавляем только если без них ломается основной пользовательский сценарий.

---

## 1. Формат ответа `GET /api/products`

**Ответ: возвращаем обычный массив `ProductCardDto[]`.**

```json
[
  {
    "id": "product-1",
    "name": "Молоко FoodMaster 3.2% 1 л",
    "brand": "FoodMaster",
    "category": {
      "slug": "milk",
      "name": "Молоко"
    },
    "imageUrl": null,
    "attributes": {
      "volumeMl": 1000,
      "fatPercent": 3.2
    },
    "minPrice": 570,
    "offers": [],
    "snapshotAt": "2026-09-24T00:00:00.000Z"
  }
]
```

Поддерживаем:

```text
limit
offset
```

Но для текущего MVP **не меняем response shape на `{ items, total, limit, offset }`**, потому что это будет breaking change относительно уже зафиксированного контракта и текущей реализации Backend 1.

Для `Показать ещё`:

```text
GET /api/products?limit=24&offset=0
GET /api/products?limit=24&offset=24
GET /api/products?limit=24&offset=48
```

Когда backend возвращает меньше `limit`, следующей страницы нет.

Точный `total` в Part 02 не гарантируется. Для hackathon лучше не блокировать каталог из-за счётчика `Найдено N товаров`.

Если UI обязательно требует число, временно можно показывать количество уже загруженных товаров.

---

## 2. Динамические фильтры в query

**Да, ваш вариант подтверждаем.**

Несколько значений одного фильтра передаются повторением query-параметра:

```text
GET /api/products?category=milk&volumeMl=500&volumeMl=1000&fatPercent=3.2&sort=price_asc&limit=24&offset=0
```

Семантика:

```text
одно поле, несколько значений → OR
разные поля                  → AND
```

То есть:

```text
(volumeMl = 500 OR volumeMl = 1000)
AND
fatPercent = 3.2
```

Для `boolean`:

```text
?sliced=true
?sliced=false
```

Если параметра нет — фильтр не применяется.

`search` можно сочетать с `category` и dynamic filters:

```text
GET /api/products?category=milk&search=foodmaster&fatPercent=3.2
```

CSV-вариант:

```text
?volumeMl=500,1000
```

**не используем**.

---

## 3. Подписи и единицы фильтров

Для текущего MVP сохраняем утверждённый простой contract:

```json
{
  "category": "milk",
  "filters": [
    {
      "key": "volumeMl",
      "label": "Объём",
      "type": "multi-select",
      "options": [500, 900, 1000]
    },
    {
      "key": "fatPercent",
      "label": "Жирность",
      "type": "multi-select",
      "options": [2.5, 3.2]
    }
  ]
}
```

То есть `options` остаются **primitive values**, а не `{ value, label }`.

В Part 02 не меняем этот DTO на объектные options.

Frontend может иметь небольшой общий formatter по semantic key:

```text
volumeMl    → мл
weightGrams → г
fatPercent  → %
```

Это не hardcode категорий: Frontend всё равно не решает, какие фильтры показать. Список фильтров и `options` всегда приходит от Backend.

Например:

```text
key=volumeMl, value=500    → "500 мл"
key=fatPercent, value=3.2  → "3.2%"
```

Для `boolean` поле `options` не обязательно.

После хакатона можем расширить schema до `{ value, label }`, но сейчас это лишний contract change.

---

## 4. Общая дата snapshot

**Новый `GET /api/meta` сейчас не добавляем.**

Используем:

```text
GET /api/dashboard
```

и берём:

```text
summary.snapshotAt
```

Frontend может запросить dashboard один раз на уровне приложения/layout и переиспользовать:

```text
Цены актуальны на DD.MM.YYYY
```

Это маленький готовый aggregate endpoint, поэтому отдельный `/api/meta` для двухдневного MVP не нужен.

На product/category страницах `snapshotAt` также остаётся внутри `ProductCardDto`.

---

## 5. `ProductCardDto` и `OfferDto`

Подтверждённый MVP contract:

```ts
type ProductCardDto = {
  id: string;
  name: string;
  brand: string | null;
  category: {
    slug: string;
    name: string;
  };
  imageUrl: string | null;
  attributes: Record<string, string | number | boolean>;
  minPrice: number;
  offers: OfferDto[];
  snapshotAt: string;
};

type OfferDto = {
  storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
  storeName: string;
  price: number;
  oldPrice: number | null;
};
```

Ответы:

### 5.1 `category`

**Да. Обязательно будет.**

Frontend может использовать его для:

- хлебных крошек;
- ссылки на категорию;
- поиска;
- product details.

### 5.2 `inStock`

**В текущий frozen `OfferDto` не добавляем как обязательное поле.**

В data layer поле `inStock` существует, поэтому после подключения реального dataset Backend 2 его можно добавить как backward-compatible extension.

Но Frontend в текущем hackathon flow **не должен зависеть от `inStock`**.

То есть сейчас не строим обязательный UI `нет в наличии`.

### 5.3 `brand`

**Да, `brand` может быть `null`.**

Frontend должен корректно работать без бренда:

```ts
brand: string | null;
```

---

## 6. `GET /api/products/:id`

**Возвращает тот же `ProductCardDto`.**

Отдельный расширенный Product Details DTO для MVP не нужен.

```text
GET /api/products/:id
→ ProductCardDto
```

`attributeLabels` сейчас не добавляем.

Frontend может использовать:

```text
GET /api/categories/:slug/filters
```

чтобы получить `label` для известного `attributes.key`.

Пример:

```text
attributes.volumeMl = 1000
filter schema:
key = volumeMl
label = Объём

→ UI: Объём — 1000 мл
```

Это сохраняет один источник описания dynamic filters.

---

## 7. `DashboardDto`

Для MVP подтверждаем минимальный контракт:

```ts
type DashboardDto = {
  summary: {
    canonicalProducts: number;
    stores: number;
    matchedAcrossStores: number;
    snapshotAt: string;
  };

  priceSpreads: {
    productId: string;
    name: string;
    minPrice: number;
    maxPrice: number;
    differencePercent: number;
  }[];

  locations: {
    storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
    storeName: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }[];
};
```

### 7.1 `locations`

**Да, формат подходит**, кроме того, что Frontend не должен делать поле `id` обязательным для текущего MVP.

Для map marker key можно использовать стабильную комбинацию:

```text
storeCode + address
```

После подключения real DB adapter `id` можно добавить как additive field, если он уже есть в `StoreLocation`.

### 7.2 Дополнительные поля в `priceSpreads`

В Part 02 **не делаем обязательными**:

```text
imageUrl
category
minStoreName
maxStoreName
```

Frontend для текущего dashboard должен рассчитывать на минимальный frozen shape:

```text
productId
name
minPrice
maxPrice
differencePercent
```

Если позже эти поля будут добавлены как optional/additive, Frontend сможет их использовать, но основной dashboard не должен от них зависеть.

### 7.3 `differencePercent`

Да, считаем:

```text
((maxPrice - minPrice) / minPrice) * 100
```

Например:

```text
min = 500
max = 650

differencePercent = 30
```

Backend отдаёт готовое число.
Frontend его не пересчитывает.

`priceSpreads` сортируются по `differencePercent DESC`.

---

## 8. Прочее

### 8.1 Base URL и CORS

Да.

Frontend:

```text
VITE_API_BASE_URL + /api/...
```

Например:

```text
http://localhost:3000/api/products
```

В hackathon/MVP Backend 1 разрешает CORS для отдельного Frontend origin.

Допустим простой NestJS:

```ts
app.enableCors();
```

Этого достаточно для:

```text
http://localhost:5173
```

и будущего deployed Frontend без отдельной сложной CORS-инфраструктуры.

---

### 8.2 Формат ошибок

Да, стандартный NestJS формат подходит:

```json
{
  "statusCode": 400,
  "message": "...",
  "error": "Bad Request"
}
```

Для validation `message` может быть массивом строк.

Frontend может на это рассчитывать.

---

### 8.3 Казахский язык

Для текущего MVP:

```text
product name → как есть в canonical dataset
category name → текущая русская строка
```

`nameKk` сейчас не добавляем.

UI ru/kk остаётся ответственностью Frontend.

После хакатона category localization можно расширить отдельно.

---

### 8.4 Sort values

Подтверждаем:

```text
price_asc   // default
price_desc
name_asc
```

Неизвестный sort → HTTP 400.

---

### 8.5 Category slugs

Целевой список dataset:

```text
milk
bread
eggs
sugar
oil
```

Но Frontend **не должен считать этот список навсегда hardcoded/final**.

Backend 2 сейчас формирует реальный snapshot и может оставить только категории с нормальными данными/overlap.

Источник истины для UI:

```text
GET /api/categories
```

То есть Frontend строит список категорий из API.

Для routing slug можно использовать значение, которое вернул Backend:

```text
/collections/:slug
```

---

# Короткий итог контракта для Frontend

Подтверждаем:

```text
GET /api/products → ProductCardDto[]

dynamic multi-select → repeated query params

OR внутри одного filter key
AND между разными filter keys

ProductCardDto.category → да
ProductCardDto.brand → string | null

OfferDto.inStock → пока не обязательный

GET /api/products/:id → тот же ProductCardDto

GET /api/meta → нет
snapshot date → /api/dashboard.summary.snapshotAt

filter options → primitive values
labels полей → filter.label
единицы → небольшой frontend formatter по semantic key

Dashboard → минимальный frozen DTO
differencePercent → (max - min) / min * 100

CORS → да
NestJS error format → да

sort:
price_asc
price_desc
name_asc

categories → всегда читать из GET /api/categories
```

Главный принцип на оставшееся время хакатона: **не расширяем контракт ради косметики, если основной каталог/dashboard уже может работать на текущем DTO.**
