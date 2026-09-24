# Backend 1 — Part 03 report

## A. Baseline

Работа выполнена в `feat/backend-1`; рабочее дерево до изменений было чистым. Part 02 уже имел catalog/categories/dashboard API, fixture repositories, Haversine и voice transport POC. До реализации `rtk pnpm build` и `rtk pnpm test` прошли (7/7 тестов). В `backend/package.json` были NestJS 11, TypeScript, class-validator, Node test runner; Gemini/Redis клиентов не было.

## B. Implemented

`/api/voice/start` теперь запускает NLP → валидацию → уточнение или deterministic product query. Добавлен `/api/voice/continue`, короткая session state с TTL 600 секунд, merge известных полей, Gemini JSON adapter за `NlpParser` token/interface, regex fallback, TOP-1/TOP-3, выбор первого ценового offer и ближайшей точки своей сети через Haversine, а также готовый русский `speech`. Catalog/dashboard логика не переписана.

## C. Changed files

- `backend/src/voice/voice-types.ts`, `backend/src/voice/voice-state.ts` — внутренние NLP/session types, `NlpParser` token/interface, merge и вопросы уточнения.
- `backend/src/voice/nlp/validate-nlp-result.ts`, `fallback-nlp-parser.ts`, `gemini-nlp-parser.ts`, `nlp.service.ts` — JSON validation, fallback, Gemini REST adapter, переключение на fallback.
- `backend/src/voice/sessions/voice-session.repository.ts`, `memory-voice-session.repository.ts`, `upstash-voice-session.repository.ts` — session interface/token, local test/demo adapter, официальный Upstash adapter.
- `backend/src/voice/voice.service.ts`, `voice.controller.ts`, `voice-continue.dto.ts` — оркестрация start/continue и HTTP validation.
- `backend/src/location/nearest-store.ts`, `backend/src/repositories.ts`, `backend/src/fixtures/repositories.ts` — StoreLocation repository и выбор ближайшей fixture-точки.
- `backend/src/app.module.ts` — DI для новых сервисов/адаптеров.
- `backend/.env.example` — пустые безопасные placeholders.
- `backend/package.json`, `backend/pnpm-lock.yaml` — только `@upstash/redis` 1.39.0.
- `backend/test/voice-start.test.ts` — focused validation, fallback, merge, nearest-store и HTTP integration tests.
- `scripts/create-clean-archive.mjs` — имя Part 03 archive.
- `docs/backend-1/reports/PART_03_REPORT.md` — этот отчёт.

## D. Voice contracts

`POST /api/voice/start` принимает `{ "text": "найди самое дешёвое молоко", "latitude": 43.6, "longitude": 51.1 }`. Пустой текст и неверные координаты → HTTP 400. Уточнение возвращает `status: "needs_clarification"`, UUID `sessionId`, `question`, `missingFields`; фактический ответ: `{"status":"needs_clarification","sessionId":"<uuid>","question":"Какой объём и жирность молока вам нужны?","missingFields":["volumeMl","fatPercent"]}`.

`POST /api/voice/continue` принимает `{ "sessionId": "<uuid>", "text": "один литр, 3.2 процента" }` без координат. Невалидный DTO → 400; неизвестная/истёкшая session → структурированный 404. Фактический result после уточнения: `{"status":"result","mode":"single","items":[{"name":"Молоко FoodMaster 3.2% 1 л","price":570,"store":"Dina","address":"Актау, демонстрационный адрес (не проверен)","distanceMeters":6782,"imageUrl":null}],"speech":"Самое дешёвое предложение: Молоко FoodMaster 3.2% 1 л за 570 тенге в Dina. Ближайшая точка — Актау, демонстрационный адрес (не проверен), примерно 6782 метра."}`. `search` возвращает `mode: "list"`, до трёх items. Публичные имена полей из Part 01 сохранены.

## E. NLP

