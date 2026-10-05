# SCRUM-7: подключить Анвар и полноценно наполнить базу — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Спарсить **полные** каталоги Dina, Dana, Fix Price (и Анвар) в отдельные JSON-файлы — по одному на магазин, — затем сопоставить товары и разложить их по категориям с помощью LLM-агента. Результат собрать в bundle, который существующий Go `cmd/ingest` публикует как новый snapshot: сначала на тестовой БД, потом в Supabase.

**Architecture:** Новый офлайн-пакет `pipeline/` на TypeScript, независимый от NestJS: NestJS удаляется при cutover на Go (roadmap Part 19), поэтому пакет к нему не привязан. Пайплайн состоит из трёх стадий: `scrape:<store>` → `data/sources/<store>.json`, `agent:classify` (LLM-категоризация и атрибуты), `agent:match` (блокировка кандидатов → LLM-сопоставление → жёсткие guard'ы) → `data/agent/bundle.json`. Публикацию делает уже готовый `backend-go/cmd/ingest` (staging, quality gates, атомарный publish, advisory lock). Анвар подключается вторым этапом (Phase B), после разведки API мобильного приложения. Phase A (3 сети) не зависит от исхода этой разведки.

**Обновление 2026-10-06 (решение команды, Phase A2):** LLM используется **один раз** — разовые `agent:classify` + `agent:match` на бесплатных ключах Gemini. Их результат сохраняется в git как **словарь соответствий** `data/mapping/dictionary.json`: `магазин:id → карточка, категория, атрибуты`. Регулярное обновление цен 1–2 раза в сутки — команда `pnpm sync`: адаптеры + словарь → bundle → `cmd/ingest`, **без LLM**. Товары, которых нет в словаре, публикуются одиночными карточками с `reviewStatus=pending` и попадают в `data/sync/unmapped.json`. Их еженедельная обработка (`agent:new`) — отдельное решение Дениса о выборе агента, в этом плане она только описана (Task 18).

**Tech Stack:** Node 24 + TypeScript 5.8 + tsx, pnpm 10, vitest 3, zod 3, cheerio 1; Gemini REST (`GEMINI_MODEL`, ключи `GEMINI_API_KEY*` — уже используются в проекте); Go 1.27.1 + pgx v5 (`backend-go`); PostgreSQL 17 (Supabase `adil-baga`, ref `yowrsuztaadurovqvxmv`); Prisma 5.22 (только SQL-миграции); docker `postgres:17-alpine` в роли тестовой БД.

**Spec:** Jira [SCRUM-7](https://cryptonite.atlassian.net/browse/SCRUM-7) (эпик SCRUM-5 «Aktau Market», спринт «Подготовка к пилоту»). Требования к data layer: `docs/context/04_BACKEND_2_SCOPE.md`. Архитектура ingestion: `docs/PRODUCTION_ROADMAP_AKTAU_MARKET.md` (Part 08–09) и `docs/production/reports/PART_08_REPORT.md`.

Текст задачи (дословно, сокращено):
> У анвар есть мобильное приложение… берутся данные по API анвара. Либо сделай перехват запроса с iphone…, либо посмотри как сделано у arzan kz. Также с Dina, Dana, Fix Price нужно все цены спарсить. Лучше сначала все спарсить в json файл, один json на один магазин. Там все продукты, цены, ссылки на изображения. Затем дать эти 3-4 json файла агенту, чтобы он сам сопоставил продукты между собой, разбил на категории и так далее. Сначала протести на тестовой базе данных.

---

## Исходное состояние (на 2026-10-05)

**Репозиторий** `kiratonine/AdilBaga`. Вся актуальная работа лежит в ветке `integrate/full-stack`, а `main` отстаёт на ~120 коммитов. В ветке есть Next.js-фронтенд, `backend-go` (API и `cmd/ingest`), миграция `20261005000000_snapshot_history` и `contracts/openapi.yaml`.

**Supabase** (`adil-baga`, PG 17, применены 3 Prisma-миграции):

| Метрика | Значение |
|---|---|
| raw_products | 863 (Dina 564, Dana 279, Fix Price **20**) |
| canonical_products | 849, из них 606 в `other` |
| Канонических товаров в 2 сетях | **14** |
| Канонических товаров в 3 сетях | **0** |
| product_mappings | 861 deterministic/approved, 2 pending |
| Без картинки | 25 |
| snapshots | один `baseline-internal-v1` (published 2026-09-26) |
| Роли | `aktau_api_reader`, `aktau_api_runtime` (login), `aktau_ingest_writer` (nologin) |

**Источники (проверено 2026-10-05):**
- **Dina** — GraphQL `https://backend.dinamarket.kz/api/v1.1/customer/graph`, `shop_id=28` (Актау). `products(shop_id,_page,_limit)` отдаёт **не больше 24 товаров на страницу**, `pageInfo.total = 10757`, то есть около 449 страниц. Поле `categories { id name }` есть. Полей `barcode` и `ean` **нет**. Introspection закрыта. Текущий парсер забирает только около 7 категорий по 2–3 страницы.
- **Dana** — Bitrix HTML. Корневые разделы: `produkty_pitaniya_`, `bytovaya_khimiya`, `detskie_tovary`, `kosmetika_i_gigiena_`, `tovary_dlya_doma`. Карточек на странице 20, пагинация через `?PAGEN_1=N`. Текущий парсер берёт только первую страницу 15 подразделов.
- **Fix Price** — в репо лежит ручной файл на 20 товаров. `api.fix-price.kz/buyer/v1/...` отвечает 200, но без контекста города возвращает пустые данные (`x-count: 0`), а справочник `/location/city` содержит только города РФ. Как выставить Актау, нужно выяснять (Task 4).
- **Анвар** — `anvar.kz` — это корпоративный сайт на Bitrix без каталога с ценами. Мобильное приложение `com.astor.loyalty.mobile.anvar` сделано на white-label-платформе лояльности «Astor». На arzan.kz сети выбираются через `api.arzan.kz/api`, Анвар в бандле фронта не упоминается.

**Жёсткие ограничения существующего кода, которые план обязан учесть:**
1. `backend-go/internal/ingestion/bundle.go`: `stores = {DINA,DANA,FIX_PRICE}`. Bundle обязан содержать **каждую** сеть, а `sourceRuns` — ровно все сети. Каждый raw обязан входить ровно в одну группу, `version == "1.0"`, `attributes` содержат только скаляры.
2. `plan.go/resolve`: если в одну группу попали raw из **разных** прежних canonical, срабатывает `canonical_merge_conflict`. Если прежний canonical разошёлся на несколько групп — `canonical_split_conflict`. При перематчинге базы это сработает гарантированно (Task 10).
3. `plan.go`: категория группы обязана существовать в таблице `categories`, иначе `unknown_canonical_category` (Task 6).
4. `cmd/ingest` принимает только учётку, которая наследует `aktau_ingest_writer` и не является владельцем таблиц. Есть флаг `-apply`, без него идёт dry-run. Для production требуется `INGEST_PRODUCTION_APPLY_CONFIRM=1`.
5. Enum `"StoreCode"` в БД содержит DINA, DANA, FIX_PRICE. Он же продублирован в Prisma, Go, OpenAPI и фронте (Task 13).
6. «Анвар» в данных встречается и как **бренд** (сахар «Анвар», СТМ), а не только как сеть: `normalizer.service.ts:71`.

## Global Constraints

- Работать в ветке `feat/scrum-7-data`, созданной от `integrate/full-stack`, а **не** от `main`.
- Город: только **Актау** (Dina `shop_id=28`, Fix Price — контекст Актау, Анвар — магазины Актау).
- Цена в БД — целые тенге (`Int`), `price > 0`, `price ≤ 2147483647`. Для весовых товаров берётся цена за упаковку или за 1 кг (логика `DinaScraper.processProductItem`).
- Не коммитить cookies, токены, `cf_clearance`, `PHPSESSID`, HAR-файлы и личные данные из приложения Анвар. Временные секреты передаются только через env (`04_BACKEND_2_SCOPE.md` §26).
- Не обходить anti-bot и не делать production-scheduler (roadmap Part 08, «до автоматизации источников»). Это одноразовый snapshot. Между запросами пауза ≥ 300 мс, не больше 1 параллельного запроса к сайту.
- Политика уверенности AI-матчинга (`04_BACKEND_2_SCOPE.md` §16): `≥ 0.95` → `approved`, `0.80–0.949` → `pending`, `< 0.80` → не матчить.
- Никогда не матчить два raw **одной сети** в один canonical. Никогда не матчить разный объём, вес или количество в упаковке.
- Bundle должен проходить `ingestion.Decode` без изменений формата: `version: "1.0"`, поля `rawProducts`, `canonicalProducts`, `sourceRuns`.
- Сначала тестовая БД (локальный docker `postgres:17-alpine`), затем `-apply` без флага на Supabase (dry-run), и только после явного «ок» от Denis Andersen — `-apply` в production.
- Сгенерированные данные (`data/sources/*.json`, `data/agent/**`, `data/sync/**`) в git не коммитятся. Коммитятся только скрипты, фикстуры, отчёт и **словарь** `data/mapping/dictionary.json`.
- LLM (Gemini, бесплатные ключи) вызывается только в разовых командах `agent:classify` / `agent:match`. `pnpm sync` и всё, что он импортирует, не должны вызывать LLM и не должны требовать `GEMINI_API_KEY*`. Это решение Дениса от 2026-10-06.
- `sourceProductId` у каждого товара обязан быть стабильным между запусками: на нём держится словарь. Смена адаптера (например, Dana HTML → JSON) не должна менять формат id.
- Предварительные требования на машине: pnpm 10 (`corepack enable`), Go 1.27.1, Docker. На текущей Windows-машине сейчас установлен только Node 24.

## Порядок выполнения после обновления 2026-10-06

Task 1–10 выполнены. Дальше в таком порядке:
1. Task 11 Step 2: дорастить `agent:classify` (Gemini, кэш уже на 82%), но `agent:match` **пока не запускать**.
2. **Task 15** (словарь) — чтобы `agent:match` сразу писал и bundle, и словарь.
3. Task 11 Step 2: запустить `agent:match` (Gemini). Затем Task 11 Step 3–5 на тестовой БД. Step 6 (production) по-прежнему только после «ок» Дениса.
4. **Task 16** (`pnpm sync` без LLM) + проверка на тестовой БД.
5. **Task 17** (разведка JSON API у Dana).
6. Task 18 — не выполнять: это решение Дениса. Phase B — позже.

## Review Focus

1. **Перематчинг ломает публикацию.** Новые группы объединяют raw, которые в baseline были разными canonical, и ingest падает с `canonical_merge_conflict`. Человек ожидает, что публикация пройдёт, а старые ID сохранятся там, где это возможно. Тест: Task 10, `TestResolveReclusterMergeKeepsLargestPrevious`.
2. **Одна сеть упала или выдала неполные данные.** Например, Dana отдала 0 товаров из-за изменения вёрстки. Ожидание: файл сети не пишется и пайплайн останавливается, а не публикует snapshot без Dana. Тест: Task 1, `writeSourceFile rejects empty product list`. Gate `required_source_missing` в Go остаётся вторым рубежом.
3. **LLM вернула мусор**: невалидный JSON, чужой `id`, категорию вне таксономии, объём, который противоречит названию. Ожидание: ответ отбрасывается, повторяется один раз, затем товар уходит в `other` или в одиночную группу, без падения. Тесты: Task 7, `rejects unknown ids and categories`, `regex size wins over llm size`.
4. **Ложное сопоставление**: «Молоко 2.5% 1 л» и «Молоко 3.2% 1 л» одного бренда, или два товара одной сети в одной группе. Ожидание: группы разделены. Тесты: Task 8, `guard splits different fat`, `guard never merges same store`.
5. **«Анвар» как бренд, а не сеть.** Сахар «АНВАР» продаётся в Dina. Ожидание: он остаётся товаром Dina с брендом «Анвар», а его `storeCode` не превращается в ANVAR. Тест: Task 7, `keeps brand Анвар for non-anvar store`.
6. **Ежедневный `sync` на устаревших или неполных файлах.** Скрапер одной сети упал, а `sync` взял вчерашний файл или опубликовал snapshot без сети. Ожидание: отказ с понятной ошибкой. Тест: Task 16, `refuses stale or missing source files`.
7. **Повторный `sync` без новых товаров плодит новые карточки или меняет ID.** Ожидание: dry-run `cmd/ingest` в строгом режиме (без `-recluster`) показывает `newCanonicalCount: 0`. Проверка: Task 16 Step 5.

---

## File Structure

```text
pipeline/                                   # НОВЫЙ офлайн-пакет (не зависит от NestJS)
├── package.json, tsconfig.json, vitest.config.ts, .env.example
├── src/
│   ├── types.ts                 # StoreCode, SourceProduct, SourceFile (zod) — единый контракт файлов
│   ├── source-file.ts           # readSourceFile / writeSourceFile (+ валидация, атомарная запись)
│   ├── http.ts                  # politeFetch: пауза, ретраи, таймаут, UA
│   ├── scrapers/
│   │   ├── dina.ts              # полный GraphQL-каталог shop 28
│   │   ├── dana.ts              # все корневые разделы, PAGEN_1
│   │   ├── fixprice.ts          # API-клиент с контекстом Актау (или HAR)
│   │   ├── anvar.ts             # Phase B: маппер ответа API Анвара
│   │   └── har.ts               # общий извлекатель JSON-ответов из HAR
│   ├── agent/
│   │   ├── taxonomy.ts          # фиксированный список категорий (= строки таблицы categories)
│   │   ├── units.ts             # regex-извлечение объёма/веса/шт/жирности
│   │   ├── gemini.ts            # generateJson(): failover по ключам + дисковый кэш
│   │   ├── classify.ts          # LLM: категория, тип, бренд, атрибуты → ClassifiedProduct
│   │   ├── block.ts             # блокировка кандидатов
│   │   ├── match.ts             # LLM-кластеризация блока + guards
│   │   └── bundle.ts            # MatchGroup[] → Bundle v1.0 + quality report
│   └── cli/
│       ├── scrape.ts            # pnpm scrape:<store>
│       ├── classify.ts          # pnpm agent:classify
│       └── match.ts             # pnpm agent:match
└── test/ (*.test.ts + fixtures/)

backend/prisma/migrations/
├── 20261006000000_catalog_taxonomy/migration.sql     # Task 6
├── 20261007000000_store_anvar_enum/migration.sql     # Task 13 (Phase B)
└── 20261007000100_store_anvar_rows/migration.sql     # Task 13 (Phase B)

backend-go/internal/ingestion/plan.go, bundle.go, cmd/ingest/main.go   # Task 10, 12
backend-go/internal/catalog/models.go, internal/postgres/dashboard.go  # Task 13
contracts/openapi.yaml, frontend/src/api/types.ts, frontend/src/lib/stores.ts, frontend/src/lib/categoryIcons.ts
docs/data/ANVAR_SOURCE.md, docs/data/FIXPRICE_SOURCE.md, docs/data/SCRUM-7_REPORT.md
.gitignore

# Phase A2 (обновление 2026-10-06)
pipeline/src/mapping/dictionary.ts          # Task 15: словарь из bundle, чтение/запись, детерминированный формат
pipeline/src/sync/sync.ts                   # Task 16: bundle из свежих файлов + словарь, без LLM
pipeline/src/cli/sync.ts                    # Task 16: pnpm sync
pipeline/scripts/daily-sync.sh              # Task 16: scrape → sync → ingest (для cron/systemd в SCRUM-8)
data/mapping/dictionary.json                # Task 15: коммитится в git
docs/data/SYNC_RUNBOOK.md                   # Task 16
docs/data/DANA_SOURCE.md                    # Task 17
```

---

# PHASE A — полный каталог трёх сетей + агент

### Task 1: Пакет `pipeline/` и контракт файла источника

**Files:**
- Create: `pipeline/package.json`, `pipeline/tsconfig.json`, `pipeline/vitest.config.ts`, `pipeline/.env.example`
- Create: `pipeline/src/types.ts`, `pipeline/src/source-file.ts`, `pipeline/src/http.ts`
- Modify: `.gitignore`
- Test: `pipeline/test/source-file.test.ts`

**Interfaces:**
- Produces: `StoreCode`, `SourceProduct`, `SourceFile`, `SourceFileSchema`, `writeSourceFile(path, file)`, `readSourceFile(path): SourceFile`, `politeFetch(url, init?, opts?) : Promise<Response>`, `sleep(ms)`.

- [ ] **Step 1: Создать ветку и каркас пакета**

```bash
git fetch origin && git checkout -b feat/scrum-7-data origin/integrate/full-stack
mkdir -p pipeline/src/scrapers pipeline/src/agent pipeline/src/cli pipeline/test/fixtures
```

`pipeline/package.json`:
```json
{
  "name": "adilbaga-pipeline",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "scrape:dina": "tsx src/cli/scrape.ts DINA",
    "scrape:dana": "tsx src/cli/scrape.ts DANA",
    "scrape:fixprice": "tsx src/cli/scrape.ts FIX_PRICE",
    "scrape:anvar": "tsx src/cli/scrape.ts ANVAR",
    "agent:classify": "tsx src/cli/classify.ts",
    "agent:match": "tsx src/cli/match.ts"
  },
  "dependencies": { "cheerio": "^1.0.0", "dotenv": "^16.4.7", "zod": "^3.24.1" },
  "devDependencies": { "@types/node": "^22.10.7", "tsx": "^4.19.2", "typescript": "^5.8.0", "vitest": "^3.2.0" },
  "packageManager": "pnpm@10.32.1"
}
```

`pipeline/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "esModuleInterop": true,
    "skipLibCheck": true, "resolveJsonModule": true, "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`pipeline/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } })
```

`pipeline/.env.example`:
```text
GEMINI_API_KEY=
GEMINI_API_KEY2=
GEMINI_API_KEY3=
GEMINI_MODEL=gemini-3.1-flash-lite
# Fix Price: id города Актау и заголовки, найденные в Task 4
FIXPRICE_CITY_ID=
# Анвар: значения из docs/data/ANVAR_SOURCE.md (Task 12). Не коммитить.
ANVAR_API_BASE=
ANVAR_API_TOKEN=
ANVAR_STORE_ID=
```

В корневой `.gitignore` добавить:
```text
data/sources/
data/agent/
*.har
pipeline/.env
pipeline/node_modules/
```

Run: `cd pipeline && pnpm install`

- [ ] **Step 2: Написать падающий тест контракта**

`pipeline/test/source-file.test.ts`:
```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceFile, writeSourceFile } from '../src/source-file.js'
import type { SourceFile } from '../src/types.js'

const file = (products: SourceFile['products']): SourceFile => ({
  storeCode: 'DINA', city: 'Aktau', capturedAt: '2026-10-05T10:00:00.000Z', errorCount: 0,
  sourceStats: { pages: 1 }, products,
})
const milk = { sourceProductId: '1', name: 'Молоко 3,2% 1 л', price: 590, oldPrice: null,
  imageUrl: 'https://x/1.jpg', sourceUrl: null, brand: null, sourceCategoryPath: ['Молоко'], rawPayload: { id: 1 } }

