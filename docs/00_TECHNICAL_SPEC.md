# Adil Bağa — техническое задание MVP

## 1. Название и идея

**Adil Bağa (Әділ баға)** — веб-сервис мониторинга и сравнения цен на социально значимые и повседневные продукты питания в городе Актау. Название переводится как **«Справедливая цена»**.

Цель MVP — собрать в одном месте snapshot цен из нескольких магазинов Актау и дать пользователю быстрый ответ: где нужный товар дешевле, какие есть альтернативы и где находится ближайшая точка магазина.

## 2. Контекст хакатона

Проект создаётся для Smart City Aktau. Рабочий MVP должен иметь frontend, реальный backend, PostgreSQL БД, привязку к Актау/Мангистау, визуализацию данных и законченный пользовательский сценарий для live demo.

Приоритет хакатона — **работающий MVP**, а не production-ready система.

## 3. Проблема

Жителю Актау приходится самостоятельно открывать сайты магазинов, искать один и тот же товар и сравнивать цены. Один и тот же продукт может стоить по-разному в разных сетях, а названия товара на сайтах магазинов могут отличаться.

Adil Bağa решает две задачи:

1. агрегирует и нормализует цены в одном каталоге;
2. помогает найти наиболее дешёвое предложение через web-интерфейс или Siri Shortcut.

## 4. Целевая аудитория

### Основная

Жители Актау, которым нужно:

- сравнить цены;
- найти самый дешёвый подходящий товар;
- подобрать товар по характеристикам;
- узнать магазин и ближайшую точку.

### Дополнительная

Городская аналитика / акимат / профильные структуры. Для них нужен компактный dashboard, показывающий ценовой разброс и географию магазинов.

## 5. Источники данных

Для MVP используются три сети:

- Dana Market;
- Dina Market;
- Fix Price.

### Главное ограничение MVP

Каталоги **парсятся один раз**. После snapshot:

- данные сохраняются в PostgreSQL;
- frontend работает только с NestJS API;
- backend работает только с БД;
- live demo не зависит от сайтов магазинов;
- cron, scheduler, очереди и автоматическое обновление цен не нужны.

На сайте обязательно показывать:

> **Цены актуальны на: DD.MM.YYYY**

## 6. Получение данных

### Dina Market

Источник: GraphQL JSON endpoint:

`https://backend.dinamarket.kz/api/v1.1/customer/graph`

Нужно получить минимум:

- source product id / xid;
- name;
- brand;
- preview image;
- price / oldPrice;
- stock;
- weight/package;
- category;
- raw JSON payload.

До массового импорта обязательно проверить:

- что `shop_id` относится к Актау;
- что query возвращает полный каталог, а не только preview;
- pagination/total count.

### Dana Market

Источник: готовый HTML каталога.

`https://dana-market.kz/catalog/`

Если нужные данные есть в HTML, использовать обычный HTTP parser, без Playwright.

Извлекать:

- source id / URL;
- name;
- price;
- image;
- category;
- brand, если доступен.

### Fix Price

Источник: HTML каталога.

`https://fix-price.kz/ru/catalog`

Критично перед snapshot установить **контекст Актау** и проверить city/locality id. В исходном browser request был выбран Алматы — такие данные нельзя импортировать в финальный dataset.

## 7. Основная модель данных

Система должна разделять исходный товар магазина, канонический товар Adil Bağa и предложение магазина.

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

Пример `attributes` для молока:

```json
{
  "volumeMl": 1000,
  "fatPercent": 3.2,
  "processing": "ultra_pasteurized"
}
```

Пример для хлеба:

```json
{
  "weightGrams": 450,
  "breadType": "rye",
  "sliced": true
}
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

### Store

```text
id
code
name
logoUrl
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

Координаты точек магазинов можно внести вручную.

### Category

```text
id
slug
name
filterSchema JSONB
```

## 8. Сопоставление одинаковых товаров

Один физический SKU может называться по-разному:

```text
Молоко FoodMaster 3,2% 1л
FOOD MASTER Молоко ультрапастеризованное 3.2% 1000 мл
FoodMaster молоко 3,2%, 1 L
```

В Adil Bağa это должен быть один `CanonicalProduct` с несколькими `Offer`.

Pipeline:

```text
Raw import
→ deterministic normalization
→ candidate generation
→ AI-assisted review
→ canonical mapping
→ unresolved queue
```

Приоритет признаков:

```text
EAN/barcode
brand
product type
volume/weight
fat percentage
variant/flavor
package count
normalized name
```

Если AI сомневается — товары не объединять автоматически.

Product matching выполняется **один раз до запуска MVP**, а не во время пользовательского запроса.

## 9. Каталог и карточка товара

Карточка строится по логике референса arzan.kz:

- изображение;
- название;
- минимальная цена крупно;
- список остальных магазинов и цен ниже;
- цены по возрастанию;
- минимальное предложение визуально выделено;
- старая цена, если есть;
- дата актуальности snapshot.

Пример:

```text
Молоко FoodMaster 3.2% 1 л

570 ₸ — Dina
620 ₸ — Dana
650 ₸ — Fix Price
```