Внутренний тип: `intent: cheapest | search | null`, `category: allowed slug | null`, `filters: Record<string, string | number | boolean | null>`. Gemini получает только текст и актуальные категории/filter schemas, без каталога и цен. Выход требуется в JSON через `generationConfig.responseFormat.text.mimeType=application/json`, дополнительно проверяется приложением: допустимый intent/category, объект filters, разрешённые ключи и типы/options, конечные числа; посторонние поля отклоняются. Модель не выбирает товар, цену, store или адрес. Использован встроенный `fetch` с одним запросом и timeout 8 с; модель `gemini-3.8-flash` выбрана по [официальному списку моделей](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), REST JSON schema — по [документации Google](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). SDK Gemini не добавлен.

При недоступном ключе, ошибке/timeout, invalid JSON или invalid schema применяется небольшой fallback. Он знает утверждённые слова для `milk/bread/eggs/sugar/oil`, `cheapest/search`, `500 мл`, `1 литр/1 л`, процент с точкой/запятой; значение `6%` распознаётся, но не проходит в текущую milk schema `[2.5,3.2]` и не становится фильтром. Только категории из `CategoryRepository` могут пройти дальше. Если информации не хватает, сервис задаёт уточнение.

## F. Sessions

Ключ `voice-session:<uuid>`, TTL 600 секунд; состояние содержит intent/category/filters/координаты. Новый непустой валидный ответ дополняет или обновляет состояние; null/отсутствующие поля не стирают известные, координаты сохраняются. При смене категории старые несовместимые фильтры удаляются. При повторном уточнении TTL обновляется. После финального результата session удаляется; при ошибке удаления истечёт по TTL.