describe('source file', () => {
  it('round-trips a valid file', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    writeSourceFile(path, file([milk]))
    expect(readSourceFile(path).products[0]?.name).toBe('Молоко 3,2% 1 л')
    expect(JSON.parse(readFileSync(path, 'utf8')).storeCode).toBe('DINA')
  })
  it('writeSourceFile rejects empty product list', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    expect(() => writeSourceFile(path, file([]))).toThrow(/no products/)
  })
  it('rejects non-positive and fractional prices', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    expect(() => writeSourceFile(path, file([{ ...milk, price: 0 }]))).toThrow()
    expect(() => writeSourceFile(path, file([{ ...milk, price: 10.5 }]))).toThrow()
  })
  it('rejects duplicate sourceProductId', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'src-')), 'dina.json')
    expect(() => writeSourceFile(path, file([milk, milk]))).toThrow(/duplicate/)
  })
})
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `cd pipeline && pnpm test source-file`
Expected: FAIL — `Cannot find module '../src/source-file.js'`

- [ ] **Step 4: Реализация**

`pipeline/src/types.ts`:
```ts
import { z } from 'zod'

export const STORE_CODES = ['DINA', 'DANA', 'FIX_PRICE', 'ANVAR'] as const
export type StoreCode = (typeof STORE_CODES)[number]

const price = z.number().int().positive().max(2_147_483_647)

export const SourceProductSchema = z.object({
  sourceProductId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price,
  oldPrice: price.nullable(),
  imageUrl: z.string().url().nullable(),
  sourceUrl: z.string().url().nullable(),
  brand: z.string().trim().min(1).nullable(),
  /** Путь категории в источнике, от корня к листу: ['Молочные продукты', 'Молоко'] */
  sourceCategoryPath: z.array(z.string()),
  rawPayload: z.record(z.unknown()),
})
export type SourceProduct = z.infer<typeof SourceProductSchema>

export const SourceFileSchema = z.object({
  storeCode: z.enum(STORE_CODES),
  city: z.literal('Aktau'),
  capturedAt: z.string().datetime(),
  errorCount: z.number().int().nonnegative(),
  sourceStats: z.record(z.union([z.number(), z.string(), z.boolean()])),
  products: z.array(SourceProductSchema),
})
export type SourceFile = z.infer<typeof SourceFileSchema>
```

`pipeline/src/source-file.ts`:
```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SourceFileSchema, type SourceFile } from './types.js'

function validate(input: unknown): SourceFile {
  const file = SourceFileSchema.parse(input)
  if (file.products.length === 0) throw new Error(`${file.storeCode}: no products — refusing to write`)
  const seen = new Set<string>()
  for (const p of file.products) {
    if (seen.has(p.sourceProductId)) throw new Error(`${file.storeCode}: duplicate sourceProductId ${p.sourceProductId}`)
    seen.add(p.sourceProductId)
  }
  return file
}

/** Атомарная запись: при падении посередине старый файл остаётся целым */
export function writeSourceFile(path: string, file: SourceFile): void {
  const valid = validate(file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify(valid, null, 2), 'utf8')
  renameSync(`${path}.tmp`, path)
}

export function readSourceFile(path: string): SourceFile {
  return validate(JSON.parse(readFileSync(path, 'utf8')))
}
```

`pipeline/src/http.ts`:
```ts
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'

export type PoliteOptions = { delayMs?: number; retries?: number; timeoutMs?: number; fetchImpl?: typeof fetch }

/** Один запрос за раз, пауза перед каждым, ретраи с backoff на сеть/5xx/429. 4xx (кроме 429) — сразу ошибка. */
export async function politeFetch(url: string, init: RequestInit = {}, opts: PoliteOptions = {}): Promise<Response> {
  const { delayMs = 300, retries = 3, timeoutMs = 30_000, fetchImpl = fetch } = opts
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    await sleep(attempt === 0 ? delayMs : delayMs * 2 ** attempt)
    try {
      const res = await fetchImpl(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'ru-RU,ru;q=0.9', ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return res
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status} ${url}`)
      lastError = new Error(`HTTP ${res.status} ${url}`)
    } catch (err) {
      if (err instanceof Error && /^HTTP 4/.test(err.message)) throw err
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`request failed ${url}`)
}
```

- [ ] **Step 5: Запустить тесты**

Run: `cd pipeline && pnpm test source-file && pnpm typecheck`
Expected: PASS (4 tests), typecheck без ошибок.

- [ ] **Step 6: Commit**

```bash
git add pipeline .gitignore
git commit -m "feat(pipeline): scaffold offline data pipeline with source file contract"
```

---

### Task 2: Dina — полный каталог

**Files:**
- Create: `pipeline/src/scrapers/dina.ts`, `pipeline/src/cli/scrape.ts`
- Test: `pipeline/test/dina.test.ts`, `pipeline/test/fixtures/dina-page.json`

**Interfaces:**
- Consumes: `politeFetch`, `SourceFile`, `SourceProduct`, `writeSourceFile`
- Produces: `scrapeDina(opts?: { fetchImpl?: typeof fetch; maxPages?: number; delayMs?: number }): Promise<SourceFile>`, `mapDinaItem(item: DinaItem): SourceProduct | null`, `type Scraper = (opts?) => Promise<SourceFile>`

- [ ] **Step 1: Фикстура** — `pipeline/test/fixtures/dina-page.json` (структура реального ответа, проверена 2026-10-05):

```json
{"data":{"products":{"pageInfo":{"total":3},"edges":[
  {"id":"5865","xid":"x5865","name":"Крупа Promo манная 700 г","slug":"krupa-promo-mannaya-700-g","price":361,"oldPrice":null,"price_type":"piece","isWeightProduct":false,"preview":{"url":"https://cdn.dina/5865.jpg"},"images":[],"stock":{"amount":12},"categories":[{"id":"7","name":"Макароны, крупы, мука"},{"id":"70","name":"Крупы"}]},
  {"id":"900","xid":"x900","name":"Огурцы тепличные","slug":"ogurcy","price":1.2,"oldPrice":null,"price_type":"weight","isWeightProduct":true,"preview":null,"images":[{"url":"https://cdn.dina/900.jpg"}],"stock":{"amount":5},"categories":[{"id":"1","name":"Овощи и фрукты"}]},
  {"id":"901","xid":"x901","name":"","slug":"bad","price":100,"oldPrice":null,"price_type":"piece","isWeightProduct":false,"preview":null,"images":[],"stock":null,"categories":[]}
]}}}
```

- [ ] **Step 2: Падающий тест**

`pipeline/test/dina.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapDinaItem, scrapeDina } from '../src/scrapers/dina.js'

const page = JSON.parse(readFileSync(new URL('./fixtures/dina-page.json', import.meta.url), 'utf8'))
const fakeFetch = (async () => new Response(JSON.stringify(page), { status: 200 })) as typeof fetch

describe('dina', () => {
  it('maps a piece item with category path and image', () => {
    const p = mapDinaItem(page.data.products.edges[0])!
    expect(p).toMatchObject({ sourceProductId: '5865', price: 361, imageUrl: 'https://cdn.dina/5865.jpg',
      sourceUrl: 'https://dinamarket.kz/product/krupa-promo-mannaya-700-g', sourceCategoryPath: ['Макароны, крупы, мука', 'Крупы'] })
  })
  it('converts per-gram weight price to per-kg integer tenge', () => {
    expect(mapDinaItem(page.data.products.edges[1])!.price).toBe(1200)
  })
  it('drops items without a name', () => {
    expect(mapDinaItem(page.data.products.edges[2])).toBeNull()
  })
  it('stops paging at pageInfo.total and records stats', async () => {
    const file = await scrapeDina({ fetchImpl: fakeFetch, delayMs: 0 })
    expect(file.storeCode).toBe('DINA')
    expect(file.products).toHaveLength(2)
    expect(file.sourceStats).toMatchObject({ total: 3, pages: 1, shopId: '28' })
  })
})
```

Run: `pnpm test dina` → Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация** `pipeline/src/scrapers/dina.ts`:

```ts
import { politeFetch, type PoliteOptions } from '../http.js'
import type { SourceFile, SourceProduct } from '../types.js'

const ENDPOINT = 'https://backend.dinamarket.kz/api/v1.1/customer/graph'
const SHOP_ID = '28' // Гипермаркет 301 «Дина», Актау, 33 мкр
const PAGE_SIZE = 24 // сервер режет _limit до 24 (проверено 2026-10-05)

const QUERY = `query getProducts($shopId: ID!, $page: Int, $limit: Int) {
  products(shop_id: $shopId, _page: $page, _limit: $limit) {
    pageInfo { total }
    edges { id xid name slug price oldPrice price_type isWeightProduct
      preview { url } images { url } stock { amount } categories { id name } }
  }
}`

export type DinaItem = {
  id?: string; xid?: string; name?: string; slug?: string; price?: number; oldPrice?: number | null
  price_type?: string; isWeightProduct?: boolean; preview?: { url?: string } | null
  images?: { url?: string }[]; stock?: { amount?: number } | null; categories?: { id: string; name: string }[]
}

/** Весовой товар: API отдаёт цену за грамм → приводим к цене за кг (или за вес из названия) */
function weightMultiplier(name: string): number {
  const kg = name.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)/i)
  if (kg) return parseFloat(kg[1]!.replace(',', '.')) * 1000
  const g = name.match(/(\d+(?:[.,]\d+)?)\s*(?:г|гр|g)\b/i)
  if (g && parseFloat(g[1]!) > 50) return parseFloat(g[1]!)
  return 1000
}

export function mapDinaItem(item: DinaItem): SourceProduct | null {
  const name = item.name?.trim() ?? ''
  const raw = Number(item.price)
  if (!name || !Number.isFinite(raw) || raw <= 0) return null
  const weight = item.price_type === 'weight' || item.isWeightProduct === true
  const k = weight ? weightMultiplier(name) : 1
  const price = Math.round(raw * k)
  const old = item.oldPrice ? Math.round(Number(item.oldPrice) * k) : null
  if (price <= 0) return null
  return {
    sourceProductId: String(item.id ?? item.xid),
    name,
    price,
    oldPrice: old && old > price ? old : null,
    imageUrl: item.preview?.url || item.images?.find((i) => i.url)?.url || null,
    sourceUrl: item.slug ? `https://dinamarket.kz/product/${item.slug}` : null,
    brand: null,
    sourceCategoryPath: (item.categories ?? []).map((c) => c.name),
    rawPayload: { ...item, pricePerUnitMultiplier: k },
  }
}

export async function scrapeDina(opts: { fetchImpl?: typeof fetch; maxPages?: number; delayMs?: number } = {}): Promise<SourceFile> {
  const http: PoliteOptions = { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 }
  const products = new Map<string, SourceProduct>()
  let total = Infinity, page = 1, errorCount = 0
  while ((page - 1) * PAGE_SIZE < total && page <= (opts.maxPages ?? 1000)) {
    try {
      const res = await politeFetch(ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { shopId: SHOP_ID, page, limit: PAGE_SIZE } }),
      }, http)
      const body = (await res.json()) as { data?: { products?: { pageInfo?: { total?: number }; edges?: DinaItem[] } } }
      const edges = body.data?.products?.edges ?? []
      total = body.data?.products?.pageInfo?.total ?? total
      if (edges.length === 0) break
      for (const e of edges) {
        const p = mapDinaItem(e)
        if (p && !products.has(p.sourceProductId)) products.set(p.sourceProductId, p)
      }
    } catch (err) {
      errorCount++
      console.warn(`[DINA] page ${page}: ${(err as Error).message}`)
      if (errorCount > 10) throw new Error('DINA: too many page errors, aborting')
    }
    if (page % 25 === 0) console.log(`[DINA] page ${page}, products ${products.size}/${total}`)
    page++
  }
  return {
    storeCode: 'DINA', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount,
    sourceStats: { shopId: SHOP_ID, total: Number.isFinite(total) ? total : -1, pages: page - 1 },
    products: [...products.values()],
  }
}
```

`pipeline/src/cli/scrape.ts`:
```ts
import 'dotenv/config'
import { resolve } from 'node:path'
import { writeSourceFile } from '../source-file.js'
import { STORE_CODES, type SourceFile, type StoreCode } from '../types.js'
import { scrapeDina } from '../scrapers/dina.js'

export type Scraper = () => Promise<SourceFile>
const SCRAPERS: Partial<Record<StoreCode, Scraper>> = { DINA: () => scrapeDina() }

const code = process.argv[2] as StoreCode
const scraper = STORE_CODES.includes(code) ? SCRAPERS[code] : undefined
if (!scraper) { console.error(`usage: scrape <${Object.keys(SCRAPERS).join('|')}>`); process.exit(2) }
const file = await scraper()
const out = resolve(import.meta.dirname, '../../../data/sources', `${code.toLowerCase()}.json`)
writeSourceFile(out, file)
const withImage = file.products.filter((p) => p.imageUrl).length
console.log(`[${code}] ${file.products.length} products, images ${withImage}, errors ${file.errorCount} → ${out}`)
```

- [ ] **Step 4: Тесты** — Run: `pnpm test dina` → Expected: PASS (4).

- [ ] **Step 5: Живой прогон (займёт около 3 минут: 449 страниц × 300 мс)**

Run: `pnpm scrape:dina`
Expected: в логе `[DINA] ≈10700 products` (допустимо ±5% от `pageInfo.total`). Вручную сверить 3 случайные цены с dinamarket.kz (Актау, 33 мкр) и записать результат в `docs/data/SCRUM-7_REPORT.md` (раздел «Dina»).

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/scrapers/dina.ts pipeline/src/cli/scrape.ts pipeline/test/dina.test.ts pipeline/test/fixtures/dina-page.json
git commit -m "feat(pipeline): scrape full Dina Aktau catalog via paged GraphQL"
```

---

### Task 3: Dana — полный каталог

**Files:**
- Create: `pipeline/src/scrapers/dana.ts`
- Modify: `pipeline/src/cli/scrape.ts` (регистрация DANA)
- Test: `pipeline/test/dana.test.ts`, `pipeline/test/fixtures/dana-page.html`

**Interfaces:**
- Consumes: `politeFetch`, `SourceFile`, `SourceProduct`
- Produces: `parseDanaPage(html: string, sectionPath: string[]): SourceProduct[]`, `scrapeDana(opts?): Promise<SourceFile>`, `DANA_ROOTS: { path: string; name: string }[]`

- [ ] **Step 1: Фикстура** — сохранить реальную страницу. Затем открыть файл и убедиться, что в нём есть `.catalog_item_wrapp`, `.item-title a`, `.price_value` и `.price_old`:

```bash
curl -sL -A "Mozilla/5.0" "https://dana-market.kz/catalog/produkty_pitaniya_/bakaleya/krupy/" -o pipeline/test/fixtures/dana-page.html
```

- [ ] **Step 2: Падающий тест**

`pipeline/test/dana.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDanaPage, scrapeDana } from '../src/scrapers/dana.js'

const html = readFileSync(new URL('./fixtures/dana-page.html', import.meta.url), 'utf8')

describe('dana', () => {
  it('parses every card on a catalog page', () => {
    const items = parseDanaPage(html, ['Продукты питания', 'Крупы'])
    expect(items.length).toBe(20)
    for (const p of items) {
      expect(p.sourceProductId).toMatch(/^dana_\d+$/)
      expect(p.price).toBeGreaterThan(0)
      expect(p.sourceUrl).toMatch(/^https:\/\/dana-market\.kz\//)
      expect(p.sourceCategoryPath).toEqual(['Продукты питания', 'Крупы'])
    }
  })
  it('stops paging when a page brings no new ids', async () => {
    let calls = 0
    const fakeFetch = (async () => { calls++; return new Response(html, { status: 200 }) }) as typeof fetch
    const file = await scrapeDana({ fetchImpl: fakeFetch, delayMs: 0, roots: [{ path: '/catalog/x/', name: 'X' }] })
    expect(calls).toBe(2) // page 1 новые, page 2 те же → стоп
    expect(file.products).toHaveLength(20)
  })
})
```

Run: `pnpm test dana` → FAIL.

- [ ] **Step 3: Реализация** `pipeline/src/scrapers/dana.ts`:

```ts
import * as cheerio from 'cheerio'
import { politeFetch } from '../http.js'
import type { SourceFile, SourceProduct } from '../types.js'

const BASE = 'https://dana-market.kz'
export const DANA_ROOTS = [
  { path: '/catalog/produkty_pitaniya_/', name: 'Продукты питания' },
  { path: '/catalog/bytovaya_khimiya/', name: 'Бытовая химия' },
  { path: '/catalog/detskie_tovary/', name: 'Детские товары' },
  { path: '/catalog/kosmetika_i_gigiena_/', name: 'Косметика и гигиена' },
  { path: '/catalog/tovary_dlya_doma/', name: 'Товары для дома' },
]
const MAX_PAGES_PER_ROOT = 500

const digits = (s: string) => { const d = s.replace(/[^0-9]/g, ''); return d ? parseInt(d, 10) : 0 }
const abs = (u: string | undefined) => (!u ? null : u.startsWith('http') ? u : `${BASE}${u}`)

export function parseDanaPage(html: string, sectionPath: string[]): SourceProduct[] {
  const $ = cheerio.load(html)
  const out: SourceProduct[] = []
  $('.catalog_item_wrapp, .catalog-block-view__item').each((_, el) => {
    const card = $(el)
    const rawId = card.attr('data-id') || card.find('[data-id]').attr('data-id') || card.attr('id')?.replace(/[^0-9]/g, '')
    const title = card.find('.item-title a').first()
    const name = title.text().trim()
    const price = digits(card.find('.price_value').first().text())
    if (!rawId || !name || price <= 0) return
    const old = digits(card.find('.price_old .price_value').first().text())
    const img = card.find('.image_wrapper_block img, picture img').first()
    // В «хлебных крошках» карточки Bitrix пишет раздел; если его нет — путь корня
    const crumb = card.find('.item-section, .section-name').first().text().trim()
    out.push({
      sourceProductId: `dana_${rawId}`,
      name,
      price,
      oldPrice: old > price ? old : null,
      imageUrl: abs(img.attr('data-src') || img.attr('src')),
      sourceUrl: abs(title.attr('href')),
      brand: null,
      sourceCategoryPath: crumb ? [...sectionPath, crumb] : sectionPath,
      rawPayload: { rawId, name, price, oldPrice: old || null, section: sectionPath.join(' / ') },
    })
  })
  return out
}

export async function scrapeDana(opts: { fetchImpl?: typeof fetch; delayMs?: number; roots?: typeof DANA_ROOTS } = {}): Promise<SourceFile> {
  const products = new Map<string, SourceProduct>()
  let errorCount = 0, pages = 0
  for (const root of opts.roots ?? DANA_ROOTS) {
    for (let page = 1; page <= MAX_PAGES_PER_ROOT; page++) {
      let fresh = 0
      try {
        const res = await politeFetch(`${BASE}${root.path}?PAGEN_1=${page}`, {}, { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 })
        pages++
        for (const p of parseDanaPage(await res.text(), [root.name])) {
          if (!products.has(p.sourceProductId)) { products.set(p.sourceProductId, p); fresh++ }
        }
      } catch (err) {
        errorCount++
        console.warn(`[DANA] ${root.path} p${page}: ${(err as Error).message}`)
        break
      }
      // Bitrix на странице за пределами диапазона отдаёт последнюю страницу → новых id нет
      if (fresh === 0) break
    }
    console.log(`[DANA] ${root.name}: total ${products.size}`)
  }
  return { storeCode: 'DANA', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount,
    sourceStats: { pages, roots: (opts.roots ?? DANA_ROOTS).length }, products: [...products.values()] }
}
```

