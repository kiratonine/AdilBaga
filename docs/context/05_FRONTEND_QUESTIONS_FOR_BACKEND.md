# Adil Bağa — вопросы Frontend → Backend 1 по API-контракту

Фронтенд пока работает на моках, собранных по формату ниже. Если формат подходит, достаточно ответить «ок». Если нет — поправьте прямо в файле, и я обновлю моки.

Всё ниже — **предложения**, они не меняют текущий контракт без вашего согласия.

---

## 1. Формат ответа `GET /api/products`

Нужна пагинация и общее количество товаров для «Показать ещё» и счётчика «Найдено N товаров».

Предложение:

```json
{
  "items": [ProductCardDto],
  "total": 126,
  "limit": 24,
  "offset": 0
}
```

**Вопрос:** возвращаете объект такого вида или просто массив?

---

## 2. Как передавать динамические фильтры в query

Предложение: ключ фильтра = имя query-параметра, несколько значений через повторение параметра:

```text
GET /api/products?category=milk&volumeMl=500&volumeMl=1000&fatPercent=3.2&sort=price_asc&limit=24&offset=0
```

- `multi-select` → `?key=v1&key=v2` (между значениями одного фильтра — OR, между разными фильтрами — AND);
- `boolean` → `?sliced=true` (если параметра нет, фильтр не применяется);
- `search` можно сочетать с `category`.

**Вопрос:** подходит повторение параметра? Если удобнее `?volumeMl=500,1000` — тоже ок, главное зафиксировать один вариант.

---

## 3. Подписи и единицы в опциях фильтров

Сейчас опции приходят голыми числами: `[500, 900, 1000]`. Фронт не должен хардкодить фильтры категорий, поэтому сам понять, что `500` — это «500 мл», а `3.2` — «3.2%», он не может.

Предложение для `GET /api/categories/:slug/filters`:

```json
{
  "category": "milk",
  "filters": [
    {
      "key": "volumeMl",
      "label": "Объём",
      "type": "multi-select",
      "options": [
        { "value": 500, "label": "500 мл" },
        { "value": 1000, "label": "1 л" }
      ]
    },
    {
      "key": "sliced",
      "label": "Нарезанный",
      "type": "boolean"
    }
  ]
}
```

- у `boolean` поле `options` не нужно;
- `value` уходит в query, `label` показывается пользователю.

**Вопрос:** можете отдавать `options` как `{ value, label }`? Минимальный вариант — добавить в фильтр поле `unit` (`"мл"`, `"%"`, `"г"`), тогда подпись фронт соберёт сам.

---

## 4. Общая дата snapshot

В шапке сайта на каждой странице нужна надпись «Цены актуальны на DD.MM.YYYY». Сейчас `snapshotAt` есть только внутри каждого товара и в `/api/dashboard`.

Предложение — лёгкий endpoint:

```text
GET /api/meta
→ { "snapshotAt": "2026-09-24T00:00:00.000Z" }
```

**Вопрос:** добавите? Если нет, беру дату из `/api/dashboard` (но тогда на каждой странице будет запрос за всем дашбордом).

---

## 5. Поля `ProductCardDto` и `OfferDto`

```ts
type ProductCardDto = {
  id: string;
  name: string;
  brand: string | null;
  category: { slug: string; name: string };   // есть в frontend scope, но нет в примере Backend 1 — нужно
  imageUrl: string | null;
  attributes: Record<string, string | number | boolean>;
  minPrice: number;
  offers: OfferDto[];                          // отсортированы по price ASC
  snapshotAt: string;                          // ISO
};

type OfferDto = {
  storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
  storeName: string;
  price: number;
  oldPrice: number | null;
  inStock: boolean;                            // предложение: добавить (в БД поле есть)
};
```

**Вопросы:**

1. `category` в карточке будет? Он нужен для хлебных крошек и ссылки из поиска.
2. Добавите `inStock` в `OfferDto`? Фронт покажет «нет в наличии» серым.
3. `brand` может быть `null`?

---

## 6. `GET /api/products/:id`

**Вопрос:** возвращает тот же `ProductCardDto` или расширенный объект? Для страницы товара хватит `ProductCardDto`. Желательно, чтобы `attributes` приходили с подписями, по тому же принципу, что в п.3:

```json
"attributeLabels": [
  { "key": "volumeMl", "label": "Объём", "value": "1 л" },
  { "key": "fatPercent", "label": "Жирность", "value": "3.2%" }
]
```

Если сложно — фронт возьмёт подписи из `/api/categories/:slug/filters`.

---

## 7. `DashboardDto`: `priceSpreads` и `locations`

Предложение:

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
    imageUrl: string | null;          // предложение: добавить
    category: { slug: string; name: string }; // предложение: добавить
    minPrice: number;
    maxPrice: number;
    minStoreName: string;             // предложение: где дешевле
    maxStoreName: string;             // предложение: где дороже
    differencePercent: number;
  }[];                                // отсортировано по differencePercent DESC, top 10
  locations: {
    id: string;
    storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
    storeName: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }[];
};
```

**Вопросы:**

1. `locations` в таком формате ок?
2. Добавите в `priceSpreads` поля `imageUrl`, `category`, `minStoreName` и `maxStoreName`?
3. Как считается `differencePercent`: `(max - min) / min * 100`?

---

## 8. Прочее

1. **Base URL и CORS:** фронт будет ходить на `VITE_API_BASE_URL` + `/api/...`. Разрешите CORS для `http://localhost:5173` (Vite dev) и для будущего prod-домена.
2. **Формат ошибок:** стандартный NestJS `{ statusCode, message, error }` — ок, фронт на это рассчитывает.
3. **Казахский язык:** интерфейс будет на ru/kk. Названия товаров и категорий оставляем как есть, на русском. Если захотите отдавать `nameKk` для категорий — фронт поддержит, но это необязательно.
4. **Sort values:** `price_asc` (default), `price_desc`, `name_asc` — подтвердите.
5. **Category slugs:** `milk`, `bread`, `eggs`, `sugar`, `oil` — финальный список?
