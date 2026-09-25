# Adil Bağa — ответы Backend 1 на вопросы Frontend: аналитическая продуктовая корзина

## Статус

Этот документ — **additive contract addendum для Этапа 5**.

Важно: в основном ТЗ пользовательская корзина/checkout остаются вне MVP. Здесь реализуется **только аналитическая фиксированная корзина на Dashboard**: пользователь не добавляет товары, не меняет количество, не оформляет заказ и не покупает товары.

Публичные существующие DTO/API не ломаем. `GET /api/dashboard` получает новое additive-поле `baskets`. Если Frontend временно работает со старым ответом без `baskets`, блок корзины просто не показывается.

---

## 1. Формат `baskets`

Предложенный формат **подходит без breaking changes**.

```ts
type DashboardDto = {
  summary: {
    canonicalProducts: number
    stores: number
    matchedAcrossStores: number
    snapshotAt: string
  }
  priceSpreads: PriceSpreadDto[]
  locations: StoreLocationDto[]

  baskets?: BasketDto[]
}

type BasketDto = {
  storeCode: StoreCode
  storeName: string

  /**
   * Сумма только найденных позиций.
   * Если ни одной позиции не найдено — 0.
   * Неполную корзину Frontend не считает "самой выгодной".
   */
  total: number

  /**
   * Один и тот же фиксированный порядок позиций для всех сетей.
   */
  items: BasketItemDto[]
}

type BasketItemDto = {
  categorySlug: string
  categoryName: string
  productId: string | null
  name: string | null
  price: number | null
}
```

`baskets[].storeCode` и `locations[].storeCode` используют один и тот же набор:

```text
DINA
DANA
FIX_PRICE
```

Backend возвращает по одной корзине на каждую сеть из таблицы `Store`.

---

## 2. Состав корзины для hackathon/demo

Исходное предложение Frontend на 6 позиций не полностью соответствует текущему runtime dataset:

- `tea` не является отдельной runtime-категорией текущей БД;
- у текущих `eggs` нет надёжного `packageCount=10`;
- `bread=любой` даёт слишком разные продукты и делает сравнение хуже.

Поэтому для Этапа 5 фиксируем **минимальную сравнимую корзину из 3 стандартизированных позиций**:

| Позиция | categorySlug | Условие |
|---|---|---|
| Молоко | `milk` | `volumeMl = 1000` |
| Сахар | `sugar` | `weightGrams = 1000` |
| Масло | `oil` | `volumeMl = 1000` |

Порядок `items` всегда:

```text
milk
sugar
oil
```

`categoryName` берём из утверждённых названий текущего dataset:

```text
milk  → Молочные продукты
sugar → Сахар и соль
oil   → Растительные масла
```

### Почему не добавляем остальные позиции сейчас

`bread`:
- у Dana и Fix Price товары сильно отличаются по типу/массе;
- сравнение "самый дешёвый хлеб любой" может быть визуально красивым, но аналитически слабым.

`eggs`:
- в текущем dataset `packageCount` фактически не заполнен;
- нельзя честно гарантировать "10 шт";
- самый дешёвый товар категории сейчас может оказаться ценой за 1 яйцо.

`tea`:
- исходный snapshot содержит чай, но текущая runtime category schema не имеет отдельного `tea`;
- нельзя добавлять новый category contract/migration ради Dashboard.

После хакатона корзину можно расширить после улучшения normalization/category coverage.

---

## 3. Правила выбора товара

Для каждой сети и каждой позиции Backend делает детерминированный расчёт.

Пример для `FIX_PRICE + milk`:

```text
category.slug = milk
attributes.volumeMl = 1000
offer.storeCode = FIX_PRICE
offer usable
→ выбрать минимальный offer.price
```

Правила:

1. Использовать только реальные `CanonicalProduct` + `Offer`.
2. Не обращаться к сайтам магазинов.
3. Учитывать только usable offers:
   - `inStock = true`;
   - `price > 0`.
4. Для каждой позиции использовать **точное условие** из состава корзины.
5. **Не использовать fallback "любой товар категории"**, если точное условие не найдено. Это сохраняет сравнимость.
6. Если несколько товаров подходят — выбрать товар с минимальной ценой этой сети.
7. Если один canonical product имеет несколько offer одной сети — использовать самый дешёвый usable offer этой сети.
8. Если подходящего товара нет:
   ```json
   {
     "productId": null,
     "name": null,
     "price": null
   }
   ```
9. `total` = сумма только ненулевых `price`.
10. Неполная корзина не участвует у Frontend в выборе "самая выгодная".

---

## 4. Как Frontend определяет полноту

Новый отдельный boolean/count в API для MVP не нужен.

Frontend вычисляет:

```ts
const missingCount = basket.items.filter((item) => item.price === null).length
const complete = missingCount === 0
```

UI:

```text
complete:
  "2 050 ₸"

partial:
  "1 230 ₸ · нет 1 из 3 позиций"

nothing found:
  "Нет данных"
```

Если `items` все `null`, не показывать пользователю `0 ₸` как стоимость корзины.

---

## 5. Карта

Связка:

```text
baskets[].storeCode
↔
locations[].storeCode
```

У всех точек одной сети отображается одна и та же аналитическая сумма корзины этой сети.

Пример:

```text
FIX_PRICE basket total
→ показывается у всех StoreLocation с storeCode=FIX_PRICE
```

Расчёт корзины не зависит от конкретного филиала, потому что текущий dataset хранит offer на уровне сети, а не остаток/цену отдельного филиала.

---

## 6. Что не меняем

Не добавляем:

- пользовательскую корзину;
- add/remove item;
- quantity;
- checkout;
- оплату;
- доставку;
- accounts/auth;
- новые DB entities;
- migrations;
- store-level inventory;
- parsing runtime;
- новый endpoint ради корзины.

Используем только additive `baskets` в существующем:

```text
GET /api/dashboard
```

---

## 7. Frontend contract

Frontend может реализовывать mock и UI прямо по этому формату.

До готовности Backend:

```text
baskets отсутствует
→ блок не показываем
```

После готовности Backend:

```text
baskets есть
→ карточки корзин
→ totals/completeness
→ сумма/статус на StoreMap по storeCode
```

Frontend не пересчитывает цены и не выбирает товары сам.

---

## 8. Acceptance для интеграции

Backend готов, если:

- `/api/dashboard` сохранил старые `summary`, `priceSpreads`, `locations`;
- добавил `baskets`;
- `baskets` содержит `DINA`, `DANA`, `FIX_PRICE`;
- у всех корзин одинаковые `items` в порядке `milk`, `sugar`, `oil`;
- missing item = `null/null/null`;
- `total` равен сумме найденных item prices;
- выбор cheapest выполняется на Backend;
- runtime использует PostgreSQL/Supabase;
- существующие API/voice/Siri не изменились.

Frontend готов, если:

- корректно работает и при отсутствии `baskets`;
- показывает complete/incomplete state;
- не объявляет неполную корзину самой дешёвой;
- карта использует `storeCode`;
- реальные значения совпадают с `/api/dashboard`.