В `cli/scrape.ts` добавить импорт и строку `DANA: () => scrapeDana(),` в `SCRAPERS`.

- [ ] **Step 4: Тесты** — `pnpm test dana` → PASS. Если в фикстуре окажется не 20 карточек, исправить число в тесте на фактическое, проверив его вручную в HTML.

- [ ] **Step 5: Живой прогон** — `pnpm scrape:dana`. Ожидается несколько тысяч товаров. Сверить 3 цены с dana-market.kz и записать в отчёт. Проверить, что у Dana цена **для Актау**: если на сайте есть выбор города или магазина, зафиксировать это в отчёте.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/scrapers/dana.ts pipeline/src/cli/scrape.ts pipeline/test/dana.test.ts pipeline/test/fixtures/dana-page.html
git commit -m "feat(pipeline): scrape all Dana catalog roots with PAGEN pagination"
```

---

### Task 4: Fix Price — контекст Актау и полный каталог

**Files:**
- Create: `docs/data/FIXPRICE_SOURCE.md`, `pipeline/src/scrapers/har.ts`, `pipeline/src/scrapers/fixprice.ts`
- Modify: `pipeline/src/cli/scrape.ts`
- Test: `pipeline/test/fixprice.test.ts`, `pipeline/test/har.test.ts`, `pipeline/test/fixtures/fixprice-products.json`

**Interfaces:**
- Produces: `extractJsonResponses(har: Har, urlPattern: RegExp): unknown[]`, `mapFixPriceItem(item: FixPriceItem): SourceProduct | null`, `scrapeFixPrice(opts?): Promise<SourceFile>`, `loadFixPriceFromHar(harPath: string): SourceFile`

- [ ] **Step 1: Разведка (таймбокс 2 часа, вручную)**

1. Открыть `https://fix-price.kz/ru/catalog` в Chrome, DevTools → Network → фильтр `api.fix-price`.
2. Выбрать город **Актау** и записать, какой запрос это делает, какие заголовки и cookie появились (`x-city`, `x-key`, `locality`…) и какой у Актау id.
3. Открыть категорию «Продукты и напитки». Записать URL запроса списка товаров, параметры пагинации, заголовок с общим количеством (`x-count`) и **полный JSON одного ответа**. Ответ сохранить в `pipeline/test/fixtures/fixprice-products.json`, оставив 3 товара.
4. Повторить запрос через `curl` с найденными заголовками. Если данные пришли, путь A (API-клиент). Если нет (Cloudflare или токен сессии) — путь B (HAR): прокрутить нужные категории в браузере, затем DevTools → Network → «Save all as HAR» → `data/sources/raw/fixprice.har`. HAR не коммитить.
5. Всё найденное, кроме секретов, записать в `docs/data/FIXPRICE_SOURCE.md`: эндпоинты, заголовки, id города, лимиты страниц, выбранный путь.

- [ ] **Step 2: Падающие тесты**

`pipeline/test/har.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { extractJsonResponses } from '../src/scrapers/har.js'

const har = { log: { entries: [
  { request: { url: 'https://api.fix-price.kz/buyer/v1/product/in/x?page=1' }, response: { status: 200, content: { mimeType: 'application/json', text: '[{"id":1}]' } } },
  { request: { url: 'https://api.fix-price.kz/buyer/v1/product/in/x?page=2' }, response: { status: 200, content: { mimeType: 'application/json', text: 'eyJpZCI6Mn0=', encoding: 'base64' } } },
  { request: { url: 'https://fix-price.kz/logo.svg' }, response: { status: 200, content: { mimeType: 'image/svg+xml', text: '<svg/>' } } },
  { request: { url: 'https://api.fix-price.kz/buyer/v1/product/in/x?page=3' }, response: { status: 500, content: { mimeType: 'application/json', text: '{}' } } },
] } }

describe('har', () => {
  it('returns parsed JSON bodies of successful matching requests, decoding base64', () => {
    expect(extractJsonResponses(har, /\/product\/in\//)).toEqual([[{ id: 1 }], { id: 2 }])
  })
})
```

`pipeline/test/fixprice.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapFixPriceItem } from '../src/scrapers/fixprice.js'

const items = JSON.parse(readFileSync(new URL('./fixtures/fixprice-products.json', import.meta.url), 'utf8'))

describe('fix price', () => {
  it('maps captured items to source products with absolute urls', () => {
    const p = mapFixPriceItem(items[0])!
    expect(p.sourceProductId).toMatch(/^fp_/)
    expect(p.price).toBeGreaterThan(0)
    expect(p.sourceUrl).toMatch(/^https:\/\/fix-price\.kz\/ru\/catalog\//)
    expect(p.imageUrl === null || p.imageUrl.startsWith('https://')).toBe(true)
  })
  it('uses special price as price and regular as oldPrice', () => {
    const p = mapFixPriceItem({ id: 7, title: 'Т', url: 'a/b', price: '500', specialPrice: { price: '400' }, images: [], brand: null })!
    expect(p).toMatchObject({ price: 400, oldPrice: 500 })
  })
})
```

Run: `pnpm test fixprice har` → FAIL.

- [ ] **Step 3: Реализация**

`pipeline/src/scrapers/har.ts`:
```ts
export type Har = { log: { entries: { request: { url: string }; response: { status: number; content: { mimeType?: string; text?: string; encoding?: string } } }[] } }

export function extractJsonResponses(har: Har, urlPattern: RegExp): unknown[] {
  const out: unknown[] = []
  for (const e of har.log.entries) {
    const c = e.response.content
    if (e.response.status !== 200 || !urlPattern.test(e.request.url) || !c.text || !c.mimeType?.includes('json')) continue
    const text = c.encoding === 'base64' ? Buffer.from(c.text, 'base64').toString('utf8') : c.text
    try { out.push(JSON.parse(text)) } catch { /* обрезанный ответ в HAR — пропускаем */ }
  }
  return out
}
```

`pipeline/src/scrapers/fixprice.ts` использует форму ответа платформы Fix Price (`id`, `title`, `url`, `price`, `specialPrice.price`, `images[].src`, `brand.title`). **Сверить её с фикстурой из Step 1.** Если имена полей отличаются, поправить тип `FixPriceItem` и `mapFixPriceItem` до совпадения с фикстурой, а тесты не трогать.

```ts
import { readFileSync } from 'node:fs'
import { politeFetch } from '../http.js'
import type { SourceFile, SourceProduct } from '../types.js'
import { extractJsonResponses, type Har } from './har.js'

const API = 'https://api.fix-price.kz/buyer/v1'
const SITE = 'https://fix-price.kz/ru/catalog/'
const PAGE = 24

export type FixPriceItem = {
  id: number | string; title: string; url: string; price: string | number
  specialPrice?: { price: string | number } | null; images?: { src: string }[]; brand?: { title: string } | null
  category?: { title?: string } | null
}

export function mapFixPriceItem(item: FixPriceItem): SourceProduct | null {
  const regular = Math.round(Number(item.price))
  const special = item.specialPrice ? Math.round(Number(item.specialPrice.price)) : NaN
  const price = Number.isFinite(special) && special > 0 && special < regular ? special : regular
  if (!item.title?.trim() || !Number.isFinite(price) || price <= 0) return null
  const img = item.images?.[0]?.src
  return {
    sourceProductId: `fp_${item.id}`,
    name: item.title.trim(),
    price,
    oldPrice: price < regular ? regular : null,
    imageUrl: img ? (img.startsWith('http') ? img : `https://img.fix-price.kz${img}`) : null,
    sourceUrl: `${SITE}${item.url.replace(/^\/+/, '')}`,
    brand: item.brand?.title?.trim() || null,
    sourceCategoryPath: item.category?.title ? [item.category.title] : [],
    rawPayload: item as unknown as Record<string, unknown>,
  }
}

function collect(lists: unknown[], stats: SourceFile['sourceStats'], errorCount: number): SourceFile {
  const products = new Map<string, SourceProduct>()
  for (const list of lists) for (const raw of Array.isArray(list) ? list : []) {
    const p = mapFixPriceItem(raw as FixPriceItem)
    if (p && !products.has(p.sourceProductId)) products.set(p.sourceProductId, p)
  }
  return { storeCode: 'FIX_PRICE', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount, sourceStats: stats, products: [...products.values()] }
}

/** Путь B: HAR, сохранённый из браузера с выбранным Актау */
export function loadFixPriceFromHar(harPath: string): SourceFile {
  const har = JSON.parse(readFileSync(harPath, 'utf8')) as Har
  const lists = extractJsonResponses(har, /\/buyer\/v1\/product\/in\//)
  return collect(lists, { mode: 'har', responses: lists.length }, 0)
}

/** Путь A: прямой API с контекстом города (заголовок и id — из FIXPRICE_SOURCE.md) */
export async function scrapeFixPrice(opts: { fetchImpl?: typeof fetch; delayMs?: number } = {}): Promise<SourceFile> {
  const city = process.env.FIXPRICE_CITY_ID
  if (!city) throw new Error('FIXPRICE_CITY_ID is not set (see docs/data/FIXPRICE_SOURCE.md)')
  const headers = { 'x-city': city, 'x-language': 'ru', 'content-type': 'application/json' }
  const http = { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 }
  const menu = (await (await politeFetch(`${API}/category/menu`, { headers }, http)).json()) as { alias: string }[]
  const lists: unknown[] = []
  let errorCount = 0
  for (const { alias } of menu) {
    for (let page = 1; ; page++) {
      try {
        const res = await politeFetch(`${API}/product/in/${alias}?page=${page}&limit=${PAGE}&sort=sold`, {
          method: 'POST', headers, body: JSON.stringify({ category: alias, brand: [], price: [], isDividedPrice: false, isNew: false, isHit: false, isSpecialPrice: false }),
        }, http)
        const list = (await res.json()) as unknown[]
        lists.push(list)
        if (!Array.isArray(list) || list.length < PAGE) break
      } catch (err) { errorCount++; console.warn(`[FIX_PRICE] ${alias} p${page}: ${(err as Error).message}`); break }
    }
  }
  return collect(lists, { mode: 'api', categories: menu.length }, errorCount)
}
```

В `cli/scrape.ts` добавить:
```ts
FIX_PRICE: () => process.env.FIXPRICE_HAR ? Promise.resolve(loadFixPriceFromHar(process.env.FIXPRICE_HAR)) : scrapeFixPrice(),
```

- [ ] **Step 4: Тесты** — `pnpm test fixprice har` → PASS.

- [ ] **Step 5: Живой прогон.** Путь A: `pnpm scrape:fixprice`. Путь B: `FIXPRICE_HAR=../data/sources/raw/fixprice.har pnpm scrape:fixprice`. Ожидается ≥ 500 товаров, при меньшем числе зафиксировать в отчёте, какие категории не покрыты. Сверить 3 цены с сайтом при выбранном Актау.

- [ ] **Step 6: Commit**

```bash
git add docs/data/FIXPRICE_SOURCE.md pipeline/src/scrapers/har.ts pipeline/src/scrapers/fixprice.ts pipeline/src/cli/scrape.ts pipeline/test/har.test.ts pipeline/test/fixprice.test.ts pipeline/test/fixtures/fixprice-products.json
git commit -m "feat(pipeline): Fix Price Aktau catalog via API or browser HAR"
```

---

### Task 5: Регекс-атрибуты (детерминированная страховка для агента)

**Files:**
- Create: `pipeline/src/agent/units.ts`
- Test: `pipeline/test/units.test.ts`

**Interfaces:**
- Produces: `type Size = { volumeMl?: number; weightGrams?: number; packageCount?: number }`, `extractSize(name: string): Size`, `extractFat(name: string): number | null`, `normalizeText(s: string): string`

- [ ] **Step 1: Падающий тест** — `pipeline/test/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractFat, extractSize, normalizeText } from '../src/agent/units.js'

describe('units', () => {
  it.each([
    ['Молоко FoodMaster 3,2% 1 л', { volumeMl: 1000 }],
    ['Молоко 0,5л', { volumeMl: 500 }],
    ['Масло подсолнечное 900 мл', { volumeMl: 900 }],
    ['Сахар 1кг', { weightGrams: 1000 }],
    ['Крупа манная 700 г', { weightGrams: 700 }],
    ['Яйцо С1 10 шт', { packageCount: 10 }],
    ['Вода 6х1.5 л', { volumeMl: 1500, packageCount: 6 }],
    ['Хлеб Бородинский', {}],
  ])('%s', (name, size) => expect(extractSize(name)).toEqual(size))
  it('fat percent with comma decimals', () => {
    expect(extractFat('Кефир 2,5%')).toBe(2.5)
    expect(extractFat('Сок 100%')).toBeNull()
  })
  it('normalizes ё, quotes and spaces', () => {
    expect(normalizeText('  Сахар «АНВАР»  ёлка ')).toBe('сахар анвар елка')
  })
})
```

Run: `pnpm test units` → FAIL.

- [ ] **Step 2: Реализация** `pipeline/src/agent/units.ts`:

```ts
export type Size = { volumeMl?: number; weightGrams?: number; packageCount?: number }

export const normalizeText = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/["'«»„“”]/g, ' ').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim()

const num = (v: string) => parseFloat(v.replace(',', '.'))

export function extractSize(name: string): Size {
  const t = normalizeText(name)
  const size: Size = {}
  const multi = t.match(/(\d+)\s*[xх×*]\s*(\d+(?:\.\d+)?)\s*(л|мл|кг|г)\b/)
  if (multi) size.packageCount = parseInt(multi[1]!, 10)
  const l = t.match(/(\d+(?:\.\d+)?)\s*(?:л|l|литр\w*)(?![а-я])/)
  const ml = t.match(/(\d+(?:\.\d+)?)\s*(?:мл|ml)\b/)
  const kg = t.match(/(\d+(?:\.\d+)?)\s*(?:кг|kg)\b/)
  const g = t.match(/(\d+(?:\.\d+)?)\s*(?:г|гр|g)(?![а-я])/)
  const pcs = t.match(/(\d+)\s*(?:шт|штук)/)
  if (ml) size.volumeMl = Math.round(num(ml[1]!))
  else if (l && num(l[1]!) > 0 && num(l[1]!) < 50) size.volumeMl = Math.round(num(l[1]!) * 1000)
  if (kg && num(kg[1]!) > 0 && num(kg[1]!) < 50) size.weightGrams = Math.round(num(kg[1]!) * 1000)
  else if (g && !size.volumeMl) size.weightGrams = Math.round(num(g[1]!))
  if (pcs && !size.packageCount) size.packageCount = parseInt(pcs[1]!, 10)
  return size
}

export function extractFat(name: string): number | null {
  const m = normalizeText(name).match(/(\d+(?:\.\d+)?)\s*%/)
  if (!m) return null
  const v = num(m[1]!)
  return v >= 0.1 && v < 100 ? v : null
}
```

- [ ] **Step 3: Тесты** — `pnpm test units` → PASS.
- [ ] **Step 4: Commit** — `git add pipeline/src/agent/units.ts pipeline/test/units.test.ts && git commit -m "feat(pipeline): regex size and fat extraction"`

---

### Task 6: Таксономия категорий (код + миграция БД)

**Files:**
- Create: `pipeline/src/agent/taxonomy.ts`
- Create: `backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql`
- Modify: `frontend/src/lib/categoryIcons.ts` (иконки для новых слагов, у которых есть подходящая иконка в `Icon.tsx`)
- Test: `pipeline/test/taxonomy.test.ts`

**Interfaces:**
- Produces: `CATEGORIES: readonly { slug: string; name: string; filters: { key: string; label: string; type: 'multi-select' | 'boolean' }[] }[]`, `CategorySlug`, `isCategorySlug(s): s is CategorySlug`

Существующие слаги `milk`, `bread`, `eggs`, `sugar`, `oil`, `other` **сохраняются**: на них завязаны слоты корзины в `dashboard.go` (`milk`/`sugar`/`oil` + `volumeMl`/`weightGrams = 1000`) и ID категорий в URL фронта. Новые слаги добавляются.

- [ ] **Step 1: Падающий тест** — `pipeline/test/taxonomy.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategorySlug } from '../src/agent/taxonomy.js'

const sql = readFileSync(new URL('../../backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql', import.meta.url), 'utf8')

describe('taxonomy', () => {
  it('keeps legacy slugs used by dashboard baskets', () => {
    for (const s of ['milk', 'bread', 'eggs', 'sugar', 'oil', 'other']) expect(isCategorySlug(s)).toBe(true)
  })
  it('migration inserts every taxonomy slug', () => {
    for (const c of CATEGORIES) expect(sql).toContain(`'${c.slug}'`)
  })
  it('slugs are unique and kebab-case', () => {
    const slugs = CATEGORIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })
})
```

Run: `pnpm test taxonomy` → FAIL.

- [ ] **Step 2: Реализация** `pipeline/src/agent/taxonomy.ts`:

```ts
const size = (key: 'volumeMl' | 'weightGrams', label: string) => ({ key, label, type: 'multi-select' as const })
const brand = { key: 'brand', label: 'Бренд', type: 'multi-select' as const }

