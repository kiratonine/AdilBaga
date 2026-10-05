# Fix Price (Актау) — источник данных

Разведка проведена 2026-10-05 (SCRUM-7, Task 4). Секретов и cookie в документе нет.

## Вывод

Каталог доступен **прямым API без авторизации** (путь A). Браузер и HAR не нужны.
На сайте `fix-price.kz` Актау в выборе города может не отображаться, но справочник API его содержит.

## Город

- Справочник: `GET https://api.fix-price.kz/buyer/v1/location/city?countryId=3` (Казахстан = `3`; без параметра отдаётся только РФ, `countryId=2`).
- Параметры справочника, найденные в бандле сайта: `titlePart`, `sort`, `countryId`, `regionCode`.
- **Актау: id `1594`**, Мангистауская область. (Атырау — `1354`.)

## Заголовки

| Заголовок | Значение |
|---|---|
| `x-city` | `1594` |
| `x-country` | `3` |
| `x-language` | `ru` |
| `content-type` | `application/json` |

Ответ подтверждает контекст заголовком `x-city: 1594`. Токен/`x-key` для чтения каталога не нужен.

## Эндпоинты

- Меню категорий: `GET /buyer/v1/category/menu` → массив `{ id, title, alias, items[], products[] }` (26 верхних категорий, среди них маркетинговые «Новинки», «Магия Halloween!» и т.п.; товары в них дублируются, дедупликация по `id`).
- Товары категории: `POST /buyer/v1/product/in/{alias}?page=N&limit=24&sort=sold`
  тело: `{"category":"<alias>","brand":[],"price":[],"isDividedPrice":false,"isNew":false,"isHit":false,"isSpecialPrice":false}`
- Пагинация: `page` с 1, `limit=24`; заголовок ответа `x-count` — общее число товаров категории; страница за пределами диапазона возвращает `[]`.
- Поля товара: `id`, `title`, `url` (относительный), `price` (строка, тенге), `specialPrice.price` (скидочная цена, если есть), `images[].src`, `brand.title`, `category.title`, `inStock`.
- Страница товара: `https://fix-price.kz/ru/catalog/<url>`.

## Конфигурация скрапера

`pipeline/.env` (не коммитится): `FIXPRICE_CITY_ID=1594`, `FIXPRICE_COUNTRY_ID=3`.
Запуск: `cd pipeline && pnpm scrape:fixprice` → `data/sources/fix_price.json`.

## Риски

- Cloudflare на `fix-price.kz` (веб) показывает challenge, но `api.fix-price.kz` в момент разведки отвечал на обычные запросы.
- Цены и наличие зависят от города; штрихкод в ответе не обнаружен.
