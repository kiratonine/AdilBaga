# Adil Bağa — узкие места, риски и технические решения

## 1. Назначение

Документ фиксирует места, где MVP наиболее вероятно сломается, и решения, которые уменьшают риск провала live demo.

Главный принцип: **лучше небольшой, стабильный dataset и законченный user flow, чем широкий scope с нестабильной интеграцией.**

## 2. Риск №1 — неверный город у источника

Dina использует `shop_id`, Fix Price — locality/city context. В исходном Fix Price request был выбран Алматы.

До массового import для каждого источника вручную подтвердить:

```text
source
city/context id
пример товара
цена на сайте
цена parser/API
```

Финальный dataset должен быть только для Актау.

## 3. Dina GraphQL может отдавать preview

Query `categoriesPreviewProducts` может возвращать ограниченный набор.

Проверить:

1. Network запрос полной категории;
2. pagination;
3. total count;
4. количество товаров в UI и JSON.

Если query действительно preview — использовать основной query полного списка.

## 4. Product matching

Нельзя сравнивать `rawName === rawName` и нельзя полностью доверять AI.

Правильный pipeline:

```text
RawProduct
→ deterministic normalization
→ candidate generation
→ AI-assisted classification
→ confidence threshold
→ CanonicalProduct mapping
```

Сильные признаки:

```text
1. barcode/EAN
2. brand
3. product type
4. exact volume/weight
5. fat %
6. flavor/variant
7. package count
8. normalized title
```

Если есть сомнение — **не объединять**. False negative безопаснее false positive.

## 5. Нормализация до AI

Минимум:

```text
lowercase comparison value
ё → е
trim/collapse spaces
3,2 → 3.2
1 л → 1000 ml
0,5 л → 500 ml
1 кг → 1000 g
normalize brand aliases
```

AI должен видеть уже очищенные кандидаты, а не весь сырой каталог.

## 6. Structured AI output

Не принимать prose. Только JSON по schema.

Пример:

```json
{
  "sameProduct": true,
  "confidence": 0.97,
  "normalized": {
    "brand": "FoodMaster",
    "volumeMl": 1000,
    "fatPercent": 3.2
  },
  "reason": "same brand, type, volume and fat"
}
```

Ответ валидировать программно.

## 7. Snapshot архитектура

Парсинг выполняется один раз. Поэтому не нужны:

- cron;
- scheduler;
- parser jobs API;
- queues;
- Redis для ingestion.

После snapshot магазины вообще не нужны для runtime.

## 8. Всегда хранить RawProduct

Не писать parser прямо в CanonicalProduct.

Нужно сохранять исходную запись и mapping. Тогда при ошибке matching можно исправить связь без повторного парсинга.

## 9. Изображения

Для MVP допустимо хранить source image URL.

Обязательно:

- image fallback;
- отсутствие картинки не ломает карточку;
- `imageUrl` может быть null.

Скачивание изображений в Supabase Storage — только если останется время.

## 10. Разные размеры — разные SKU

```text
Молоко 500 мл != Молоко 1 л
```

Volume/weight/count обязательно участвуют в matching.

## 11. Unit price — не основная задача

`₸/100г` или `₸/100мл` можно добавить только после готовности основного flow. Основной сценарий — сравнение одного физического SKU между сетями.

## 12. Dynamic filters

Frontend не hardcode фильтры категорий. Backend возвращает schema.

Пример:

```json
{
  "category": "milk",
  "filters": [
    {"key": "volumeMl", "type": "multi-select", "options": [500, 900, 1000]},
    {"key": "fatPercent", "type": "multi-select", "options": [1, 2.5, 3.2, 6]}
  ]
}
```

## 13. Siri — главный integration risk

Сначала сделать proof-of-concept:

```text
Dictate Text
→ POST /api/voice/start
→ Speak Text
```

Только потом добавлять:

- geolocation;
- clarification;
- image;
- rich notification;
- screenshot.

## 14. Lock screen

Обязательно проверить на **том же iPhone**, который будет использоваться на защите:

```text
locked iPhone
→ Siri
→ Shortcut
→ HTTP request
→ response
→ notification
```