export const CATEGORIES = [
  { slug: 'milk', name: 'Молоко и сливки', filters: [size('volumeMl', 'Объём'), { key: 'fatPercent', label: 'Жирность', type: 'multi-select' }, brand] },
  { slug: 'dairy', name: 'Кисломолочные продукты и сыры', filters: [{ key: 'fatPercent', label: 'Жирность', type: 'multi-select' }, brand] },
  { slug: 'eggs', name: 'Яйца', filters: [{ key: 'packageCount', label: 'Количество', type: 'multi-select' }] },
  { slug: 'bread', name: 'Хлеб и выпечка', filters: [size('weightGrams', 'Вес'), brand] },
  { slug: 'meat', name: 'Мясо и птица', filters: [brand] },
  { slug: 'fish', name: 'Рыба и морепродукты', filters: [brand] },
  { slug: 'sausages', name: 'Колбасы и деликатесы', filters: [brand] },
  { slug: 'vegetables', name: 'Овощи, фрукты, зелень', filters: [] },
  { slug: 'groats', name: 'Крупы, макароны, мука', filters: [size('weightGrams', 'Вес'), brand] },
  { slug: 'sugar', name: 'Сахар и соль', filters: [size('weightGrams', 'Вес')] },
  { slug: 'oil', name: 'Растительные масла', filters: [size('volumeMl', 'Объём'), brand] },
  { slug: 'canned', name: 'Консервы', filters: [brand] },
  { slug: 'sauces', name: 'Соусы и специи', filters: [brand] },
  { slug: 'sweets', name: 'Сладости и снеки', filters: [brand] },
  { slug: 'tea-coffee', name: 'Чай и кофе', filters: [brand] },
  { slug: 'drinks', name: 'Напитки и вода', filters: [size('volumeMl', 'Объём'), brand] },
  { slug: 'frozen', name: 'Замороженные продукты', filters: [brand] },
  { slug: 'baby', name: 'Детские товары', filters: [brand] },
  { slug: 'household', name: 'Бытовая химия', filters: [brand] },
  { slug: 'hygiene', name: 'Гигиена и косметика', filters: [brand] },
  { slug: 'home', name: 'Товары для дома', filters: [] },
  { slug: 'other', name: 'Прочие товары', filters: [] },
] as const

export type CategorySlug = (typeof CATEGORIES)[number]['slug']
const SLUGS = new Set<string>(CATEGORIES.map((c) => c.slug))
export const isCategorySlug = (s: string): s is CategorySlug => SLUGS.has(s)
```

`backend/prisma/migrations/20261006000000_catalog_taxonomy/migration.sql`. Это data-only миграция: существующие ID не трогаются, новые получают детерминированные id `cat-<slug>`:

```sql
-- Catalog taxonomy for SCRUM-7. Data-only, idempotent, no DDL.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.categories SET name = 'Молоко и сливки' WHERE slug = 'milk';
UPDATE public.categories SET name = 'Прочие товары' WHERE slug = 'other';

INSERT INTO public.categories (id, slug, name, "filterSchema") VALUES
 ('cat-dairy','dairy','Кисломолочные продукты и сыры','{"filters":[{"key":"fatPercent","label":"Жирность","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-meat','meat','Мясо и птица','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-fish','fish','Рыба и морепродукты','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-sausages','sausages','Колбасы и деликатесы','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-vegetables','vegetables','Овощи, фрукты, зелень','{"filters":[]}'),
 ('cat-groats','groats','Крупы, макароны, мука','{"filters":[{"key":"weightGrams","label":"Вес","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-canned','canned','Консервы','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-sauces','sauces','Соусы и специи','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-sweets','sweets','Сладости и снеки','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-tea-coffee','tea-coffee','Чай и кофе','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-drinks','drinks','Напитки и вода','{"filters":[{"key":"volumeMl","label":"Объём","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-frozen','frozen','Замороженные продукты','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-baby','baby','Детские товары','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-household','household','Бытовая химия','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-hygiene','hygiene','Гигиена и косметика','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-home','home','Товары для дома','{"filters":[]}')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
```

`frontend/src/lib/categoryIcons.ts`: в `ICONS` добавить только те слаги, для которых в `frontend/src/components/ui/Icon.tsx` уже есть подходящий `IconName`. Остальные получат иконку `basket`: так задумано, это видно по комментарию в файле.

- [ ] **Step 3: Тесты** — `pnpm test taxonomy` → PASS. `cd frontend && pnpm test categoryIcons` → PASS.
- [ ] **Step 4: Commit**

```bash
git add pipeline/src/agent/taxonomy.ts pipeline/test/taxonomy.test.ts backend/prisma/migrations/20261006000000_catalog_taxonomy frontend/src/lib/categoryIcons.ts
git commit -m "feat(data): expand catalog taxonomy for full-store import"
```

---

### Task 7: Агент — классификация (категория, тип, бренд, атрибуты)

**Files:**
- Create: `pipeline/src/agent/gemini.ts`, `pipeline/src/agent/classify.ts`, `pipeline/src/cli/classify.ts`
- Test: `pipeline/test/classify.test.ts`

**Interfaces:**
- Consumes: `SourceFile`, `CATEGORIES`, `isCategorySlug`, `extractSize`, `extractFat`
- Produces:
  - `type LlmCall = (prompt: string, schema: object) => Promise<unknown>`
  - `createGemini(opts?: { cacheDir?: string; fetchImpl?: typeof fetch }): LlmCall` (кэш по sha256(prompt+schema))
  - `type ClassifiedProduct = { storeCode: StoreCode; product: SourceProduct; category: CategorySlug; productType: string; brand: string | null; attributes: { volumeMl?: number; weightGrams?: number; packageCount?: number; fatPercent?: number }; displayName: string; flags: string[] }`
  - `classifyBatch(items: { storeCode: StoreCode; product: SourceProduct }[], llm: LlmCall): Promise<ClassifiedProduct[]>`

- [ ] **Step 1: Падающий тест** — `pipeline/test/classify.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyBatch } from '../src/agent/classify.js'
import type { SourceProduct } from '../src/types.js'

const prod = (id: string, name: string): SourceProduct => ({ sourceProductId: id, name, price: 500, oldPrice: null,
  imageUrl: null, sourceUrl: null, brand: null, sourceCategoryPath: [], rawPayload: {} })
const items = [
  { storeCode: 'DINA' as const, product: prod('1', 'Молоко FoodMaster 3,2% 1 л') },
  { storeCode: 'DINA' as const, product: prod('2', 'САХАР "АНВАР" 1КГ') },
]
const good = { items: [
  { id: 'DINA:1', category: 'milk', productType: 'молоко', brand: 'FoodMaster', volumeMl: 1000, fatPercent: 3.2, displayName: 'Молоко FoodMaster 3.2% 1 л' },
  { id: 'DINA:2', category: 'sugar', productType: 'сахар', brand: 'Анвар', weightGrams: 1000, displayName: 'Сахар Анвар 1 кг' },
] }

describe('classify', () => {
  it('accepts valid llm output', async () => {
    const out = await classifyBatch(items, async () => good)
    expect(out.map((c) => c.category)).toEqual(['milk', 'sugar'])
    expect(out[0]!.attributes).toEqual({ volumeMl: 1000, fatPercent: 3.2 })
  })
  it('keeps brand Анвар for non-anvar store', async () => {
    const out = await classifyBatch(items, async () => good)
    expect(out[1]).toMatchObject({ storeCode: 'DINA', brand: 'Анвар' })
  })
  it('regex size wins over llm size and flags the conflict', async () => {
    const wrong = structuredClone(good); wrong.items[0]!.volumeMl = 900
    const out = await classifyBatch(items, async () => wrong)
    expect(out[0]!.attributes.volumeMl).toBe(1000)
    expect(out[0]!.flags).toContain('size_conflict')
  })
  it('rejects unknown ids and categories, retries once, then falls back to other', async () => {
    let calls = 0
    const bad = { items: [{ id: 'DINA:999', category: 'spaceships', productType: 'x', brand: null, displayName: 'x' }] }
    const out = await classifyBatch(items, async () => { calls++; return bad })
    expect(calls).toBe(2)
    expect(out.map((c) => c.category)).toEqual(['other', 'other'])
    expect(out.every((c) => c.flags.includes('llm_fallback'))).toBe(true)
  })
})
```

Run: `pnpm test classify` → FAIL.

- [ ] **Step 2: Реализация**

`pipeline/src/agent/gemini.ts`:
```ts
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type LlmCall = (prompt: string, schema: object) => Promise<unknown>
const KEYS = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'] as const

/** Failover по ключам как в backend/src/voice/nlp/gemini-nlp-parser.ts + дисковый кэш для воспроизводимости и экономии */
export function createGemini(opts: { cacheDir?: string; fetchImpl?: typeof fetch } = {}): LlmCall {
  const keys = [...new Set(KEYS.map((k) => process.env[k]?.trim()).filter((k): k is string => !!k))]
  if (!keys.length) throw new Error('GEMINI_API_KEY is not set')
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const doFetch = opts.fetchImpl ?? fetch
  if (opts.cacheDir) mkdirSync(opts.cacheDir, { recursive: true })
  return async (prompt, schema) => {
    const hash = createHash('sha256').update(model).update(prompt).update(JSON.stringify(schema)).digest('hex')
    const cached = opts.cacheDir && join(opts.cacheDir, `${hash}.json`)
    if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'))
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: schema } })
    for (const key of keys) {
      try {
        const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(60_000) })
        if (!res.ok) continue
        const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const text = json.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text
        if (!text) continue
        const parsed: unknown = JSON.parse(text)
        if (cached) writeFileSync(cached, JSON.stringify(parsed), 'utf8')
        return parsed
      } catch { /* следующий ключ */ }
    }
    throw new Error('Gemini request failed on all keys')
  }
}
```

`pipeline/src/agent/classify.ts`:
```ts
import { z } from 'zod'
import type { SourceProduct, StoreCode } from '../types.js'
import type { LlmCall } from './gemini.js'
import { CATEGORIES, isCategorySlug, type CategorySlug } from './taxonomy.js'
import { extractFat, extractSize } from './units.js'

export type Attributes = { volumeMl?: number; weightGrams?: number; packageCount?: number; fatPercent?: number }
export type ClassifiedProduct = { storeCode: StoreCode; product: SourceProduct; category: CategorySlug; productType: string
  brand: string | null; attributes: Attributes; displayName: string; flags: string[] }

const positive = z.number().positive().optional().nullable()
const Item = z.object({ id: z.string(), category: z.string(), productType: z.string().min(1), brand: z.string().nullable(),
  volumeMl: positive, weightGrams: positive, packageCount: positive, fatPercent: positive, displayName: z.string().min(1) })
const Reply = z.object({ items: z.array(Item) })

const SCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, category: { type: 'string', enum: CATEGORIES.map((c) => c.slug) },
  productType: { type: 'string' }, brand: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  volumeMl: { type: 'number' }, weightGrams: { type: 'number' }, packageCount: { type: 'number' }, fatPercent: { type: 'number' },
  displayName: { type: 'string' } }, required: ['id', 'category', 'productType', 'brand', 'displayName'] } } }, required: ['items'] }

const key = (i: { storeCode: StoreCode; product: SourceProduct }) => `${i.storeCode}:${i.product.sourceProductId}`

function prompt(items: { storeCode: StoreCode; product: SourceProduct }[]): string {
  return [
    'Ты классифицируешь товары продуктовых магазинов Актау (Казахстан). Верни строго JSON.',
    `Категории (slug — название): ${CATEGORIES.map((c) => `${c.slug} — ${c.name}`).join('; ')}.`,
    'Для каждого товара: category (slug), productType (короткий тип по-русски в нижнем регистре: «молоко», «кефир», «сахар-песок»),',
    'brand (производитель/торговая марка из названия или null), volumeMl/weightGrams/packageCount/fatPercent только если явно указаны в названии,',
    'displayName — аккуратное название: «Тип Бренд ключевые характеристики размер», например «Молоко FoodMaster 3.2% 1 л».',
    'Поле store — это магазин-продавец, НЕ бренд. Не выдумывай атрибуты.',
    JSON.stringify(items.map((i) => ({ id: key(i), store: i.storeCode, name: i.product.name, sourceCategory: i.product.sourceCategoryPath.join(' / ') }))),
  ].join('\n')
}

function fallback(i: { storeCode: StoreCode; product: SourceProduct }): ClassifiedProduct {
  const size = extractSize(i.product.name), fat = extractFat(i.product.name)
  return { ...i, category: 'other', productType: 'unknown', brand: i.product.brand, displayName: i.product.name,
    attributes: { ...size, ...(fat !== null ? { fatPercent: fat } : {}) }, flags: ['llm_fallback'] }
}

function merge(i: { storeCode: StoreCode; product: SourceProduct }, r: z.infer<typeof Item>): ClassifiedProduct {
  const flags: string[] = []
  const rx = extractSize(i.product.name)
  const attrs: Attributes = {}
  for (const k of ['volumeMl', 'weightGrams', 'packageCount'] as const) {
    const llm = r[k] ?? undefined, re = rx[k]
    if (re !== undefined && llm !== undefined && Math.round(llm) !== re) flags.push('size_conflict')
    const v = re ?? llm // regex — источник истины для размера
    if (v !== undefined) attrs[k] = Math.round(v)
  }
  const fat = extractFat(i.product.name) ?? r.fatPercent ?? null
  if (fat !== null) attrs.fatPercent = fat
  return { ...i, category: r.category as CategorySlug, productType: r.productType.trim().toLowerCase(),
    brand: r.brand?.trim() || i.product.brand, attributes: attrs, displayName: r.displayName.trim(), flags }
}

export async function classifyBatch(items: { storeCode: StoreCode; product: SourceProduct }[], llm: LlmCall): Promise<ClassifiedProduct[]> {
  const byKey = new Map(items.map((i) => [key(i), i]))
  const done = new Map<string, ClassifiedProduct>()
  for (let attempt = 0; attempt < 2 && done.size < items.length; attempt++) {
    const pending = items.filter((i) => !done.has(key(i)))
    try {
      const parsed = Reply.safeParse(await llm(prompt(pending), SCHEMA))
      if (!parsed.success) continue
      for (const r of parsed.data.items) {
        const src = byKey.get(r.id)
        if (!src || done.has(r.id) || !isCategorySlug(r.category)) continue
        done.set(r.id, merge(src, r))
      }
    } catch { /* ошибка провайдера — повтор */ }
  }
  return items.map((i) => done.get(key(i)) ?? fallback(i))
}
```

`pipeline/src/cli/classify.ts`:
```ts
import 'dotenv/config'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSourceFile } from '../source-file.js'
import { STORE_CODES } from '../types.js'
import { classifyBatch, type ClassifiedProduct } from '../agent/classify.js'
import { createGemini } from '../agent/gemini.js'

const DATA = resolve(import.meta.dirname, '../../../data')
const BATCH = 40
const llm = createGemini({ cacheDir: resolve(DATA, 'agent/cache') })
const files = STORE_CODES.map((c) => resolve(DATA, 'sources', `${c.toLowerCase()}.json`)).filter(existsSync).map(readSourceFile)
const items = files.flatMap((f) => f.products.map((product) => ({ storeCode: f.storeCode, product })))
const out: ClassifiedProduct[] = []
for (let i = 0; i < items.length; i += BATCH) {
  out.push(...(await classifyBatch(items.slice(i, i + BATCH), llm)))
  if ((i / BATCH) % 20 === 0) console.log(`[classify] ${Math.min(i + BATCH, items.length)}/${items.length}`)
}
mkdirSync(resolve(DATA, 'agent'), { recursive: true })
writeFileSync(resolve(DATA, 'agent/classified.json'), JSON.stringify({ sources: files.map(({ products, ...meta }) => meta), items: out }), 'utf8')
const fallbacks = out.filter((c) => c.flags.includes('llm_fallback')).length
console.log(`[classify] done: ${out.length} items, fallbacks ${fallbacks}, size conflicts ${out.filter((c) => c.flags.includes('size_conflict')).length}`)
if (fallbacks / out.length > 0.05) { console.error('[classify] >5% fallbacks — проверьте ключи/модель, повторите (кэш сохранит готовое)'); process.exit(1) }
```

- [ ] **Step 3: Тесты** — `pnpm test classify` → PASS (4).
- [ ] **Step 4: Пробный живой прогон на 200 товарах** — временно поставить `items.slice(0, 200)` в CLI, запустить `pnpm agent:classify`, глазами проверить 30 случайных записей в `data/agent/classified.json` (категория, бренд, размер), затем убрать `slice`. Полный прогон: около 15–20 тыс. товаров, это ~450 запросов.
- [ ] **Step 5: Commit** — `git add pipeline/src/agent/gemini.ts pipeline/src/agent/classify.ts pipeline/src/cli/classify.ts pipeline/test/classify.test.ts && git commit -m "feat(pipeline): LLM product classification with regex guards and cache"`

---

### Task 8: Агент — сопоставление товаров между сетями

**Files:**
- Create: `pipeline/src/agent/block.ts`, `pipeline/src/agent/match.ts`
- Test: `pipeline/test/helpers.ts` (фабрика `cp`, переиспользуется в Task 9), `pipeline/test/block.test.ts`, `pipeline/test/match.test.ts`

**Interfaces:**
- Consumes: `ClassifiedProduct`, `LlmCall`, `normalizeText`
- Produces:
  - `blockKey(c: ClassifiedProduct): string` и `buildBlocks(items: ClassifiedProduct[], maxSize?: number): ClassifiedProduct[][]`
  - `type Cluster = { members: ClassifiedProduct[]; method: 'deterministic' | 'ai'; confidence: number; review: 'approved' | 'pending' }`
  - `matchBlock(block: ClassifiedProduct[], llm: LlmCall): Promise<Cluster[]>`
  - `applyGuards(cluster: Cluster): Cluster[]`

**Правила.** Блок — это `category | productType | size`, где size = `volumeMl` / `weightGrams` / `packageCount`. Блоки, в которых встречается только одна сеть, LLM не отдаются: каждый товар такого блока становится одиночным кластером (`deterministic`, 1.0). Если в блоке больше 40 товаров, он режется по первой букве бренда. Guard'ы: в кластере не может быть двух товаров одной сети (оставляется самый похожий по названию, остальные выделяются в отдельные кластеры); `fatPercent` должен совпадать; размеры должны совпадать.

- [ ] **Step 1: Падающие тесты**

`pipeline/test/helpers.ts`:
```ts
import type { ClassifiedProduct } from '../src/agent/classify.js'
import type { CategorySlug } from '../src/agent/taxonomy.js'

export const cp = (store: ClassifiedProduct['storeCode'], id: string, name: string, attrs: ClassifiedProduct['attributes'],
  brand: string | null = 'FoodMaster', type = 'молоко', category: CategorySlug = type === 'сахар' ? 'sugar' : 'milk'): ClassifiedProduct => ({
  storeCode: store, category, productType: type, brand, attributes: attrs, displayName: name, flags: [],
  product: { sourceProductId: id, name, price: 500, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null, sourceCategoryPath: [], rawPayload: {} },
})
```

`pipeline/test/block.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { blockKey, buildBlocks } from '../src/agent/block.js'
import { cp } from './helpers.js'

