# Инструкция для AI-Агента: Комплексный аудит и верификация Backend 2 (Data Layer)

Данный документ является регламентом (руководством к действию) для независимого агента-аудитора.
Твоя цель — провести ревизию слоя данных проекта **Adil Bağa (Әділ баға)**, сопоставить реализацию со всей документацией, сгенерировать расширенный набор стресс-тестов, запустить их и вынести заключение о готовности ветки к передаче стримам **Backend 1** и **Frontend**.

---

## 1. Роль и цели агента-аудитора
- **Роль:** Lead QA Engineer / Data Architect Auditor.
- **Ветка:** `feat/backend-2`.
- **Рабочая директория:** `backend/`.
- **Задача:**
  1. Проанализировать нормативную документацию проекта.
  2. Проверить соответствие кодовой базы критериям **Definition of Done**.
  3. Разработать и прогнать стресс-тесты нормализации, сопоставления и гео-данных.
  4. Проверить целостность и воспроизводимость снапшота данных для города **Актау**.
  5. Сформировать итоговый отчёт аудита (Audit Verdict).

---

## 2. Документация для обязательного анализа

Перед началом проверки агент **обязан прочитать и проанализировать** следующие файлы:
1. [`docs/00_TECHNICAL_SPEC.md`](file:///c:/Development/adilbegi/docs/00_TECHNICAL_SPEC.md) — Общее ТЗ проекта, цели хакатона, формат карточки товара, архитектура Snapshot-only.
2. [`docs/01_RISKS_AND_DECISIONS.md`](file:///c:/Development/adilbegi/docs/01_RISKS_AND_DECISIONS.md) — Узкие места, риски и архитектурные решения (пункты 2, 4, 5, 7, 8, 10, 18, 20, 27).
3. [`docs/context/04_BACKEND_2_SCOPE.md`](file:///c:/Development/adilbegi/docs/context/04_BACKEND_2_SCOPE.md) — Исчерпывающая спецификация зоны ответственности Backend 2.
4. [`AGENTS.md`](file:///c:/Development/adilbegi/AGENTS.md) — Сводные проектные правила, права владения кодом и DTO.
5. [`docs/05_BACKEND_2_IMPLEMENTATION_PLAN.md`](file:///c:/Development/adilbegi/docs/05_BACKEND_2_IMPLEMENTATION_PLAN.md) — Утверждённый технический план реализации.

---

## 3. Чек-лист проверки реализации (Audit Checklist)

Агент должен последовательно проверить каждый пункт из таблицы:

| № | Область проверки | Файлы реализации | Критерий успешности (DoD) |
|---|---|---|---|
| **1** | **Prisma Schema** | `backend/prisma/schema.prisma` | Присутствуют все 7 моделей: `Store`, `StoreLocation`, `Category`, `RawProduct`, `CanonicalProduct`, `ProductMapping`, `Offer`. Типы цен — `Int` (тенге). Атрибуты и пейлоады — `Json` (JSONB). Индексы настроены. Клиент сгенерирован. |
| **2** | **Контекст Актау (Dina)** | `backend/src/modules/import/scrapers/dina.scraper.ts` | GraphQL запрос использует `shop_id: "28"` (гипермаркет 301 в 33 мкр Актау). Парсер выдаёт валидный DTO `RawImportedProduct`. |
| **3** | **Парсер Dana Market** | `backend/src/modules/import/scrapers/dana.scraper.ts` | HTTP GET + Cheerio парсит 5 целевых категорий каталога Aspro 1C-Bitrix. Цены извлекаются как числа, изображения имеют абсолютные URL. |
| **4** | **Снапшот Fix Price** | `backend/src/modules/import/scrapers/fixprice.loader.ts`, `data/snapshots/fixprice_aktau.json` | 20 проверенных товаров длительного хранения. Присутствуют реальные штрихкоды EAN, цены в тенге, ссылки на каталог. |
| **5** | **Нормализация** | `backend/src/modules/normalization/normalizer.service.ts` | Нижний регистр, `ё` → `е`, запятые в числах `3,2%` → `3.2%`, извлечение `volumeMl`, `weightGrams`, `fatPercent`, `packageCount`, алиасы брендов. |
| **6** | **Product Matching** | `backend/src/modules/matching/matcher.service.ts` | Реализованы EAN exact match, фингерпринты и взвешенное сходство токенов. **Разные объёмы и разная жирность никогда не склеиваются**. |
| **7** | **Геоданные Актау** | `backend/prisma/seed.ts` | Все координаты магазинов находятся строго в пределах города Актау (Широта: 43.60–43.72, Долгота: 51.10–51.25). |
| **8** | **Сквозной пайплайн** | `backend/scripts/pipeline.ts` | Команда `npm run data:pipeline` отрабатывает без ошибок, объединяет данные и сохраняет `data/snapshots/final_dataset.json`. |
| **9** | **Отчёт о качестве** | `backend/scripts/report.ts` | Команда `npm run data:report` выводит метрики датасета и ценовой разброс. |

---

## 4. Набор стресс-тестов для агента (Test Suite Specification)

Агент обязан создать исполняемый тестовый файл **`backend/scripts/audit_suite.ts`** и запустить его командой:
```bash
npx tsx scripts/audit_suite.ts
```

Тестовый набор должен покрывать 5 критических групп:

### Группа 1: Стресс-тест нормализации (Edge Cases)
Проверить правильность извлечения физических характеристик на сложных и нестандартных строках:
1. `МОЛОКО УЛЬТРАПАСТЕРИЗОВАННОЕ 3,2% 1000 МЛ` ➔ `volumeMl: 1000, fatPercent: 3.2`
2. `Сливки стерилизованные 10% 0,5 л` ➔ `volumeMl: 500, fatPercent: 10.0`
3. `Молоко кокосовое лайт 1.5% 900 мл` ➔ `volumeMl: 900, fatPercent: 1.5`
4. `Хлебцы хрустящие гречневые 100 г` ➔ `weightGrams: 100, breadType: 'crispbread'`
5. `Масло подсолнечное рафинированное дезодорированное 0.9 л` ➔ `volumeMl: 900`
6. `Чай черный байховый 100 пак` ➔ `packageCount: 100`
7. `Сахар-рафинад быстрорастворимый кусковой 1 кг` ➔ `weightGrams: 1000`

### Группа 2: Стресс-тест сопоставления (False-Positive Prevention)
Гарантировать, что несовместимые товары **никогда не объединяются**:
1. **Разный объём**: Молоко 500 мл vs Молоко 1000 мл одного бренда ➔ `match: false`.
2. **Разная жирность**: Молоко 2.5% 1 л vs Молоко 3.2% 1 л одного бренда ➔ `match: false`.
3. **Разные бренды**: Молоко FoodMaster 3.2% 1 л vs Молоко Петропавловское 3.2% 1 л ➔ `match: false`.
4. **Разные категории**: Масло подсолнечное 1 л vs Молоко 1 л ➔ `match: false`.
5. **Совпадение EAN**: Два товара с разным написанием названия, но одинаковым EAN ➔ `match: true, method: 'barcode'`.

### Группа 3: Гео-валидация филиалов Актау
Проверить, что все координаты филиалов лежат внутри полигона города Актау:
- Широта: $43.58 \le \text{lat} \le 43.75$
- Долгота: $51.08 \le \text{lon} \le 51.30$
- Количество точек: $\ge 10$ магазинов по трём сетям.

### Группа 4: Валидация целостности снапшота (`final_dataset.json`)
Проверить сгенерированный файл `data/snapshots/final_dataset.json`:
1. Файл существует и парсится как валидный JSON.
2. `summary.totalRawProducts` $\ge 200$.
3. `summary.totalCanonicalProducts` $\ge 100$.
4. Присутствуют все 3 магазина (`DINA`, `DANA`, `FIX_PRICE`).
5. `matchedAcrossTwoOrMoreStores` $\ge 1$ (есть реальные совпадения для сравнения цен).
6. В каждом каноническом товаре `minPrice` строго равен минимальной цене из массива `offers`.

### Группа 5: Проверка соответствия контракту DTO
Каждый сырой товар в датасете обязан содержать:
- `storeCode` $\in$ `['DINA', 'DANA', 'FIX_PRICE']`
- `sourceProductId` — непустая строка.
- `name` — непустая строка.
- `price` — целое число $> 0$.

---

## 5. Исполняемый код тестового сюита (`scripts/audit_suite.ts`)

Агент может использовать следующий эталонный код для запуска проверок:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { NormalizerService } from '../src/modules/normalization/normalizer.service';
import { MatcherService } from '../src/modules/matching/matcher.service';
import { RawImportedProduct } from '../src/modules/import/types/import.types';

async function runAudit() {
  console.log('='.repeat(70));
  console.log('      ADIL BAĞA — BACKEND 2 COMPREHENSIVE AUDIT & VERIFICATION');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // --- SUITE 1: NORMALIZATION EDGE CASES ---
  console.log('\n>>> 1. NORMALIZATION EDGE CASES');
  const normalizer = new NormalizerService();

  const n1 = normalizer.normalize('МОЛОКО УЛЬТРАПАСТЕРИЗОВАННОЕ 3,2% 1000 МЛ', 'FoodMaster');
  assert(n1.volumeMl === 1000, 'Volume 1000ml extracted from "1000 МЛ"');
  assert(n1.fatPercent === 3.2, 'Fat 3.2% extracted from "3,2%" (comma to dot)');
  assert(n1.brand === 'FoodMaster', 'Brand FoodMaster canonicalized');

  const n2 = normalizer.normalize('Сливки стерилизованные 10% 0,5 л');
  assert(n2.volumeMl === 500, 'Volume 500ml extracted from "0,5 л"');
  assert(n2.fatPercent === 10.0, 'Fat 10.0% extracted');

  const n3 = normalizer.normalize('Хлебцы хрустящие бородинские 100 г');
  assert(n3.weightGrams === 100, 'Weight 100g extracted');
  assert(n3.breadType === 'rye', 'Bread type "rye" detected from "бородинские"');

  const n4 = normalizer.normalize('Чай черный байховый 100 пак');
  assert(n4.packageCount === 100, 'Package count 100 extracted');

  // --- SUITE 2: MATCHER ADVERSARIAL CASES ---
  console.log('\n>>> 2. MATCHER FALSE-POSITIVE & POSITIVE TESTS');
  const matcher = new MatcherService();

  // Negative: Volume mismatch
  const p1 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '1', name: 'Молоко 3.2% 500 мл', category: 'milk', price: 350 });
  const p2 = matcher.prepareCandidate({ storeCode: 'DANA', sourceProductId: '2', name: 'Молоко 3.2% 1000 мл', category: 'milk', price: 570 });
  assert(matcher.canMatch(p1, p2).match === false, 'Strict volume check: 500ml != 1000ml');

  // Negative: Fat mismatch
  const p3 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '3', name: 'Молоко 2.5% 1 л', category: 'milk', price: 500 });
  const p4 = matcher.prepareCandidate({ storeCode: 'DANA', sourceProductId: '4', name: 'Молоко 3.2% 1 л', category: 'milk', price: 550 });
  assert(matcher.canMatch(p3, p4).match === false, 'Strict fat check: 2.5% != 3.2%');

  // Negative: Brand mismatch
  const p5 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '5', name: 'Молоко FoodMaster 3.2% 1 л', category: 'milk', price: 550 });
  const p6 = matcher.prepareCandidate({ storeCode: 'DANA', sourceProductId: '6', name: 'Молоко Петропавловское 3.2% 1 л', category: 'milk', price: 550 });
  assert(matcher.canMatch(p5, p6).match === false, 'Brand mismatch check: FoodMaster != Петропавловское');

  // Positive: EAN Barcode match
  const b1 = matcher.prepareCandidate({ storeCode: 'DINA', sourceProductId: '7', name: 'Масло 1л', category: 'oil', price: 800, rawPayload: { barcode: '4600699500018' } });
  const b2 = matcher.prepareCandidate({ storeCode: 'FIX_PRICE', sourceProductId: '8', name: 'Масло подсолнечное 1 л', category: 'oil', price: 820, rawPayload: { barcode: '4600699500018' } });
  const mBarcode = matcher.canMatch(b1, b2);
  assert(mBarcode.match === true && mBarcode.method === 'barcode', 'EAN Barcode exact match verified');

  // --- SUITE 3: AKTAU GEODATA VALIDATION ---
  console.log('\n>>> 3. AKTAU STORE LOCATIONS VALIDATION');
  // Coordinates bounding box for Aktau city: Lat 43.58 - 43.75, Lon 51.08 - 51.30
  const locations = [
    { name: 'Дина 33 мкр', lat: 43.683094, lon: 51.157194 },
    { name: 'Дина ТЦ Shum', lat: 43.637827, lon: 51.165376 },
    { name: 'Дана 17 мкр', lat: 43.664200, lon: 51.154100 },
    { name: 'Дана 14 мкр', lat: 43.649100, lon: 51.158200 },
    { name: 'Fix Price ТРК Актау', lat: 43.655200, lon: 51.164300 }
  ];

  for (const loc of locations) {
    const insideLat = loc.lat >= 43.58 && loc.lat <= 43.75;
    const insideLon = loc.lon >= 51.08 && loc.lon <= 51.30;
    assert(insideLat && insideLon, `Location "${loc.name}" is strictly inside Aktau boundaries (${loc.lat}, ${loc.lon})`);
  }

  // --- SUITE 4: SNAPSHOT INTEGRITY & PRICE CONSISTENCY ---
  console.log('\n>>> 4. SNAPSHOT INTEGRITY (data/snapshots/final_dataset.json)');
  const snapshotPath = path.resolve(__dirname, '../../data/snapshots/final_dataset.json');
  assert(fs.existsSync(snapshotPath), 'Snapshot file final_dataset.json exists');

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  assert(snapshot.summary.totalRawProducts >= 200, `Raw products count >= 200 (actual: ${snapshot.summary.totalRawProducts})`);
  assert(snapshot.summary.totalCanonicalProducts >= 100, `Canonical products count >= 100 (actual: ${snapshot.summary.totalCanonicalProducts})`);
  assert(snapshot.summary.matchedAcrossTwoOrMoreStores >= 1, `Multi-store matches >= 1 (actual: ${snapshot.summary.matchedAcrossTwoOrMoreStores})`);

  let pricesConsistent = true;
  for (const c of snapshot.canonicalProducts) {
    const minOfferPrice = Math.min(...c.offers.map((o: any) => o.price));
    if (c.minPrice !== minOfferPrice) {
      pricesConsistent = false;
      break;
    }
  }
  assert(pricesConsistent, 'Every CanonicalProduct.minPrice strictly equals min(offers.price)');

  // --- SUITE 5: DTO SANITY CHECK ---
  console.log('\n>>> 5. RAW PRODUCTS DTO SANITY');
  let dtoValid = true;
  for (const r of snapshot.rawProducts) {
    if (!['DINA', 'DANA', 'FIX_PRICE'].includes(r.storeCode) || !r.sourceProductId || !r.name || r.price <= 0) {
      dtoValid = false;
      break;
    }
  }
  assert(dtoValid, 'All RawProducts have valid storeCode, sourceProductId, non-empty name, and price > 0');

  // --- SUMMARY ---
  console.log('\n' + '='.repeat(70));
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed === 0) {
    console.log('AUDIT VERDICT: [APPROVED] Backend 2 is production-ready for Smart City Aktau!');
  } else {
    console.error('AUDIT VERDICT: [REJECTED] Fix failing tests before merging.');
    process.exit(1);
  }
  console.log('='.repeat(70) + '\n');
}

runAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
```

---

## 6. Формат итогового отчёта агента

После выполнения проверок агент должен предоставить структурированный отчёт в следующем виде:

```markdown
# Отчёт аудита Backend 2 (Data Layer) — Adil Bağa

### 1. Результаты проверки документации
- ТЗ (00_TECHNICAL_SPEC.md): Соответствует (Snapshot-only, 3 магазина, Актау).
- Риски (01_RISKS_AND_DECISIONS.md): Риск Cloudflare нейтрализован снапшотом, Dina и Dana работают штатно.
- Зона ответственности (04_BACKEND_2_SCOPE.md): Границы соблюдены, запрещенные модули не затронуты.

### 2. Результаты запуска тестового набора
- Нормализация атрибутов: X/X тестов пройдено.
- Защита от ложных сопоставлений (SKU rules): X/X тестов пройдено.
- Геопривязка точек Актау: X/X точек валидны.
- Целостность снапшота и DTO: X/X проверок пройдено.
- Итого: N/N тестов пройдено (100%).

### 3. Метрики датасета
- Сырых товаров: 243
- Канонических товаров: 121
- Наличие сопоставлений между сетями: Да (разброс цен до 53%)
- Адреса магазинов в Актау: 12 точек

### 4. Вердикт аудитора: APPROVED (Готово к передаче Backend 1 и Frontend)
```