## 10. Категории и динамические фильтры

Фильтры зависят от категории и возвращаются backend-ом.

Примеры:

### Молоко

- объём;
- жирность;
- тип обработки;
- бренд.

### Хлеб

- вес;
- тип;
- нарезанный / ненарезанный;
- бренд.

### Масло

- объём;
- тип;
- бренд.

Frontend не должен считать, что все категории имеют одинаковые фильтры.

## 11. Поиск и сортировка

Минимальные сценарии:

- список товаров категории;
- поиск по названию;
- фильтрация по характеристикам;
- сортировка от дешёвого к дорогому;
- просмотр предложений одного канонического товара;
- TOP-3 самых дешёвых подходящих товаров.

## 12. Siri Shortcut

Shortcut называется:

> **Продукты**

Основной flow:

```text
Siri Shortcut
→ голосовой запрос
→ геолокация
→ POST в NestJS
→ Gemini извлекает intent/параметры
→ backend определяет недостающие параметры
→ Siri задаёт уточнение
→ пользователь отвечает
→ backend ищет в PostgreSQL
→ результат
→ Siri проговаривает ответ
→ Show Notification
```

### Intent `cheapest`

Возвращается TOP-1.

### Intent `search`

Возвращается TOP-3.

Пример NLP результата:

```json
{
  "intent": "cheapest",
  "category": "milk",
  "volumeMl": 1000,
  "fatPercent": 3.2
}
```

Gemini используется только для NLP. Цена, сортировка и выбор результата выполняются NestJS/PostgreSQL.

## 13. Siri session / Redis

Upstash Redis используется только для коротких voice sessions.

```text
voice-session:<sessionId>
TTL: 5–10 минут
```

Пример состояния:

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

## 14. Геолокация

Shortcut передаёт latitude/longitude.

Backend сравнивает их с `StoreLocation` и находит ближайшую точку через Haversine distance. Внешний routing API для MVP не нужен.

## 15. Siri результат

Минимальный ответ backend:

```json
{
  "name": "...",
  "price": 590,
  "store": "Dina",
  "address": "...",
  "distanceMeters": 850,
  "imageUrl": "...",
  "speech": "..."
}
```

Если есть imageUrl, Shortcut пытается показать rich notification. Если изображения нет — текстовое уведомление.

Screenshot после ответа — **опциональная функция**, не блокирующая MVP.

## 16. Dashboard городской аналитики

Отдельный frontend route `/dashboard`.

Минимум:

- количество канонических товаров;
- количество сетей;
- количество товаров, сопоставленных между несколькими сетями;
- дата snapshot;
- товары с максимальным ценовым разбросом;
- карта точек магазинов Актау.

Не создавать полноценную административную систему.

## 17. Frontend

Стек: **React**.

Минимальные разделы:

```text
/
Каталог
Категория
Поиск
Dashboard
```

Не нужны:

- аккаунты;
- корзина;
- checkout;
- платежи;
- личный кабинет.

## 18. Backend

Стек:

- NestJS;
- PostgreSQL / Supabase;
- Redis / Upstash;
- Gemini API.

Минимальный HTTP contract:

```text
GET  /api/categories
GET  /api/categories/:slug/filters
GET  /api/products
GET  /api/products/:id
GET  /api/dashboard
POST /api/voice/start
POST /api/voice/continue
```

## 19. Тестирование

Тестов минимум, но они обязательны.

### Backend

- smoke test каждого parser;
- normalization/matching fixtures;
- search/filter/sort test;
- voice contract test.

### Frontend

- основная карточка;
- dynamic filters;
- loading/error/empty state.

### E2E

Playwright:

```text
Открыть каталог
→ выбрать категорию
→ применить фильтр
→ увидеть результаты
→ проверить сортировку цен
→ открыть товар
```

Siri отдельно проверяется на реальном iPhone.

## 20. Что не входит в MVP

Не делать:

- регулярный парсинг;
- cron/scheduler;
- очереди;
- сложную безопасность;
- пользовательские аккаунты;
- корзину/оплату/доставку;
- историю цен;
- push notifications;
- production observability;
- мобильное приложение;
- online product matching;
- сложные ML-рекомендации.

## 21. Командная разработка

Ветки:

```text
feat/frontend
feat/backend-1
feat/backend-2
```

Перед активной разработкой один раз зафиксировать:

- DTO;
- DB entities;
- category slugs;
- API paths;
- ownership файлов.

Финал:

```text
merge 3 branches
→ integration
→ E2E
→ Siri real-device test
→ deploy
→ demo rehearsal
```

## 22. Критерии готовности

MVP готов, если:

- frontend задеплоен;
- NestJS backend задеплоен;
- PostgreSQL содержит snapshot;
- представлены Dana, Dina и Fix Price;
- canonical matching выполнен;
- минимальная цена отображается первой;
- filters/search/sort работают;
- dashboard и карта работают;
- Siri проходит хотя бы один полный голосовой сценарий;
- данные подтверждены как относящиеся к Актау;
- основной Playwright E2E проходит;
- live demo не зависит от доступности сайтов магазинов.