describe('blocking', () => {
  it('key uses category, type and size', () => {
    expect(blockKey(cp('DINA', '1', 'м', { volumeMl: 1000, fatPercent: 3.2 }))).toBe('milk|молоко|1000ml')
  })
  it('splits by size and keeps unsized items in their own block', () => {
    const blocks = buildBlocks([cp('DINA', '1', 'a', { volumeMl: 1000 }), cp('DANA', '2', 'b', { volumeMl: 900 }), cp('DANA', '3', 'c', { volumeMl: 1000 })])
    expect(blocks.map((b) => b.length).sort()).toEqual([1, 2])
  })
})
```

`pipeline/test/match.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyGuards, matchBlock } from '../src/agent/match.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 2.5% 1 л', { volumeMl: 1000, fatPercent: 2.5 })
const b = cp('DANA', '2', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const c = cp('FIX_PRICE', '3', 'Молоко Фудмастер 2,5% 1л', { volumeMl: 1000, fatPercent: 2.5 })
const d = cp('DINA', '4', 'Молоко FoodMaster 2.5% 1 л ультрапаст', { volumeMl: 1000, fatPercent: 2.5 })

describe('matching', () => {
  it('single-store block never calls the llm', async () => {
    const out = await matchBlock([a, d], async () => { throw new Error('must not call') })
    expect(out).toHaveLength(2)
    expect(out.every((x) => x.method === 'deterministic' && x.members.length === 1)).toBe(true)
  })
  it('applies confidence policy', async () => {
    const llm = async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.97 }, { ids: ['DANA:2'], confidence: 1 }] })
    const out = await matchBlock([a, b, c], llm)
    const pair = out.find((x) => x.members.length === 2)!
    expect(pair).toMatchObject({ method: 'ai', review: 'approved' })
  })
  it('0.80–0.949 becomes pending, < 0.80 is split', async () => {
    const mid = await matchBlock([a, c], async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.85 }] }))
    expect(mid[0]).toMatchObject({ review: 'pending' })
    const low = await matchBlock([a, c], async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.6 }] }))
    expect(low).toHaveLength(2)
  })
  it('guard splits different fat', () => {
    expect(applyGuards({ members: [a, b], method: 'ai', confidence: 0.99, review: 'approved' })).toHaveLength(2)
  })
  it('guard never merges same store', () => {
    const out = applyGuards({ members: [a, d, c], method: 'ai', confidence: 0.99, review: 'approved' })
    expect(out.every((cl) => new Set(cl.members.map((m) => m.storeCode)).size === cl.members.length)).toBe(true)
    expect(out.flatMap((cl) => cl.members)).toHaveLength(3)
  })
  it('items the llm forgot become singletons', async () => {
    const out = await matchBlock([a, b, c], async () => ({ clusters: [{ ids: ['DINA:1', 'FIX_PRICE:3'], confidence: 0.99 }] }))
    expect(out.flatMap((x) => x.members)).toHaveLength(3)
  })
})
```

Run: `pnpm test block match` → FAIL.

- [ ] **Step 2: Реализация**

`pipeline/src/agent/block.ts`:
```ts
import type { ClassifiedProduct } from './classify.js'

export function blockKey(c: ClassifiedProduct): string {
  const a = c.attributes
  const size = a.volumeMl ? `${a.volumeMl}ml` : a.weightGrams ? `${a.weightGrams}g` : a.packageCount ? `${a.packageCount}pcs` : 'nosize'
  const pack = a.packageCount && (a.volumeMl || a.weightGrams) ? `x${a.packageCount}` : ''
  return `${c.category}|${c.productType}|${size}${pack}`
}

export function buildBlocks(items: ClassifiedProduct[], maxSize = 40): ClassifiedProduct[][] {
  const groups = new Map<string, ClassifiedProduct[]>()
  for (const it of items) {
    const k = blockKey(it)
    groups.set(k, [...(groups.get(k) ?? []), it])
  }
  const out: ClassifiedProduct[][] = []
  for (const g of groups.values()) {
    if (g.length <= maxSize) { out.push(g); continue }
    const byBrand = new Map<string, ClassifiedProduct[]>()
    for (const it of g) {
      const k = (it.brand ?? '?').toLowerCase().slice(0, 1)
      byBrand.set(k, [...(byBrand.get(k) ?? []), it])
    }
    for (const part of byBrand.values()) for (let i = 0; i < part.length; i += maxSize) out.push(part.slice(i, i + maxSize))
  }
  return out
}
```

`pipeline/src/agent/match.ts`:
```ts
import { z } from 'zod'
import type { ClassifiedProduct } from './classify.js'
import type { LlmCall } from './gemini.js'
import { normalizeText } from './units.js'

export type Cluster = { members: ClassifiedProduct[]; method: 'deterministic' | 'ai'; confidence: number; review: 'approved' | 'pending' }
const id = (c: ClassifiedProduct) => `${c.storeCode}:${c.product.sourceProductId}`
const single = (m: ClassifiedProduct): Cluster => ({ members: [m], method: 'deterministic', confidence: 1, review: 'approved' })

const Reply = z.object({ clusters: z.array(z.object({ ids: z.array(z.string()).min(1), confidence: z.number().min(0).max(1) })) })
const SCHEMA = { type: 'object', properties: { clusters: { type: 'array', items: { type: 'object', properties: {
  ids: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' } }, required: ['ids', 'confidence'] } } }, required: ['clusters'] }

function tokens(s: string) { return new Set(normalizeText(s).split(/[^a-zа-я0-9.]+/).filter(Boolean)) }
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b)
  const inter = [...x].filter((t) => y.has(t)).length
  return inter / Math.max(1, x.size + y.size - inter)
}

export function applyGuards(cluster: Cluster): Cluster[] {
  if (cluster.members.length < 2) return [cluster]
  const [anchor, ...rest] = cluster.members
  const kept: ClassifiedProduct[] = [anchor!]
  const ejected: ClassifiedProduct[] = []
  const sameShape = (x: ClassifiedProduct) =>
    (['volumeMl', 'weightGrams', 'packageCount', 'fatPercent'] as const).every((k) => anchor!.attributes[k] === x.attributes[k])
  // Сначала наиболее похожие на якорь — при конфликте одной сети побеждает самый похожий
  for (const m of [...rest].sort((p, q) => similarity(anchor!.product.name, q.product.name) - similarity(anchor!.product.name, p.product.name))) {
    if (!sameShape(m) || kept.some((k) => k.storeCode === m.storeCode)) ejected.push(m)
    else kept.push(m)
  }
  return [{ ...cluster, members: kept }, ...ejected.map(single)]
}

export async function matchBlock(block: ClassifiedProduct[], llm: LlmCall): Promise<Cluster[]> {
  if (new Set(block.map((b) => b.storeCode)).size < 2) return block.map(single)
  const byId = new Map(block.map((b) => [id(b), b]))
  const prompt = [
    'Сгруппируй одинаковые товары из разных магазинов Актау. Одинаковые = тот же производитель/бренд, тот же продукт, тот же вкус/вид, тот же размер и жирность.',
    'Разные магазины пишут названия по-разному (латиница/кириллица, сокращения) — это нормально. Если сомневаешься — не объединяй.',
    'Каждый id должен встретиться ровно в одном кластере; одиночные товары — кластер из одного id. confidence от 0 до 1. Верни строго JSON.',
    JSON.stringify(block.map((b) => ({ id: id(b), store: b.storeCode, name: b.product.name, brand: b.brand, attrs: b.attributes }))),
  ].join('\n')
  let reply: z.infer<typeof Reply> | null = null
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    try { const p = Reply.safeParse(await llm(prompt, SCHEMA)); if (p.success) reply = p.data } catch { /* повтор */ }
  }
  if (!reply) return block.map(single)
  const used = new Set<string>()
  const out: Cluster[] = []
  for (const c of reply.clusters) {
    const members = c.ids.filter((x) => byId.has(x) && !used.has(x)).map((x) => byId.get(x)!)
    members.forEach((m) => used.add(id(m)))
    if (members.length === 0) continue
    if (members.length === 1 || c.confidence < 0.8) { out.push(...members.map(single)); continue }
    out.push(...applyGuards({ members, method: 'ai', confidence: c.confidence, review: c.confidence >= 0.95 ? 'approved' : 'pending' }))
  }
  for (const b of block) if (!used.has(id(b))) out.push(single(b))
  return out
}
```

- [ ] **Step 3: Тесты** — `pnpm test block match` → PASS.
- [ ] **Step 4: Commit** — `git add pipeline/src/agent/block.ts pipeline/src/agent/match.ts pipeline/test/block.test.ts pipeline/test/match.test.ts && git commit -m "feat(pipeline): candidate blocking and LLM cross-store matching with guards"`

---

### Task 9: Сборка bundle v1.0 + отчёт качества + проверка совместимости с Go

**Files:**
- Create: `pipeline/src/agent/bundle.ts`, `pipeline/src/cli/match.ts`
- Create: `backend-go/internal/ingestion/testdata/pipeline_bundle.json` (генерируется тестом пайплайна)
- Modify: `backend-go/internal/ingestion/bundle_test.go` (новый тест)
- Test: `pipeline/test/bundle.test.ts`

**Interfaces:**
- Consumes: `Cluster`, `SourceFile` meta, `ClassifiedProduct`
- Produces:
  - `buildBundle(clusters: Cluster[], sources: Omit<SourceFile, 'products'>[], generatedAt: string): Bundle` — JSON-форма в точности как `backend-go/internal/ingestion/bundle.go` (`version`, `generatedAt`, `rawProducts[]`, `canonicalProducts[]` с полями `canonicalName`/`brand`/`category`/`imageUrl`/`attributes`/`members[{rawProduct,matchMethod,matchConfidence,reviewStatus}]`, `sourceRuns[{storeCode,capturedAt,productCount,errorCount}]`)
  - `qualityReport(bundle: Bundle): string` — markdown, метрики из §22 скоупа

**Правила.** `rawProduct` в `members` обязан **глубоко совпадать** с элементом `rawProducts`: Go сравнивает их через `reflect.DeepEqual`, поэтому используется один и тот же объект, а `undefined` превращается в `null`. Картинка выбирается так: первая валидная `https` в порядке DINA → DANA → ANVAR → FIX_PRICE. `canonicalName` берётся из `displayName` участника с картинкой, а если такого нет — у первого. Бренд берётся тот, что встречается в кластере чаще всего. В `attributes` попадают только скаляры.

- [ ] **Step 1: Падающий тест** — `pipeline/test/bundle.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBundle, qualityReport } from '../src/agent/bundle.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'Молоко Фудмастер 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const f = cp('FIX_PRICE', 'fp_3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.imageUrl = 'https://cdn.dina/1.jpg'
const sources = (['DINA', 'DANA', 'FIX_PRICE'] as const).map((s) => ({ storeCode: s, city: 'Aktau' as const, capturedAt: '2026-10-05T10:00:00.000Z', errorCount: 0, sourceStats: {} }))
const bundle = buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [f], method: 'deterministic', confidence: 1, review: 'approved' },
], sources, '2026-10-05T12:00:00.000Z')

describe('bundle', () => {
  it('matches the Go contract shape', () => {
    expect(bundle.version).toBe('1.0')
    expect(bundle.rawProducts).toHaveLength(3)
    expect(bundle.sourceRuns.map((s) => s.productCount)).toEqual([1, 1, 1])
    const g = bundle.canonicalProducts[0]!
    expect(g).toMatchObject({ canonicalName: 'Молоко FoodMaster 3.2% 1 л', category: 'milk', imageUrl: 'https://cdn.dina/1.jpg', attributes: { volumeMl: 1000, fatPercent: 3.2 } })
    expect(g.members[0]!.rawProduct).toEqual(bundle.rawProducts[0])
    expect(g.members[0]).toMatchObject({ matchMethod: 'ai', matchConfidence: 0.97, reviewStatus: 'approved' })
  })
  it('never emits undefined (Go DeepEqual on members)', () => {
    expect(JSON.stringify(bundle)).not.toContain('undefined')
    for (const r of bundle.rawProducts) for (const k of ['sourceUrl', 'brand', 'category', 'oldPrice', 'imageUrl']) expect(r).toHaveProperty(k)
  })
  it('report counts cross-store matches', () => {
    expect(qualityReport(bundle)).toContain('Matched across 2+ stores: 1')
  })
  it('writes a fixture for the Go decoder test', () => {
    const dir = new URL('../../backend-go/internal/ingestion/testdata/', import.meta.url)
    mkdirSync(dir, { recursive: true })
    writeFileSync(new URL('pipeline_bundle.json', dir), JSON.stringify(bundle, null, 2))
  })
})
```

Run: `pnpm test bundle` → FAIL.

- [ ] **Step 2: Реализация** `pipeline/src/agent/bundle.ts`:

```ts
import type { SourceFile, StoreCode } from '../types.js'
import type { ClassifiedProduct } from './classify.js'
import type { Cluster } from './match.js'

export type BundleRaw = { storeCode: StoreCode; sourceProductId: string; sourceUrl: string | null; name: string; brand: string | null
  category: string | null; price: number; oldPrice: number | null; imageUrl: string | null; rawPayload: Record<string, unknown> }
export type Bundle = { version: '1.0'; generatedAt: string; rawProducts: BundleRaw[]
  canonicalProducts: { canonicalName: string; brand: string | null; category: string; imageUrl: string | null
    attributes: Record<string, number | string | boolean>; members: { rawProduct: BundleRaw; matchMethod: string; matchConfidence: number; reviewStatus: string }[] }[]
  sourceRuns: { storeCode: StoreCode; capturedAt: string; productCount: number; errorCount: number }[] }

const IMAGE_ORDER: StoreCode[] = ['DINA', 'DANA', 'ANVAR', 'FIX_PRICE']

function toRaw(c: ClassifiedProduct): BundleRaw {
  const p = c.product
  return { storeCode: c.storeCode, sourceProductId: p.sourceProductId, sourceUrl: p.sourceUrl, name: p.name, brand: c.brand,
    category: p.sourceCategoryPath.join(' / ') || null, price: p.price, oldPrice: p.oldPrice, imageUrl: p.imageUrl,
    rawPayload: { ...p.rawPayload, agentFlags: c.flags.join(',') } }
}