Screenshot — optional. Если нестабилен, убрать.

## 15. Gemini — только NLP

Неправильно:

```text
Gemini, какой товар самый дешёвый?
```

Правильно:

```text
Natural language
→ structured intent/filters
→ SQL query
→ ORDER BY price
```

## 16. Gemini fallback

Для demo желательно иметь простой keyword/regex fallback для нескольких демонстрационных категорий и параметров.

Поддержать хотя бы:

```text
молоко
хлеб
яйца
сахар
масло
1 литр
500 мл
3.2%
6%
самое дешёвое
цены
```

## 17. Redis

Redis только для Siri session, TTL 5–10 минут.

Не использовать его как каталог, matching storage или основную БД.

## 18. Store locations

Координаты точек вводятся вручную. Не тратить время на scraping, routing API или geocoding.

Nearest store считать Haversine.

## 19. Freeze API contract

До параллельной разработки зафиксировать:

```text
CategoryDto
FilterSchemaDto
ProductCardDto
OfferDto
DashboardDto
VoiceRequestDto
VoiceResponseDto
```

Breaking changes после этого — только по согласованию всех трёх участников.

## 20. DB ownership

**Backend 2 владеет schema/migrations.**

Backend 1 не создаёт параллельные несовместимые migrations.

Если Backend 1 нужен новый field:

```text
Backend 1 → запрос Backend 2
Backend 2 → migration
Backend 1 → pull/rebase
```

## 21. Frontend не ждёт backend

Frontend сразу работает через fixture/mock JSON и API abstraction. После готовности backend меняется только HTTP adapter / `API_BASE_URL`.

## 22. Backend 1 не ждёт Backend 2

Backend 1 пишет application services через repository interfaces и временные fixtures. После merge подключается реальный data adapter.

## 23. Backend 2 не ждёт Backend 1

Backend 2 отдельно завершает:

```text
schema
migrations
parsers
snapshot
normalization
matching
seed/import
```

## 24. Ownership файлов

Рекомендуемо:

```text
Frontend:
frontend/**

Backend 1:
backend/src/modules/catalog/**
backend/src/modules/dashboard/**
backend/src/modules/voice/**
backend/src/modules/location/**
shortcut/**

Backend 2:
backend/src/modules/import/**
backend/src/modules/normalization/**
backend/src/modules/matching/**
backend/prisma/** или migrations/**
scripts/**
```

Общие файлы менять минимально.

## 25. Secrets

Не коммитить:

```text
DATABASE_URL
UPSTASH credentials
GEMINI_API_KEY
PHPSESSID
cf_clearance
browser cookies
```

Создать `.env.example`.

## 26. Parser cookies

Cookies временные. Для одноразового snapshot допустимо использовать свежий cookie/context, но после import runtime не должен от него зависеть.

## 27. Cloudflare / anti-bot

Если Fix Price перестал отвечать обычным HTTP:

```text
не тратить часы
→ открыть реальную browser session / Playwright
→ получить snapshot
→ сохранить dataset
→ продолжить разработку
```

Цель — dataset, а не промышленный scraper.

## 28. Dashboard

Не делать BI-систему. Достаточно:

```text
summary cards
price spread list
map
```

## 29. Data quality report

После import вывести:

```text
Raw products: X
Canonical products: Y
Offers: Z
Matched across 2+ stores: N
Unresolved: M
Missing image: K
Missing price: P
```

## 30. Integration order

```text
1. DB schema
2. snapshot dataset
3. categories API
4. products API
5. frontend catalog
6. filters/sort
7. dashboard
8. voice API
9. Siri Shortcut
10. E2E
11. deploy
12. rehearsal
```

## 31. Demo freeze

За несколько часов до защиты:

- прекратить новые функции;
- заморозить snapshot;
- не менять schema без критической причины;
- проверить production URLs;
- проверить Siri;
- проверить hotspot/mobile internet;
- иметь backup demo script.

## 32. Главный принцип

Если выбор между 10 функциями на 70% и 5 функциями на 100% — для хакатона выбирать второй вариант.