Если обе Upstash credentials заданы в окружении, DI выбирает `@upstash/redis` adapter (`SET EX`, `GET`, `DEL` согласно [Upstash TypeScript docs](https://upstash.com/docs/redis/sdks/ts/getstarted)). Без credentials выбирается in-memory adapter для локального/test demo; он не делит состояние между процессами и не является live Redis проверкой. Ошибка доступности настроенного session provider возвращает структурированный 503. `.env.example` содержит только пустые placeholders; запуск не загружает `.env` автоматически, переменные надо предоставить окружением.

## G. Result logic

Завершённое состояние преобразуется в `ProductQuery` с `category`, разрешёнными фильтрами и `sort=price_asc`. Результат дополнительно нормализуется и сортируется в NestJS. `cheapest` берёт TOP-1, `search` TOP-3. Для каждого товара берётся самый дешёвый `offers[0]`, затем `StoreLocationRepository.findByStoreCode` и Haversine выбирают ближайшую точку этой сети; `distanceMeters` округляется до целого. Без offers товар пропускается; без локации остаются price/store, а address/distance становятся `null`, speech не заявляет ближайший адрес. Без совпадений возвращается обычный `result` с `items: []` и `speech: "Подходящих товаров не найдено."`. Gemini не участвует ни в одном выборе результата или речи.

## H. Tests / validation

- `rtk pnpm add @upstash/redis` — PASS; обновлён lockfile, добавлена одна прямая dependency.
- До изменений `rtk pnpm build`, `rtk pnpm test` — PASS, 7/7.
- После первой реализации `rtk pnpm build` — PASS; первый `rtk pnpm test` — FAIL: regex с `\b` не распознавал кириллическое «литр/мл». Regex исправлен. После добавления `NlpParser` token/interface последние `rtk pnpm build` и `rtk pnpm test` — PASS, 14/14 (старые catalog/dashboard + NLP validation/fallback + merge/TTL + nearest + HTTP start/continue + integration flow).
- `rtk pnpm start` и реальные `rtk curl -i` — PASS: incomplete start → HTTP 201 `needs_clarification`, continue с полученным sessionId → HTTP 201 `result` с 570 ₸/Dina/6782 м; direct complete start → HTTP 201 `result`; search → HTTP 201 `mode=list` с одним подходящим fixture-товаром; неверный start DTO → HTTP 400; неизвестная session → HTTP 404; `GET /api/products` → HTTP 200. После последней правки речи повторный smoke start/continue/search прошёл.
- `rtk git diff --check` — PASS для tracked diff.
- `rtk pnpm archive:clean`, `rtk proxy tar -tzf artifacts/backend-1-part-03-review.tar.gz` — PASS, см. раздел M. `rtk proxy` применён, так как у RTK нет специализированной команды listing tar.

## I. External provider status

LIVE GEMINI: **NOT RUN**. `GEMINI_API_KEY` отсутствует в окружении; HTTP/tests использовали fallback. Live Gemini JSON extraction не подтверждён.

LIVE UPSTASH: **NOT RUN**. `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` отсутствуют; HTTP/tests использовали memory session adapter. Live Redis TTL/GET/DEL не подтверждены.

Проверка наличия переменных выводила только `present/absent`, без значений.

## J. Real iPhone Shortcut

Статус: **NOT RUN**. На демонстрационном iPhone вручную создать Shortcut с именем `Продукты`:

1. `Dictate Text` → `Get Current Location` → извлечь `Latitude` и `Longitude` из location. Убедиться, что backend доступен с телефона; адрес API задаётся в Shortcut как `http://<reachable-host>:3000/api/voice/start` или доступный HTTPS URL, не в исходном коде.
2. `Get Contents of URL`: POST, JSON body `text` = диктовка, `latitude` и `longitude` = числовые значения. Получить dictionary поля `status`, `question`, `sessionId`, `speech`, `items`.
3. Если `status=needs_clarification`: `Speak Text(question)` → ещё один `Dictate Text` → POST `.../api/voice/continue` с JSON `{sessionId,text}`. Повторить при новом `needs_clarification`.
4. Если `status=result`: `Speak Text(speech)` → `Show Notification` с текстом speech или коротким списком items. При `imageUrl=null` использовать текст; rich image и screenshot не требуются.
5. Проверить на том же iPhone, который будет на защите, включая запуск Siri с заблокированного экрана: (A) «найди самое дешёвое молоко один литр 3.2 процента» — прямой TOP-1; (B) «найди самое дешёвое молоко» → «один литр, 3.2 процента» — уточнение; (C) «покажи цены на молоко один литр 3.2 процента» — `mode=list`. В текущих fixtures для (C) только один подходящий товар, что корректно для TOP-3.

## K. Integration impact

Web catalog/dashboard API и DTO Part 02 не менялись; Frontend изменений не требует. Shortcut получает согласованные `needs_clarification`/`result` поля. Backend 2 schema/parsers/import/matching не тронуты. Для Part 04 real DB adapter нужны существующие `CategoryRepository`, `ProductRepository` и новый `StoreLocationRepository.findByStoreCode`, реализуемый через документированные `Store.code` и `StoreLocation.storeId`; нового DB поля не требуется.

## L. Remaining issues

Данные и координаты fixture-точек демонстрационные, не подтверждённые реальные магазины. Live Gemini/Upstash и реальный iPhone ещё не проверены; при отсутствии Upstash credentials локальные sessions исчезают при рестарте и не работают между несколькими backend-процессами. Для live demo эти проверки и реальный dataset обязательны.

## M. Clean archive

Команда из `backend/`: `rtk pnpm archive:clean`; output: `artifacts/backend-1-part-03-review.tar.gz`. Listing через `rtk proxy tar -tzf` подтверждает исходники, tests, docs, lockfile, script и только placeholder `backend/.env.example`; `.git`, `TODO`, реальные `.env*`, credentials/private keys, `node_modules`, `dist/build`, coverage, logs/cache/test artifacts и `artifacts` в archive отсутствуют. Archive не включает себя.

## N. Status

READY_FOR_EXTERNAL_REVIEW