function mode<T>(xs: T[]): T | null {
  const counts = new Map<T, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export function buildBundle(clusters: Cluster[], sources: Omit<SourceFile, 'products'>[], generatedAt: string): Bundle {
  const rawProducts: BundleRaw[] = []
  const canonicalProducts: Bundle['canonicalProducts'] = []
  for (const cl of clusters) {
    const pairs = cl.members.map((m) => ({ m, raw: toRaw(m) }))
    rawProducts.push(...pairs.map((p) => p.raw))
    const withImage = [...pairs].sort((x, y) => IMAGE_ORDER.indexOf(x.m.storeCode) - IMAGE_ORDER.indexOf(y.m.storeCode))
      .find((p) => p.raw.imageUrl?.startsWith('https://'))
    const lead = withImage?.m ?? cl.members[0]!
    const attributes: Record<string, number> = {}
    for (const [k, v] of Object.entries(lead.attributes)) if (typeof v === 'number') attributes[k] = v
    canonicalProducts.push({
      canonicalName: lead.displayName, brand: mode(cl.members.map((m) => m.brand).filter((b): b is string => !!b)),
      category: lead.category, imageUrl: withImage?.raw.imageUrl ?? null, attributes,
      members: pairs.map(({ raw }) => ({ rawProduct: raw, matchMethod: cl.method, matchConfidence: cl.confidence, reviewStatus: cl.review })),
    })
  }
  const count = (s: StoreCode) => rawProducts.filter((r) => r.storeCode === s).length
  return { version: '1.0', generatedAt, rawProducts, canonicalProducts,
    sourceRuns: sources.map((s) => ({ storeCode: s.storeCode, capturedAt: s.capturedAt, productCount: count(s.storeCode), errorCount: s.errorCount })) }
}

export function qualityReport(b: Bundle): string {
  const chains = b.canonicalProducts.map((g) => new Set(g.members.map((m) => m.rawProduct.storeCode)).size)
  const byCat = new Map<string, number>()
  for (const g of b.canonicalProducts) byCat.set(g.category, (byCat.get(g.category) ?? 0) + 1)
  const pending = b.canonicalProducts.flatMap((g) => g.members).filter((m) => m.reviewStatus === 'pending').length
  return [
    `# Data quality report (${b.generatedAt})`, '',
    ...b.sourceRuns.map((s) => `- ${s.storeCode} raw: ${s.productCount} (errors ${s.errorCount})`),
    `- Canonical: ${b.canonicalProducts.length}`,
    `- Offers: ${b.rawProducts.length}`,
    `- Matched across 2+ stores: ${chains.filter((n) => n >= 2).length}`,
    `- Matched across 3+ stores: ${chains.filter((n) => n >= 3).length}`,
    `- Missing image: ${b.canonicalProducts.filter((g) => !g.imageUrl).length}`,
    `- Pending review mappings: ${pending}`,
    '', '## Canonical by category', ...[...byCat.entries()].sort((a, c) => c[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
  ].join('\n')
}
```

`pipeline/src/cli/match.ts`:
```ts
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBlocks } from '../agent/block.js'
import { buildBundle, qualityReport } from '../agent/bundle.js'
import type { ClassifiedProduct } from '../agent/classify.js'
import { createGemini } from '../agent/gemini.js'
import { matchBlock, type Cluster } from '../agent/match.js'
import type { SourceFile } from '../types.js'

const DATA = resolve(import.meta.dirname, '../../../data')
const { sources, items } = JSON.parse(readFileSync(resolve(DATA, 'agent/classified.json'), 'utf8')) as { sources: Omit<SourceFile, 'products'>[]; items: ClassifiedProduct[] }
const llm = createGemini({ cacheDir: resolve(DATA, 'agent/cache') })
const blocks = buildBlocks(items)
const clusters: Cluster[] = []
for (const [i, block] of blocks.entries()) {
  clusters.push(...(await matchBlock(block, llm)))
  if (i % 200 === 0) console.log(`[match] block ${i}/${blocks.length}`)
}
const bundle = buildBundle(clusters, sources, new Date().toISOString())
writeFileSync(resolve(DATA, 'agent/bundle.json'), JSON.stringify(bundle), 'utf8')
const report = qualityReport(bundle)
writeFileSync(resolve(DATA, 'agent/report.md'), report, 'utf8')
console.log(report)
```

- [ ] **Step 3: Тесты пайплайна** — `pnpm test bundle` → PASS. Фикстура `pipeline_bundle.json` записана.

- [ ] **Step 4: Go-тест совместимости.** Добавить в `backend-go/internal/ingestion/bundle_test.go`:

```go
func TestDecodeAcceptsPipelineBundle(t *testing.T) {
	f, err := os.Open("testdata/pipeline_bundle.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	b, err := Decode(f)
	if err != nil {
		t.Fatalf("pipeline bundle rejected: %v", err)
	}
	if len(b.RawProducts) != 3 || len(b.Groups) != 2 || len(b.Sources) != 3 {
		t.Fatalf("unexpected shape: %d raw, %d groups, %d sources", len(b.RawProducts), len(b.Groups), len(b.Sources))
	}
}
```
(Добавить `"os"` в imports, если его там нет.)

Run: `cd backend-go && go test ./internal/ingestion -run TestDecodeAcceptsPipelineBundle -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/agent/bundle.ts pipeline/src/cli/match.ts pipeline/test/bundle.test.ts backend-go/internal/ingestion/testdata/pipeline_bundle.json backend-go/internal/ingestion/bundle_test.go
git commit -m "feat(pipeline): build Go-compatible ingest bundle and quality report"
```

---

### Task 10: Go ingest — режим перекластеризации (`-recluster`)

**Почему:** baseline содержит 849 canonical, почти все одиночные. Новое сопоставление объединит, например, Dina-товар (canonical X) и Dana-товар (canonical Y) в одну группу, и `resolve` упадёт с `canonical_merge_conflict`. По умолчанию строгое поведение сохраняется. Флаг `-recluster` включает детерминированную политику: **merge** — группа забирает ID прежнего canonical, у которого больше всего её участников (при равенстве лексикографически меньший ID), остальные прежние ID просто перестают получать офферы в новом snapshot; **split** — прежний ID забирает самая большая группа, остальные получают новые ID.

**Files:**
- Modify: `backend-go/internal/ingestion/plan.go` (`resolve` + поля Report)
- Modify: `backend-go/internal/ingestion/ingestor.go` (`New` принимает опцию, пробрасывает в `resolve`)
- Modify: `backend-go/cmd/ingest/main.go` (флаг `-recluster`)
- Test: `backend-go/internal/ingestion/plan_test.go` (создать)

**Interfaces:**
- Produces: `resolve(b, previous, counts, categories, maxDrop, recluster bool)`, `Report.MergedCanonical int \`json:"mergedCanonicalCount"\``, `Report.SplitCanonical int \`json:"splitCanonicalCount"\``, `ingestion.New(conn, maxDrop, recluster bool)`

- [ ] **Step 1: Падающий тест** — `backend-go/internal/ingestion/plan_test.go`:

```go
package ingestion

import "testing"

func raw(store, id string) RawProduct { return RawProduct{StoreCode: store, SourceProductID: id, Name: id, Price: 100} }
func one() *float64                   { v := 1.0; return &v }
func group(members ...RawProduct) Group {
	g := Group{Name: "g", Category: "milk"}
	for _, m := range members {
		g.Members = append(g.Members, Member{Raw: m, Method: "ai", Confidence: one(), Review: "approved"})
	}
	return g
}

var cats = map[string]string{"milk": "cat-milk"}

func bundleOf(groups ...Group) Bundle {
	b := Bundle{Version: "1.0", Groups: groups}
	for _, g := range groups {
		for _, m := range g.Members {
			b.RawProducts = append(b.RawProducts, m.Raw)
		}
	}
	return b
}

func TestResolveStrictStillRejectsMerge(t *testing.T) {
	a, d, f := raw("DINA", "1"), raw("DANA", "2"), raw("FIX_PRICE", "3")
	prev := map[Identity][]string{a.Identity(): {"X"}, d.Identity(): {"Y"}}
	_, rep, err := resolve(bundleOf(group(a, d), group(f)), prev, nil, cats, 100, false)
	if err == nil || rep.FailureCode != "canonical_merge_conflict" {
		t.Fatalf("want merge conflict, got %v %q", err, rep.FailureCode)
	}
}

func TestResolveReclusterMergeKeepsLargestPrevious(t *testing.T) {
	a, a2, d, f := raw("DINA", "1"), raw("DANA", "9"), raw("DANA", "2"), raw("FIX_PRICE", "3")
	prev := map[Identity][]string{a.Identity(): {"Y"}, a2.Identity(): {"Y"}, d.Identity(): {"X"}}
	out, rep, err := resolve(bundleOf(group(a, a2, d), group(f)), prev, nil, cats, 100, true)
	if err != nil {
		t.Fatal(err)
	}
	if out[0].ID != "Y" || !out[0].Reused || rep.MergedCanonical != 1 {
		t.Fatalf("want reuse Y with 1 merge, got %+v %+v", out[0], rep)
	}
}

func TestResolveReclusterSplitGivesNewIDToSmallerGroup(t *testing.T) {
	a, d, d2, f := raw("DINA", "1"), raw("DANA", "2"), raw("DANA", "3"), raw("FIX_PRICE", "4")
	prev := map[Identity][]string{a.Identity(): {"X"}, d.Identity(): {"X"}, d2.Identity(): {"X"}}
	out, rep, err := resolve(bundleOf(group(a, d), group(d2), group(f)), prev, nil, cats, 100, true)
	if err != nil {
		t.Fatal(err)
	}
	if out[0].ID != "X" || out[1].ID == "X" || out[1].Reused || rep.SplitCanonical != 1 {
		t.Fatalf("want X kept by larger group and split counted, got %+v %+v %+v", out[0], out[1], rep)
	}
}
```

Run: `cd backend-go && go test ./internal/ingestion -run TestResolve -v` → FAIL (ошибка компиляции: лишний аргумент `recluster`).

- [ ] **Step 2: Реализация** — заменить цикл по группам в `plan.go/resolve`:

```go
func resolve(b Bundle, previous map[Identity][]string, counts map[string]int, categories map[string]string, maxDrop float64, recluster bool) ([]resolved, Report, error) {
	// ... начало функции без изменений до `used := map[string]bool{}` ...

	// votes[i][id] = сколько участников группы i ранее принадлежали canonical id
	votes := make([]map[string]int, len(b.Groups))
	for i, g := range b.Groups {
		votes[i] = map[string]int{}
		for _, m := range g.Members {
			for _, id := range previous[m.Raw.Identity()] {
				votes[i][id]++
			}
		}
	}
	// Для split: какая группа сильнее всего претендует на каждый прежний id
	owner := map[string]int{}
	for i := range b.Groups {
		for id, n := range votes[i] {
			j, ok := owner[id]
			if !ok || n > votes[j][id] || (n == votes[j][id] && len(b.Groups[i].Members) > len(b.Groups[j].Members)) {
				owner[id] = i
			}
		}
	}
	used := map[string]bool{}
	out := make([]resolved, 0, len(b.Groups))
	images := 0
	for i, g := range b.Groups {
		if _, ok := categories[g.Category]; !ok {
			return fail("unknown_canonical_category")
		}
		chains := map[string]bool{}
		for _, m := range g.Members {
			chains[m.Raw.StoreCode] = true
		}
		if len(chains) >= 2 {
			report.MatchedAcrossStores++
		}
		if g.ImageURL != nil && *g.ImageURL != "" {
			images++
		}
		if len(votes[i]) > 1 && !recluster {
			return fail("canonical_merge_conflict")
		}
		if len(votes[i]) > 1 {
			report.MergedCanonical++
		}
		v := resolved{Group: g}
		best, bestVotes := "", 0
		for id, n := range votes[i] {
			if recluster && owner[id] != i {
				continue
			}
			if n > bestVotes || (n == bestVotes && id < best) {
				best, bestVotes = id, n
			}
		}
		if best != "" {
			if used[best] {
				return fail("canonical_split_conflict")
			}
			v.ID, v.Reused = best, true
			used[best] = true
			report.ReusedCanonical++
		} else {
			if len(votes[i]) > 0 {
				report.SplitCanonical++
			}
			var err error
			if v.ID, err = opaqueID(); err != nil {
				return nil, report, err
			}
			report.NewCanonical++
		}
		out = append(out, v)
	}
	// ... imageCoverage и return без изменений ...
}
```

В strict-режиме (`recluster == false`) поведение прежнее. Если в одной группе встретились два прежних ID, это merge conflict. Если прежний ID уже занят другой группой, это split conflict: при `!recluster` `owner` не фильтрует, и `used[best]` ловит повтор.

В `Report` добавить поля `MergedCanonical int \`json:"mergedCanonicalCount"\`` и `SplitCanonical int \`json:"splitCanonicalCount"\``.

В `ingestor.go`: в `Ingestor` добавить поле `recluster bool`, `New(conn, maxDrop, recluster bool)`, оба вызова `resolve(...)` дополнить `, e.recluster` (в `Stage` через `s.engine.recluster`).

В `cmd/ingest/main.go`: `recluster := flag.Bool("recluster", false, "one-time re-matching: resolve canonical merges/splits deterministically")` и `ingestion.New(conn, drop, *recluster)`. Исправить остальные вызовы `New(` в `ingestor_integration_test.go`, добавив `, false`.

- [ ] **Step 3: Тесты** — `go test ./internal/ingestion -v` → PASS, все прежние unit-тесты зелёные. `go vet ./... && gofmt -l .` → пусто.
- [ ] **Step 4: Commit** — `git add backend-go && git commit -m "feat(ingest): deterministic -recluster mode for canonical merges and splits"`

---

### Task 11: Прогон Phase A на тестовой БД, затем Supabase

**Files:**
- Create: `docs/data/SCRUM-7_REPORT.md`
- Create: `backend-go/scripts/local-ingest-db.sh`

Этот task — операционный: TDD-цикла нет, «тест» здесь — quality gates.

- [ ] **Step 1: Скрипт локальной тестовой БД** `backend-go/scripts/local-ingest-db.sh`. Он повторяет схему прода: 4 миграции и security-роли. Данные берутся из **дампа prod без PII**, только каталожные таблицы:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Тестовая БД для SCRUM-7: postgres:17 на loopback, схема и роли как в production.
NAME=adilbaga-ingest-test PORT=55432 PW=local-only-pass
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PW" -p 127.0.0.1:$PORT:5432 postgres:17-alpine
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
ADMIN="postgresql://postgres:$PW@127.0.0.1:$PORT/postgres"
# Каталожный дамп prod (выполняет человек с owner-доступом, файл НЕ коммитится):
#   pg_dump "$SUPABASE_DIRECT_URL" --data-only --no-owner -t stores -t store_locations -t categories \
#     -t snapshots -t source_runs -t raw_products -t canonical_products -t product_mappings -t offers > data/agent/prod_catalog.sql
for m in backend/prisma/migrations/2026*/migration.sql; do
  case "$m" in *catalog_taxonomy*|*store_anvar*) continue;; esac  # новые миграции применяются после загрузки дампа
  psql "$ADMIN" -v ON_ERROR_STOP=1 -f "$m"
done
psql "$ADMIN" -v ON_ERROR_STOP=1 -f data/agent/prod_catalog.sql
for m in backend/prisma/migrations/2026*catalog_taxonomy*/migration.sql; do psql "$ADMIN" -v ON_ERROR_STOP=1 -f "$m"; done
psql "$ADMIN" -v ON_ERROR_STOP=1 -f backend/prisma/security/aktau_api_reader_role.sql
psql "$ADMIN" -v ON_ERROR_STOP=1 -f backend/prisma/security/aktau_ingest_writer_role.sql
psql "$ADMIN" -v ON_ERROR_STOP=1 -c "CREATE ROLE ingest_local LOGIN PASSWORD '$PW' IN ROLE aktau_ingest_writer"
echo "INGEST_DATABASE_URL=postgresql://ingest_local:$PW@127.0.0.1:$PORT/postgres"
```

Перед первым запуском прочитать `backend-go/README.md` (раздел про локальную интеграционную БД) и оба security-скрипта, и при необходимости поправить порядок шагов. Например, `20261004000000_rls_runtime_access` может ожидать уже созданные роли: если миграция падает на `role does not exist`, роли создаются до неё. Для сравнения: `PART_08_REPORT.md` восстанавливал бэкап в `postgres:17-alpine` тем же способом.

- [ ] **Step 2: Полный прогон пайплайна**

```bash
cd pipeline
pnpm scrape:dina && pnpm scrape:dana && pnpm scrape:fixprice
pnpm agent:classify
pnpm agent:match          # → data/agent/bundle.json, data/agent/report.md
```

- [ ] **Step 3: Dry-run и apply на тестовой БД**

```bash
cd backend-go
export APP_ENV=development INGEST_MAX_STORE_DROP_PERCENT=10 INGEST_DATABASE_URL=<из Step 1>
go run ./cmd/ingest -bundle ../data/agent/bundle.json -recluster          # dry-run
go run ./cmd/ingest -bundle ../data/agent/bundle.json -recluster -apply   # publish в тестовую БД
```

Expected: JSON с `"applied":true`, без `failureCode`.

- [ ] **Step 4: Quality gates.** Каждый пункт проверить и записать в отчёт. Если хотя бы один FAIL, в production не идём:

| Gate | Порог |
|---|---|
| Dina raw | ≥ 95% от `pageInfo.total` |
| Dana raw | ≥ 2000 |
| Fix Price raw | ≥ 500 (или задокументированное исключение) |
| Canonical в 2+ сетях | ≥ 500 (сейчас 14) |
| Canonical в 3 сетях | ≥ 50 (сейчас 0) |
| Доля `other` среди canonical | ≤ 15% (сейчас 71%) |
| Image coverage | ≥ 90% |
| Ручная выборка 50 кросс-сетевых групп | ≥ 48 корректных (≥ 96% precision) |
| Корзина дашборда | у каждой сети есть товар в слотах milk/sugar/oil (`volumeMl`/`weightGrams` = 1000) |

Выборку для ручной проверки сделать SQL-запросом к тестовой БД (`offers` текущего snapshot, `count(distinct storeId) >= 2`, `order by random() limit 50`). Ошибки разобрать: класс ошибки → правка промпта или guard'а → повторный `agent:match` (кэш LLM делает повтор дешёвым).

- [ ] **Step 5: Смоук API на тестовой БД.** Запустить `go run ./cmd/api` с `DATABASE_URL` тестовой БД по `backend-go/README.md` и проверить `GET /api/v1/categories`, `/api/v1/products?category=milk`, `/api/v1/dashboard`: 200, непустые данные. Затем `go test -tags=integration ./tests/integration -run 'Smoke|Catalog'` против тестовой БД (переменные окружения описаны в README).

- [ ] **Step 6: Production.** Только после «ок» от Denis Andersen в Jira-комментарии:
  1. Применить миграцию `20261006000000_catalog_taxonomy` к Supabase тем же способом, каким применялись предыдущие (Prisma `migrate deploy` с owner-учёткой; см. `docs/production/reports/PART_08_PRODUCTION_MIGRATION_REPORT.md`).
  2. Dry-run: `APP_ENV=production INGEST_DATABASE_URL=<prod ingest login> go run ./cmd/ingest -bundle ... -recluster`.
  3. Apply: добавить `INGEST_PRODUCTION_APPLY_CONFIRM=1 ... -apply`.
  4. Проверить, что новый snapshot `published`, а `baseline-internal-v1` остался в истории.

- [ ] **Step 7: Commit отчёта**

```bash
git add docs/data/SCRUM-7_REPORT.md backend-go/scripts/local-ingest-db.sh
git commit -m "docs(data): SCRUM-7 phase A full-catalog import report"
```

---

# PHASE A2 — словарь и ежедневное обновление без LLM (обновление 2026-10-06)

Решение Дениса (голосовые от 2026-10-06): LLM один раз раскладывает и сопоставляет товары, результат «прописан» в словаре, а регулярно цены обновляет обычный код. Новые товары копятся в логе, раз в неделю их вручную прогоняют через агента. Порядок выполнения — в разделе «Порядок выполнения после обновления 2026-10-06» в начале плана.

### Task 15: Словарь соответствий из bundle

**Files:**
- Create: `pipeline/src/mapping/dictionary.ts`
- Modify: `pipeline/src/cli/match.ts` (после bundle записать словарь)
- Modify: `.gitignore` (добавить `data/sync/`; `data/mapping/` **не** игнорировать)
- Test: `pipeline/test/dictionary.test.ts`

**Interfaces:**
- Consumes: `Bundle`, `buildBundle` (Task 9), `isCategorySlug` (Task 6), `StoreCode`
- Produces:
  - `type Dictionary = { version: 1; generatedAt: string; canonicals: Record<string, DictionaryCanonical>; products: Record<string, string>; storeCategories: Record<string, CategorySlug> }`
  - `type DictionaryCanonical = { name: string; brand: string | null; category: CategorySlug; attributes: Record<string, number>; method: 'deterministic' | 'ai'; confidence: number; review: 'approved' | 'pending' }`
  - `identity(store, sourceProductId): string` → `"DINA:5865"`
  - `storeCategoryKey(store, path: string[] | string | null): string` → `"DINA|Молоко, яйца, масло / Молоко"`
  - `canonicalKey(memberIds: string[]): string` → `"c_<16 hex>"`, стабилен при любом порядке участников
  - `buildDictionary(bundle: Bundle): Dictionary`, `writeDictionary(path, d)`, `readDictionary(path): Dictionary`

Словарь строится **из bundle**, а не из кластеров. Тогда название, бренд и атрибуты карточки в словаре совпадают с тем, что опубликовано через `cmd/ingest`. `storeCategories` — это категория магазина → наш слаг большинством голосов. Её использует `sync`, чтобы положить незнакомый товар хотя бы в правильную категорию.

- [ ] **Step 1: Падающий тест** — `pipeline/test/dictionary.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/agent/bundle.js'
import { buildDictionary, canonicalKey, identity, readDictionary, storeCategoryKey, writeDictionary } from '../src/mapping/dictionary.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const s = cp('DINA', '3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.sourceCategoryPath = ['Молоко, яйца, масло', 'Молоко']
b.product.sourceCategoryPath = ['Продукты питания']
s.product.sourceCategoryPath = ['Бакалея']
const sources = (['DINA', 'DANA', 'FIX_PRICE'] as const).map((x) => ({ storeCode: x, city: 'Aktau' as const, capturedAt: '2026-10-06T06:00:00.000Z', errorCount: 0, sourceStats: {} }))
const bundle = buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [s], method: 'deterministic', confidence: 1, review: 'approved' },
], sources, '2026-10-06T07:00:00.000Z')

describe('dictionary', () => {
  it('canonical key does not depend on member order', () => {
    expect(canonicalKey(['DINA:1', 'DANA:dana_2'])).toBe(canonicalKey(['DANA:dana_2', 'DINA:1']))
    expect(canonicalKey(['DINA:1'])).toMatch(/^c_[0-9a-f]{16}$/)
  })
  it('maps every bundle raw to its canonical, word order in names does not matter', () => {
    const d = buildDictionary(bundle)
    expect(Object.keys(d.products)).toHaveLength(3)
    expect(d.products[identity('DINA', '1')]).toBe(d.products[identity('DANA', 'dana_2')])
    const milk = d.canonicals[d.products[identity('DINA', '1')]!]!
    expect(milk).toMatchObject({ name: bundle.canonicalProducts[0]!.canonicalName, category: 'milk', method: 'ai', review: 'approved', attributes: { volumeMl: 1000, fatPercent: 3.2 } })
  })
  it('learns store category → slug', () => {
    const d = buildDictionary(bundle)
    expect(d.storeCategories[storeCategoryKey('DINA', ['Молоко, яйца, масло', 'Молоко'])]).toBe('milk')
    expect(d.storeCategories[storeCategoryKey('DINA', ['Бакалея'])]).toBe('sugar')
  })
  it('writes a deterministic, diff-friendly file and reads it back', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dict-')), 'dictionary.json')
    const d = buildDictionary(bundle)
    writeDictionary(path, d)
    const first = readFileSync(path, 'utf8')
    writeDictionary(path, readDictionary(path))
    expect(readFileSync(path, 'utf8')).toBe(first)
    expect(first.split('\n').filter((l) => l.includes('"DINA:1"'))).toHaveLength(1)
  })
  it('rejects a product pointing to a missing canonical', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dict-')), 'dictionary.json')
    const d = buildDictionary(bundle)
    d.products['DINA:999'] = 'c_0000000000000000'
    writeDictionary(path, d)
    expect(() => readDictionary(path)).toThrow(/missing canonical/)
  })
})
```

Run: `cd pipeline && pnpm test dictionary` → Expected: FAIL (`Cannot find module '../src/mapping/dictionary.js'`).

- [ ] **Step 2: Реализация** `pipeline/src/mapping/dictionary.ts`:

```ts
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { Bundle } from '../agent/bundle.js'
import { isCategorySlug, type CategorySlug } from '../agent/taxonomy.js'
import type { StoreCode } from '../types.js'

