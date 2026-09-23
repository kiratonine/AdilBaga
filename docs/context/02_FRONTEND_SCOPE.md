# Adil Bağa — Frontend Developer Scope

## 1. Роль

Ты отвечаешь за весь пользовательский web-интерфейс Adil Bağa.

Ты **не занимаешься**:

- парсерами;
- product matching;
- Gemini;
- Redis;
- Siri Shortcut;
- DB migrations.

## 2. Ветка

```bash
git checkout -b feat/frontend
```

Backend schema/migrations не изменять.

## 3. Главная цель

Пользователь должен за несколько секунд понять:

1. какой товар он смотрит;
2. где он дешевле;
3. какие цены в других магазинах;
4. как отфильтровать товары;
5. когда обновлены данные.

## 4. Основные экраны

### 4.1 Главная / каталог

Нужно:

- header;
- логотип Adil Bağa;
- поиск;
- категории;
- переход к dashboard;
- список товарных карточек.

Не нужны auth/cart/profile/checkout.

### 4.2 Категория

Пример route:

```text
/collections/milk
```

Нужно:

- название категории;
- dynamic filters;
- sorting;
- список карточек;
- loading;
- empty state;
- API error state.

### 4.3 Product card

Ориентир — информационная структура карточки arzan.kz.

Показывать:

- image;
- name;
- min price крупно;
- old price, если есть;
- список магазинов;
- цены по возрастанию;
- выделение минимального предложения;
- snapshot date.

Пример:

```text
Молоко FoodMaster 3.2% 1 л

570 ₸

Dina       570 ₸
Dana       620 ₸
Fix Price  650 ₸
```

Если картинки нет — placeholder.

### 4.4 Product details

Secondary priority. Можно отдельную страницу или modal.

Показывать:

- крупное image;
- name/brand;
- attributes;
- offers;
- min price.

## 5. Dynamic filters

Frontend получает schema от backend.

Пример:

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
      "options": [1, 2.5, 3.2, 6]
    }
  ]
}
```

Минимум поддержать:

```text
multi-select
boolean
```

## 6. Sorting

Обязательно:

```text
Цена: сначала дешёвые
```

Default: `price_asc`.

Если останется время:

```text
price_desc
name_asc
```

## 7. Search

Поиск вызывает:

```text
GET /api/products?search=...
```

Никакого Gemini на frontend.

## 8. Dashboard

Route:

```text
/dashboard
```

### Summary cards

```text
Товаров отслеживается
Сетей
Сопоставлено между сетями
Дата актуальности
```

### Price spread

```text
Молоко X
min 510 ₸
max 670 ₸
разница 31%
```

### Map

Показать точки магазинов Актау:

- marker;
- сеть;
- адрес.

Routing не нужен.

## 9. Визуальный стиль

Цель:

- clean;
- modern;
- consumer-friendly;
- минимальная цена считывается первой;
- минимум визуального шума.

Не тратить время на сложные animation.

## 10. Responsive

Обязательно проверить:

```text
Desktop
iPhone width
```

## 11. API contract

### CategoryDto

```json
{
  "id": "uuid",
  "slug": "milk",
  "name": "Молоко"
}
```

### ProductCardDto

```json
{
  "id": "uuid",
  "name": "Молоко FoodMaster 3.2% 1 л",
  "brand": "FoodMaster",
  "category": {"slug": "milk", "name": "Молоко"},
  "imageUrl": "https://...",
  "attributes": {"volumeMl": 1000, "fatPercent": 3.2},
  "minPrice": 570,
  "offers": [
    {
      "storeCode": "DINA",
      "storeName": "Dina",
      "price": 570,
      "oldPrice": null
    }
  ],
  "snapshotAt": "2026-09-24T..."
}
```

### DashboardDto

```json
{
  "summary": {
    "canonicalProducts": 126,
    "stores": 3,
    "matchedAcrossStores": 43,
    "snapshotAt": "..."
  },
  "priceSpreads": [],
  "locations": []
}
```

## 12. Не ждать backend

Сразу создать fixtures:

```text
frontend/src/mocks/categories.json
frontend/src/mocks/products.json
frontend/src/mocks/dashboard.json
```

API abstraction:

```text
catalogApi.getCategories()
catalogApi.getProducts()
catalogApi.getDashboard()
```

После появления backend заменить mock adapter на HTTP adapter.

## 13. Error states

Минимум:

- loading;
- API error;
- empty result;
- image fallback.

## 14. Snapshot date

Обязательно показывать:

```text
Цены актуальны на 24.09.2026
```

Не писать «в реальном времени».

## 15. Что не делать

Не делать:

- login/register;
- cart/favorites;
- checkout/payments;
- CMS;
- history charts;
- notifications;
- frontend Gemini;
- scraping.

## 16. Тесты

Минимум:

- ProductCard;
- dynamic filter rendering;
- empty state.

Playwright основной flow:

```text
Открыть сайт
→ открыть категорию
→ выбрать фильтр
→ проверить обновление списка
→ проверить min price
→ открыть товар
```

Стабильные selectors:

```text
data-testid="category-card"
data-testid="product-card"
data-testid="filter-volumeMl"
data-testid="offer-list"
```

## 17. Definition of Done

Frontend готов, если:

- каталог открывается;
- категории работают;
- поиск работает;
- dynamic filters работают;
- sorting работает;
- min price выделена;
- offers магазинов видны;
- snapshot date видна;
- dashboard работает;
- map отображается;
- mock легко переключается на real API;
- production build проходит;
- responsive проверен;
- нет блокирующих console errors.

## 18. Integration boundary

DTO не менять самостоятельно. Если нужен новый field:

```text
Frontend → Backend 1
→ согласовать field
→ обновить shared contract
→ реализовать
```