const Slug = z.string().refine(isCategorySlug, 'unknown category').transform((s) => s as CategorySlug)
const Canonical = z.object({
  name: z.string().min(1), brand: z.string().nullable(), category: Slug, attributes: z.record(z.number()),
  method: z.enum(['deterministic', 'ai']), confidence: z.number().min(0).max(1), review: z.enum(['approved', 'pending']),
})
export const DictionarySchema = z.object({
  version: z.literal(1), generatedAt: z.string().datetime(),
  canonicals: z.record(Canonical), products: z.record(z.string()), storeCategories: z.record(Slug),
})
export type Dictionary = z.infer<typeof DictionarySchema>
export type DictionaryCanonical = z.infer<typeof Canonical>

export const identity = (store: StoreCode, sourceProductId: string) => `${store}:${sourceProductId}`
export const storeCategoryKey = (store: StoreCode, path: string[] | string | null) =>
  `${store}|${Array.isArray(path) ? path.join(' / ') : path ?? ''}`

/** Ключ задаётся один раз при создании карточки и дальше не пересчитывается — новые участники его не меняют */
export function canonicalKey(memberIds: string[]): string {
  const first = [...memberIds].sort()[0]
  if (!first) throw new Error('canonical without members')
  return `c_${createHash('sha256').update(first).digest('hex').slice(0, 16)}`
}

export function buildDictionary(bundle: Bundle): Dictionary {
  const d = { version: 1 as const, generatedAt: bundle.generatedAt, canonicals: {} as Record<string, unknown>,
    products: {} as Record<string, string>, storeCategories: {} as Record<string, string> }
  const votes = new Map<string, Map<string, number>>()
  for (const g of bundle.canonicalProducts) {
    const ids = g.members.map((m) => identity(m.rawProduct.storeCode, m.rawProduct.sourceProductId))
    const key = canonicalKey(ids)
    if (d.canonicals[key]) throw new Error(`canonical key collision ${key}`)
    const first = g.members[0]!
    d.canonicals[key] = { name: g.canonicalName, brand: g.brand, category: g.category, attributes: g.attributes,
      method: first.matchMethod, confidence: first.matchConfidence, review: first.reviewStatus }
    g.members.forEach((m, i) => {
      d.products[ids[i]!] = key
      if (!m.rawProduct.category) return
      const k = storeCategoryKey(m.rawProduct.storeCode, m.rawProduct.category)
      const v = votes.get(k) ?? new Map<string, number>()
      v.set(g.category, (v.get(g.category) ?? 0) + 1)
      votes.set(k, v)
    })
  }
  for (const [k, v] of votes) d.storeCategories[k] = [...v.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0]
  return DictionarySchema.parse(d)
}

/** Одна запись — одна строка, ключи отсортированы: diff в git показывает ровно изменённые товары */
function lines(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort()
  return keys.length ? `{\n${keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(',\n')}\n  }` : '{}'
}

export function writeDictionary(path: string, d: Dictionary): void {
  const v = DictionarySchema.parse(d)
  const text = `{\n  "version": 1,\n  "generatedAt": ${JSON.stringify(v.generatedAt)},\n  "canonicals": ${lines(v.canonicals)},\n` +
    `  "products": ${lines(v.products)},\n  "storeCategories": ${lines(v.storeCategories)}\n}\n`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, text, 'utf8')
  renameSync(`${path}.tmp`, path)
}

export function readDictionary(path: string): Dictionary {
  const d = DictionarySchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  for (const [id, key] of Object.entries(d.products)) if (!d.canonicals[key]) throw new Error(`${id}: missing canonical ${key}`)
  return d
}
```

В `pipeline/src/cli/match.ts` после записи `report.md` добавить:
```ts
import { buildDictionary, writeDictionary } from '../mapping/dictionary.js'
// ...
writeDictionary(resolve(DATA, 'mapping/dictionary.json'), buildDictionary(bundle))
console.log(`[match] dictionary → ${resolve(DATA, 'mapping/dictionary.json')}`)
```

В `.gitignore` добавить строку `data/sync/`.

- [ ] **Step 3: Тесты** — `pnpm test dictionary && pnpm typecheck` → PASS. Затем `pnpm test`: все прежние тесты зелёные.
- [ ] **Step 4: Commit**

```bash
git add pipeline/src/mapping/dictionary.ts pipeline/src/cli/match.ts pipeline/test/dictionary.test.ts .gitignore
git commit -m "feat(pipeline): product mapping dictionary built from the ingest bundle"
```

- [ ] **Step 5: Разовый прогон агента (Task 11 Step 2, Gemini).** `pnpm agent:match` → в `data/agent/` появятся `bundle.json` и `report.md`, в `data/mapping/` — `dictionary.json`. Проверить: число записей `products` в словаре равно `rawProducts.length` bundle. Словарь коммитится **после** успешных quality gates Task 11 Step 4:

```bash
git add data/mapping/dictionary.json
git commit -m "data: initial product mapping dictionary (Dina, Dana, Fix Price)"
```

---

### Task 16: `pnpm sync` — ежедневное обновление цен без LLM

**Files:**
- Create: `pipeline/src/sync/sync.ts`, `pipeline/src/cli/sync.ts`
- Create: `pipeline/scripts/daily-sync.sh`, `docs/data/SYNC_RUNBOOK.md`
- Modify: `pipeline/package.json` (скрипт `"sync": "tsx src/cli/sync.ts"`)
- Test: `pipeline/test/sync.test.ts`

**Interfaces:**
- Consumes: `Dictionary`, `identity`, `storeCategoryKey`, `readDictionary` (Task 15); `buildBundle`, `Bundle` (Task 9); `extractSize`, `extractFat` (Task 5); `SourceFile`, `readSourceFile` (Task 1); `ClassifiedProduct` и `Cluster` — **только как типы**
- Produces:
  - `type Unmapped = { storeCode: StoreCode; sourceProductId: string; name: string; price: number; sourceCategoryPath: string[]; guessedCategory: CategorySlug }`
  - `assertFresh(files: SourceFile[], required: StoreCode[], now: Date, maxAgeHours: number): void`
  - `buildSyncBundle(files: SourceFile[], dict: Dictionary, generatedAt: string): { bundle: Bundle; unmapped: Unmapped[] }`

**Правила:**
- Известный товар (есть в `dict.products`) попадает в группу своей карточки. Название, бренд, категория, атрибуты, метод и уверенность берутся из словаря, цена и картинка — из сегодняшнего файла.
- Незнакомый товар становится одиночной карточкой: категория по `storeCategories` (иначе `other`), атрибуты из regex Task 5, `matchMethod=deterministic`, `confidence=1`, `reviewStatus=pending`. Он записывается в `data/sync/unmapped.json` и выводится в лог (`[sync] unmapped: N`).
- Товары словаря, которых сегодня нет в файле, просто не публикуются: у карточки в этом snapshot нет офферов.
- Повторный `sync` на тех же данных даёт тот же состав групп, поэтому Go `cmd/ingest` в **строгом** режиме переиспользует все прежние ID карточек.
- Если словарь меняли (например, после будущего `agent:new` объединились карточки), запуск `cmd/ingest` идёт с `-recluster` (Task 10).

- [ ] **Step 1: Падающий тест** — `pipeline/test/sync.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/agent/bundle.js'
import { buildDictionary } from '../src/mapping/dictionary.js'
import { assertFresh, buildSyncBundle } from '../src/sync/sync.js'
import type { SourceFile } from '../src/types.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const f = cp('FIX_PRICE', 'fp_3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.sourceCategoryPath = ['Молоко']
const day0 = '2026-10-06T06:00:00.000Z'
const meta = (s: SourceFile['storeCode']) => ({ storeCode: s, city: 'Aktau' as const, capturedAt: day0, errorCount: 0, sourceStats: {} })
const dict = buildDictionary(buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [f], method: 'deterministic', confidence: 1, review: 'approved' },
], (['DINA', 'DANA', 'FIX_PRICE'] as const).map(meta), day0))

const today = (dinaExtra: SourceFile['products'] = []): SourceFile[] => [
  { ...meta('DINA'), products: [{ ...a.product, price: 610 }, ...dinaExtra] },
  { ...meta('DANA'), products: [b.product] },
  { ...meta('FIX_PRICE'), products: [f.product] },
]

describe('sync', () => {
  it('known products keep their dictionary card and take today prices', () => {
    const { bundle, unmapped } = buildSyncBundle(today(), dict, '2026-10-07T06:00:00.000Z')
    expect(unmapped).toEqual([])
    const milk = bundle.canonicalProducts.find((g) => g.category === 'milk')!
    expect(milk.members.map((m) => m.rawProduct.storeCode).sort()).toEqual(['DANA', 'DINA'])
    expect(milk.members.find((m) => m.rawProduct.storeCode === 'DINA')!.rawProduct.price).toBe(610)
    expect(milk).toMatchObject({ canonicalName: Object.values(dict.canonicals).find((c) => c.category === 'milk')!.name, attributes: { volumeMl: 1000, fatPercent: 3.2 } })
    expect(milk.members[0]).toMatchObject({ matchMethod: 'ai', matchConfidence: 0.97, reviewStatus: 'approved' })
  })
  it('unknown product becomes a pending singleton in the learned store category', () => {
    const fresh = { ...a.product, sourceProductId: '99', name: 'Молоко Новое 2.5% 900 мл', sourceCategoryPath: ['Молоко'] }
    const { bundle, unmapped } = buildSyncBundle(today([fresh]), dict, '2026-10-07T06:00:00.000Z')
    expect(unmapped).toEqual([expect.objectContaining({ storeCode: 'DINA', sourceProductId: '99', guessedCategory: 'milk' })])
    const g = bundle.canonicalProducts.find((x) => x.members.some((m) => m.rawProduct.sourceProductId === '99'))!
    expect(g).toMatchObject({ category: 'milk', attributes: { volumeMl: 900, fatPercent: 2.5 } })
    expect(g.members).toHaveLength(1)
    expect(g.members[0]).toMatchObject({ matchMethod: 'deterministic', reviewStatus: 'pending' })
  })
  it('every raw appears in exactly one group (Go bundle contract)', () => {
    const { bundle } = buildSyncBundle(today(), dict, '2026-10-07T06:00:00.000Z')
    expect(bundle.canonicalProducts.flatMap((g) => g.members)).toHaveLength(bundle.rawProducts.length)
    expect(bundle.sourceRuns.map((s) => s.storeCode).sort()).toEqual(['DANA', 'DINA', 'FIX_PRICE'])
  })
  it('refuses stale or missing source files', () => {
    const now = new Date('2026-10-07T06:00:00.000Z')
    expect(() => assertFresh(today(), ['DINA', 'DANA', 'FIX_PRICE'], now, 36)).not.toThrow()
    expect(() => assertFresh(today().slice(0, 2), ['DINA', 'DANA', 'FIX_PRICE'], now, 36)).toThrow(/FIX_PRICE: source file missing/)
    expect(() => assertFresh(today(), ['DINA', 'DANA', 'FIX_PRICE'], new Date('2026-10-09T06:00:00.000Z'), 36)).toThrow(/stale/)
  })
  it('sync code never touches the LLM', () => {
    for (const file of ['../src/sync/sync.ts', '../src/cli/sync.ts', '../src/mapping/dictionary.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(src).not.toMatch(/gemini|classifyBatch|matchBlock|GEMINI_API_KEY/)
    }
  })
})
```

Run: `pnpm test sync` → Expected: FAIL (модуль не найден).

- [ ] **Step 2: Реализация** `pipeline/src/sync/sync.ts`:

```ts
import { buildBundle, type Bundle } from '../agent/bundle.js'
import type { Attributes, ClassifiedProduct } from '../agent/classify.js'
import type { Cluster } from '../agent/match.js'
import type { CategorySlug } from '../agent/taxonomy.js'
import { extractFat, extractSize } from '../agent/units.js'
import { identity, storeCategoryKey, type Dictionary } from '../mapping/dictionary.js'
import type { SourceFile, StoreCode } from '../types.js'

export type Unmapped = { storeCode: StoreCode; sourceProductId: string; name: string; price: number
  sourceCategoryPath: string[]; guessedCategory: CategorySlug }

export function assertFresh(files: SourceFile[], required: StoreCode[], now: Date, maxAgeHours: number): void {
  for (const store of required) {
    const file = files.find((f) => f.storeCode === store)
    if (!file) throw new Error(`${store}: source file missing — run pnpm scrape:${store.toLowerCase().replace('_', '')}`)
    const ageHours = (now.getTime() - Date.parse(file.capturedAt)) / 3_600_000
    if (ageHours > maxAgeHours) throw new Error(`${store}: source file is stale (${Math.round(ageHours)} h old)`)
  }
}

export function buildSyncBundle(files: SourceFile[], dict: Dictionary, generatedAt: string): { bundle: Bundle; unmapped: Unmapped[] } {
  const known = new Map<string, ClassifiedProduct[]>()
  const clusters: Cluster[] = []
  const unmapped: Unmapped[] = []
  for (const file of files) {
    for (const product of file.products) {
      const key = dict.products[identity(file.storeCode, product.sourceProductId)]
      const card = key ? dict.canonicals[key] : undefined
      if (key && card) {
        // Все участники несут данные карточки из словаря → buildBundle выдаст то же название/бренд/атрибуты
        known.set(key, [...(known.get(key) ?? []), { storeCode: file.storeCode, product, category: card.category,
          productType: 'dictionary', brand: card.brand, attributes: card.attributes as Attributes, displayName: card.name, flags: [] }])
        continue
      }
      const guessed = dict.storeCategories[storeCategoryKey(file.storeCode, product.sourceCategoryPath)] ?? 'other'
      const fat = extractFat(product.name)
      unmapped.push({ storeCode: file.storeCode, sourceProductId: product.sourceProductId, name: product.name,
        price: product.price, sourceCategoryPath: product.sourceCategoryPath, guessedCategory: guessed })
      clusters.push({ method: 'deterministic', confidence: 1, review: 'pending', members: [{ storeCode: file.storeCode, product,
        category: guessed, productType: 'unmapped', brand: product.brand,
        attributes: { ...extractSize(product.name), ...(fat !== null ? { fatPercent: fat } : {}) }, displayName: product.name, flags: ['unmapped'] }] })
    }
  }
  for (const key of [...known.keys()].sort()) {
    const card = dict.canonicals[key]!
    clusters.push({ members: known.get(key)!, method: card.method, confidence: card.confidence, review: card.review })
  }
  const sources = files.map(({ products: _products, ...meta }) => meta)
  return { bundle: buildBundle(clusters, sources, generatedAt), unmapped }
}
```

`pipeline/src/cli/sync.ts`:
```ts
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { qualityReport } from '../agent/bundle.js'
import { readDictionary } from '../mapping/dictionary.js'
import { readSourceFile } from '../source-file.js'
import { assertFresh, buildSyncBundle } from '../sync/sync.js'
import { STORE_CODES, type StoreCode } from '../types.js'

const DATA = resolve(import.meta.dirname, '../../../data')
// Пока ANVAR не подключён (Phase B), обязательны три сети; список меняется через env без правки кода
const required = (process.env.SYNC_STORES ?? 'DINA,DANA,FIX_PRICE').split(',').map((s) => s.trim()) as StoreCode[]
if (!required.every((s) => STORE_CODES.includes(s))) throw new Error(`SYNC_STORES invalid: ${required.join(',')}`)
const maxAge = Number(process.env.SYNC_MAX_SOURCE_AGE_HOURS ?? 36)

const files = required.map((s) => readSourceFile(resolve(DATA, 'sources', `${s.toLowerCase()}.json`)))
assertFresh(files, required, new Date(), maxAge)
const dict = readDictionary(resolve(DATA, 'mapping/dictionary.json'))
const { bundle, unmapped } = buildSyncBundle(files, dict, new Date().toISOString())

mkdirSync(resolve(DATA, 'sync'), { recursive: true })
writeFileSync(resolve(DATA, 'sync/bundle.json'), JSON.stringify(bundle), 'utf8')
writeFileSync(resolve(DATA, 'sync/unmapped.json'), JSON.stringify(unmapped, null, 2), 'utf8')
console.log(qualityReport(bundle))
console.log(`[sync] unmapped: ${unmapped.length} → data/sync/unmapped.json`)
```

Имена файлов источников: `scrape.ts` пишет `${code.toLowerCase()}.json`, то есть `dina.json`, `dana.json`, `fix_price.json`. `cli/sync.ts` читает те же имена.

В `pipeline/package.json` добавить `"sync": "tsx src/cli/sync.ts"`.

- [ ] **Step 3: Тесты** — `pnpm test sync && pnpm test && pnpm typecheck` → PASS.

- [ ] **Step 4: Скрипт и runbook**

`pipeline/scripts/daily-sync.sh`:
```bash
#!/usr/bin/env bash
# Ежедневное обновление цен: адаптеры → словарь → cmd/ingest. Без LLM.
# Нужные env: APP_ENV, INGEST_DATABASE_URL, INGEST_MAX_STORE_DROP_PERCENT (+ INGEST_PRODUCTION_APPLY_CONFIRM=1 в production).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm scrape:dina
pnpm scrape:dana
pnpm scrape:fixprice
pnpm sync
cd ../backend-go
go run ./cmd/ingest -bundle ../data/sync/bundle.json            # dry-run: quality gates без записи
go run ./cmd/ingest -bundle ../data/sync/bundle.json -apply
```

`docs/data/SYNC_RUNBOOK.md` — разделы:
1. **Что делает** — схема выше; LLM не используется.
2. **Запуск вручную** — `bash pipeline/scripts/daily-sync.sh` с env.
3. **Расписание (SCRUM-8)** — пример `systemd` unit и timer на 06:00 и 18:00 по Актау (`OnCalendar=*-*-* 01,13:00:00 UTC`), `User=` отдельный, env из файла с правами 600. Одновременный запуск двух ingest исключён advisory lock в `cmd/ingest`.
4. **Если упало** — по `failureCode` из JSON-вывода: `store_count_drop`, `required_source_missing`, `canonical_merge_conflict` (словарь меняли → запуск с `-recluster`), падение скрапера (snapshot не публикуется, на сайте остаются вчерашние цены).
5. **Новые товары** — `data/sync/unmapped.json`; раз в неделю их обработку запускает `agent:new` (Task 18, выбор агента за Денисом). До этого они видны на сайте одиночными карточками.

- [ ] **Step 5: Проверка на тестовой БД** (после Task 11 Step 3, где bundle агента уже опубликован с `-recluster`):

```bash
cd pipeline && pnpm sync
cd ../backend-go
export APP_ENV=development INGEST_MAX_STORE_DROP_PERCENT=10 INGEST_DATABASE_URL=<тестовая БД>
go run ./cmd/ingest -bundle ../data/sync/bundle.json        # строгий режим, без -recluster
```

Expected: `failureCode` нет, `newCanonicalCount: 0`, `reusedCanonicalCount` = `canonicalCount`, `[sync] unmapped: 0` (файлы источников те же, что ушли в агента). Затем `-apply`, и API отдаёт те же карточки с теми же ID. Затем повторить `pnpm scrape:*` + `sync` на **свежих** данных. Ожидается небольшое число `unmapped` и dry-run без `failureCode`. Числа записать в `docs/data/SCRUM-7_REPORT.md`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/sync pipeline/src/cli/sync.ts pipeline/test/sync.test.ts pipeline/package.json pipeline/scripts/daily-sync.sh docs/data/SYNC_RUNBOOK.md docs/data/SCRUM-7_REPORT.md
git commit -m "feat(pipeline): deterministic daily price sync from mapping dictionary"
```

---

### Task 17: Dana — есть ли JSON API (разведка, таймбокс 2 часа)

**Files:**
- Create: `docs/data/DANA_SOURCE.md`
- При исходе A: Create `pipeline/test/fixtures/dana-api.json`; Modify `pipeline/src/scrapers/dana.ts`, `pipeline/test/dana.test.ts`

- [ ] **Step 1 (вручную, человек):** открыть `https://dana-market.kz/catalog/produkty_pitaniya_/bakaleya/krupy/` в Chrome, DevTools → Network → Fetch/XHR. Перелистнуть страницу, поменять сортировку, открыть карточку товара, добавить товар в корзину. Записать в `docs/data/DANA_SOURCE.md` все запросы, возвращающие JSON с товарами: URL, параметры, нужные заголовки и cookie, есть ли выбор города или магазина, пример ответа на 3 товара (без cookie).
- [ ] **Step 2: Решение**

| Исход | Действие |
|---|---|
| A. Есть JSON со списком товаров и id Bitrix-элемента | Новый адаптер `parseDanaJson` рядом с `parseDanaPage` + фикстура `dana-api.json`. **`sourceProductId` остаётся `dana_<id элемента Bitrix>`** — тот же, что у HTML-адаптера, иначе весь словарь Dana «потеряется» |
| B. JSON нет или он требует сессию | Оставить HTML-адаптер (он уже работает: 248 страниц, 5 корней). Зафиксировать в `DANA_SOURCE.md`, что при изменении вёрстки `sync` упадёт на `writeSourceFile` (0 товаров) и вчерашний snapshot останется опубликованным |

- [ ] **Step 3 (только исход A): тест на совпадение id.** Для товара, который есть и в `dana-page.html`, и в `dana-api.json`, `parseDanaJson(...)` и `parseDanaPage(...)` дают одинаковый `sourceProductId` и цену:

```ts
it('json adapter keeps the same ids as the html adapter', () => {
  const fromHtml = new Map(parseDanaPage(html, ['X']).map((p) => [p.sourceProductId, p.price]))
  const fromJson = parseDanaJson(JSON.parse(readFileSync(new URL('./fixtures/dana-api.json', import.meta.url), 'utf8')), ['X'])
  const common = fromJson.filter((p) => fromHtml.has(p.sourceProductId))
  expect(common.length).toBeGreaterThan(0)
  for (const p of common) expect(p.price).toBe(fromHtml.get(p.sourceProductId))
})
```
Обе фикстуры для этого теста снимаются в один день с одной и той же страницы каталога. `parseDanaJson` пишется по полям реального ответа из Step 1 по образцу `mapFixPriceItem` (Task 4).

- [ ] **Step 4: Commit** — `git add docs/data/DANA_SOURCE.md pipeline/src/scrapers/dana.ts pipeline/test && git commit -m "docs(data): Dana JSON API discovery"` (при исходе B — только `DANA_SOURCE.md`).

---

### Task 18: `agent:new` — еженедельная обработка новых товаров (НЕ ВЫПОЛНЯТЬ: выбор агента за Денисом)

Задача зафиксирована как контракт: реализует её тот, кого выберет Денис, с тем агентом, который он выберет.

- **Вход:** `data/sync/unmapped.json` (тип `Unmapped[]`, Task 16) + `data/mapping/dictionary.json`.
- **Работа:** для каждого незнакомого товара определить категорию и либо привязать его к существующей карточке словаря (тот же товар другой сети), либо создать новую карточку. Можно переиспользовать `classifyBatch` / `matchBlock` (Task 7–8) с любым провайдером, реализующим `LlmCall = (prompt, schema) => Promise<unknown>`. Действуют те же правила: не матчить одну сеть дважды, не матчить разный размер или жирность, confidence ≥ 0.95 → `approved`, 0.80–0.949 → `pending`.
- **Выход:** дополненный `dictionary.json`. Ключи существующих карточек не меняются; ключ новой — `canonicalKey(ids)`. Изменение словаря коммитится в git, чтобы diff было видно на ревью.
- **После:** ближайший `daily-sync.sh` запускается с `-recluster` у `cmd/ingest`: прежние одиночные карточки сливаются с существующими.

---

# PHASE B — Анвар

### Task 12: Разведка API приложения Анвар (вручную, таймбокс 1 день)

**Files:**
- Create: `docs/data/ANVAR_SOURCE.md`
- Create: `pipeline/test/fixtures/anvar-products.json` (обезличенный ответ, 3 товара)

**Важно про инструмент.** Wireshark видит только зашифрованный TLS-трафик, тела запросов в нём не прочитать. Нужен **MITM-прокси**: mitmproxy (бесплатно), HTTP Toolkit или Proxyman/Charles.

- [ ] **Step 1: Перехват с iPhone**
  1. На ПК: `pip install mitmproxy`, запустить `mitmweb --listen-port 8080`.
  2. iPhone в той же Wi-Fi: Настройки → Wi-Fi → (i) → Прокси → Вручную → IP ПК, порт 8080.
  3. На iPhone открыть `http://mitm.it` и установить профиль. Затем: Настройки → Основные → VPN и управление устройством → установить; Настройки → Основные → Об этом устройстве → Доверие сертификатам → включить для mitmproxy.
  4. Открыть приложение «Анвар», выбрать магазин в **Актау**, открыть каталог, 2–3 категории, поиск и карточку товара.
  5. В mitmweb найти запросы каталога и записать: base URL, пути, параметры пагинации, заголовки авторизации (это анонимный app-key или токен пользователя?), id магазина или города Актау, поля товара (id, name, price, oldPrice, image, barcode/EAN — **если штрихкод есть, сохранить его в `rawPayload.barcode`**, это лучший сигнал для матчинга).
- [ ] **Step 2: Если приложение не грузится через прокси** (certificate pinning), проверить путь arzan.kz. В DevTools на `arzan.kz/aktau` посмотреть, есть ли Анвар среди сетей и какие запросы к `api.arzan.kz` отдают его цены. Результат записать в `ANVAR_SOURCE.md` и согласовать с Denis допустимость использования чужого агрегатора.
- [ ] **Step 3: Решение (записать в `ANVAR_SOURCE.md`)**

| Исход | Решение |
|---|---|
| A. Каталог доступен с анонимным app-ключом | API-клиент в Task 13, ключ в `ANVAR_API_TOKEN` (env) |
| B. Нужен токен личного аккаунта | Одноразовый snapshot через HAR, экспортированный из mitmweb (`File → Save` → HAR). Токен и HAR не коммитятся, для регулярного обновления **не годится**: зафиксировать как риск |
| C. Pinning и arzan не помогают | Phase B откладывается. Phase A уже в проде. В Jira — комментарий с выводами и следующим шагом (запрос официального фида у Анвара) |

- [ ] **Step 4: Сохранить фикстуру.** Ответ каталога на 3 товара обезличить (удалить токены и id пользователя) и сохранить в `pipeline/test/fixtures/anvar-products.json`.
- [ ] **Step 5: Commit** — `git add docs/data/ANVAR_SOURCE.md pipeline/test/fixtures/anvar-products.json && git commit -m "docs(data): Anvar mobile API discovery"`

---

### Task 13: Сеть ANVAR во всей системе + скрапер

**Files:**
- Create: `backend/prisma/migrations/20261007000000_store_anvar_enum/migration.sql`
- Create: `backend/prisma/migrations/20261007000100_store_anvar_rows/migration.sql`
- Modify: `backend/prisma/schema.prisma` (enum `StoreCode` + `ANVAR`)
- Modify: `backend-go/internal/ingestion/bundle.go` (`stores`, `knownStore`, проверка `len(sourceSeen) != len(stores)`)
- Modify: `backend-go/internal/catalog/models.go` (константа `Anvar StoreCode = "ANVAR"` и валидация)
- Modify: `backend-go/internal/postgres/dashboard.go` (`WHEN 'ANVAR' THEN 4`)
- Modify: `backend-go/tests/fixtures/catalog.sql` (строка `('anvar','ANVAR','Анвар')`)
- Modify: `contracts/openapi.yaml:277` (`enum: [DINA, DANA, FIX_PRICE, ANVAR]`) + `contracts/tests`
- Modify: `frontend/src/api/types.ts:3`, `frontend/src/lib/stores.ts` (цвет), моки при необходимости
- Create: `pipeline/src/scrapers/anvar.ts`; Modify: `pipeline/src/cli/scrape.ts`
- Test: `pipeline/test/anvar.test.ts`, `backend-go/internal/ingestion/bundle_test.go`, `frontend/src/lib/stores.test.ts`

**Interfaces:**
- Produces: `mapAnvarItem(item: AnvarItem): SourceProduct | null`, `scrapeAnvar(): Promise<SourceFile>`, `loadAnvarFromHar(path): SourceFile`. В Go `stores` = `{"DINA","DANA","FIX_PRICE","ANVAR"}`.

- [ ] **Step 1: Падающие тесты**

Go — добавить в `bundle_test.go`:
```go
func TestValidateRequiresAnvarSourceRun(t *testing.T) {
	gen := "2026-10-07T10:00:00Z"
	b := Bundle{Version: "1.0", GeneratedAt: gen}
	for _, s := range []string{"DINA", "DANA", "FIX_PRICE"} {
		b.Sources = append(b.Sources, SourceInput{StoreCode: s, CapturedAt: gen})
	}
	if b.Validate() == nil {
		t.Fatal("bundle without ANVAR source run must be rejected")
	}
	b.Sources = append(b.Sources, SourceInput{StoreCode: "ANVAR", CapturedAt: gen})
	if err := b.Validate(); err != nil {
		t.Fatalf("four-store bundle rejected: %v", err)
	}
}
```

Pipeline — `pipeline/test/anvar.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapAnvarItem } from '../src/scrapers/anvar.js'

const items = JSON.parse(readFileSync(new URL('./fixtures/anvar-products.json', import.meta.url), 'utf8'))
const list: unknown[] = Array.isArray(items) ? items : items.items ?? items.data ?? []

describe('anvar', () => {
  it('maps every captured item', () => {
    const mapped = list.map((x) => mapAnvarItem(x as never))
    expect(mapped.every((p) => p && p.price > 0 && p.sourceProductId.startsWith('anvar_'))).toBe(true)
  })
})
```

Frontend — в `stores.test.ts` добавить `expect(storeColor('ANVAR')).not.toBe('#697178')`.

Run: `go test ./internal/ingestion -run Anvar` → FAIL; `pnpm test anvar` → FAIL; `cd frontend && pnpm test stores` → FAIL.

- [ ] **Step 2: Миграции** (две, потому что новое значение enum нельзя использовать в той же транзакции, где оно добавлено):

`20261007000000_store_anvar_enum/migration.sql`:
```sql
ALTER TYPE "StoreCode" ADD VALUE IF NOT EXISTS 'ANVAR';
```

`20261007000100_store_anvar_rows/migration.sql` (точки Актау взять с `anvar.kz/contacts/` или из приложения; координаты по адресу из 2ГИС; минимум 3 точки):
```sql
BEGIN;
INSERT INTO public.stores (id, code, name, "logoUrl")
VALUES ('store-anvar', 'ANVAR', 'Анвар', 'https://anvar.kz/favicon.ico')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.store_locations (id, "storeId", name, address, latitude, longitude)
SELECT v.id, s.id, v.name, v.address, v.lat, v.lon
FROM public.stores s, (VALUES
  ('loc-anvar-1', 'Анвар <название точки 1>', 'г. Актау, <адрес 1>', 0::float8, 0::float8)
) AS v(id, name, address, lat, lon)
WHERE s.code = 'ANVAR'
ON CONFLICT (id) DO NOTHING;
COMMIT;
```
**Перед коммитом** строки `VALUES` заменить реальными точками, собранными в Task 12. Тест `pipeline/test/taxonomy.test.ts` дополнить проверкой, что в этом SQL нет `<` и нет `0::float8, 0::float8`:
```ts
it('anvar locations are real', () => {
  const s = readFileSync(new URL('../../backend/prisma/migrations/20261007000100_store_anvar_rows/migration.sql', import.meta.url), 'utf8')
  expect(s).not.toMatch(/<|0::float8, 0::float8/)
})
```

- [ ] **Step 3: Код**
  - `schema.prisma`: `enum StoreCode { DINA DANA FIX_PRICE ANVAR }`.
  - `bundle.go`: `var stores = []string{"DINA", "DANA", "FIX_PRICE", "ANVAR"}`; `knownStore` переписать через `slices.Contains(stores, v)`; в `Validate` заменить `len(sourceSeen) != 3` на `len(sourceSeen) != len(stores)`.
  - `catalog/models.go`: добавить `Anvar StoreCode = "ANVAR"` рядом с `FixPrice`, а также в switch или map валидации, если он есть.
  - `dashboard.go`: `... WHEN 'FIX_PRICE' THEN 3 WHEN 'ANVAR' THEN 4 END`.
  - `openapi.yaml`: добавить `ANVAR` в enum, обновить `contracts/examples` при необходимости, прогнать `cd contracts && pnpm test`.
  - `frontend/src/api/types.ts`: `'DINA' | 'DANA' | 'FIX_PRICE' | 'ANVAR'`. В `stores.ts` добавить `ANVAR: '#b8860b'` (тёмно-жёлтый: не зелёный и отличим от синего, оранжевого и фиолетового при дальтонизме; правило из комментария в файле).
  - `pipeline/src/scrapers/anvar.ts`: тип `AnvarItem` и `mapAnvarItem` написать **по фикстуре из Task 12**, по образцу `fixprice.ts`: `sourceProductId: \`anvar_${id}\``, акционная цена в `price`, обычная в `oldPrice`, штрихкод в `rawPayload.barcode`. API-клиент (исход A) или `loadAnvarFromHar` (исход B) делаются через `politeFetch` и `extractJsonResponses` так же, как в Task 4. В `cli/scrape.ts` добавить `ANVAR`.
  - `classify.ts`: в промпт уже добавлено правило «store — магазин-продавец, НЕ бренд». Проверить, что тест `keeps brand Анвар for non-anvar store` зелёный.
  - **Фикстура совместимости:** после правки `bundle.go` трёхсетевая `testdata/pipeline_bundle.json` перестанет проходить `Validate`. В `pipeline/test/bundle.test.ts` добавить в `sources` `'ANVAR'` и кластер `{ members: [cp('ANVAR', 'anvar_1', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')], method: 'deterministic', confidence: 1, review: 'approved' }`, ожидание `productCount` поменять на `[1, 1, 1, 1]`, перегенерировать фикстуру через `pnpm test bundle`. В `TestDecodeAcceptsPipelineBundle` ожидать `4 raw, 3 groups, 4 sources`.
- [ ] **Step 4: Тесты** — `go test ./...`, `pnpm test`, `cd frontend && pnpm test`, `cd contracts && pnpm test`: всё PASS. Отдельно поправить существующие Go-тесты, которые ожидали ровно 3 сети (grep `FIX_PRICE` в `backend-go`).
- [ ] **Step 5: Commit** — `git add -A backend backend-go contracts frontend pipeline && git commit -m "feat: add Anvar as fourth store across schema, API, ingest and pipeline"`

---

### Task 14: Прогон 4 сетей на тестовой БД → Supabase, закрытие задачи

- [ ] **Step 1:** `pnpm scrape:anvar`. Затем, если категории ещё не классифицированы, `agent:classify` (кэш ускорит повтор для уже классифицированных товаров) и `agent:match`.
- [ ] **Step 2:** На тестовой БД применить миграции `20261007*`, затем `cmd/ingest -recluster` (dry-run, потом `-apply`). Quality gates из Task 11 плюс: ANVAR raw ≥ 1000, canonical в 4 сетях ≥ 20, корзина дашборда содержит 4 сети.
- [ ] **Step 3:** Фронт против тестового API: Анвар виден на карте и в корзинах, цвет корректный.
- [ ] **Step 4:** Production — те же шаги, что в Task 11 Step 6, после «ок» Denis.
- [ ] **Step 5:** Дописать `docs/data/SCRUM-7_REPORT.md` (метрики до и после, решения, риски обновления Анвара). Оставить комментарий в Jira SCRUM-7 со ссылкой на PR и отчёт.
- [ ] **Step 6:** `git push -u origin feat/scrum-7-data` и PR в `integrate/full-stack`.

---

## Риски и решения, требующие внимания человека

1. **Анвар (Task 12)** — единственная часть с неизвестным исходом. Phase A от неё не зависит.
2. **Правовой аспект:** перехват API чужого приложения и использование arzan.kz нужно согласовать с Denis. Roadmap Part 08 прямо запрещает production-скрейпинг на чужих cookies и хрупких сессиях.
3. **Стоимость LLM:** около 15–20 тыс. товаров → ~450 запросов классификации и ~1–3 тыс. запросов сопоставления на flash-lite. Кэш делает повторные прогоны почти бесплатными.
4. **URL старых товаров:** при `-recluster` часть прежних canonical перестаёт иметь офферы, и их страницы на фронте отдадут 404. Для пилота это приемлемо, редиректы — отдельная задача.
5. **Параллельная работа с SCRUM-3** (Denis переводит бэкенд на Go): Task 10 и Task 13 трогают `backend-go`. Перед этими задачами подтянуть свежий `integrate/full-stack`.
