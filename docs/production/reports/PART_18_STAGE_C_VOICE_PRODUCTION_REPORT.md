# Aktau Market — Part18 Stage C: Production Voice Acceptance

Status: **PRODUCTION_VOICE_PASS**.

Дата: 2026-10-14. **Одна Owner-authorized production acceptance завершена**;
это не final Part18 launch PASS и не новый physical Siri test.
Никакого автоматического перехода к следующему этапу.

## 1. Authorization, baseline и preservation

Owner явно разрешил7 public API GET,5 Voice POST,3 exact owned Redis reads и2
reserved cleanup commands. Отдельным ответом «Да» подтвердил coordination gate:
на время smoke согласовано отсутствие параллельного publish/ingestion. Таймеры
не останавливались/изменялись агентом; Backend2/PR24 не затрагивались.

Fresh fetch/prune exit0; branch `feat/part-18-production-gate`, worktree
`/home/denis/tmp/adilbaga-part18-production-gate`.
HEAD = origin/main = **54174be84c0daf5feee50701e62d213107a68f0c**.
Active API release independently confirmed:
**438ecdfa3d386a186dcd8b73c3c10aef5e79dc82**; healthy, restart count0.
Loopback ready200. Release/running/healthy rechecked within bounded invocation
before/after each Voice POST и в конце; release drift не наблюдался.

Прочитаны project rules, [Stage A](PART_18_STAGE_A_REPORT.md),
[B1](PART_18_STAGE_B1_REPORT.md), [B2](PART_18_STAGE_B2_REPORT.md),
[accepted preparation](PART_18_STAGE_C_VOICE_PREP_REPORT.md),
[existing validators](../../../scripts/deploy/auto_smoke.py),
[HTTP helper](../../../scripts/deploy/auto_broker.py), Voice live/parity tooling и
frozen contract. Предыдущие четыре reports сохранены byte-identical.
Source/DTO/SQL/model/provider timeout/fallback/CI не изменялись.

## 2. Temporary operator invocation — local proof до POST

Invocation и его tests созданы через apply_patch в новом private temporary
native-WSL directory **вне Git**, не в production filesystem. Не содержит секретов.
Existing `Smoke` validators и `auto_broker.http` reuse; не весь `Smoke.run()`,
не Host/broker rollout. Existing module source загружен в memory trusted VPS
Python через SSH stdin; installation/config changes/remote files не создавались.
Нового business-validator или committed smoke runner нет.

Механика invocation:

- Independent counts hard caps7/5/3/2; increment перед admission, no retries.
- Linux SIGALRM/setitimer per-operation wall-clock≤18s; shared total360s,
  normal-phase cutoff324s, reserve36s для cleanup. Deadline unwind через finally,
  не force-kill без cleanup. Inventory и pauses тоже bounded.
- Sequential POST admission≥1s; callbacks не parallel.
- Received session registered owned **до** semantic assertions. Cleanup только
  exact existing SHA256 session key, no scans/unrelated sessions.
- Finally DEL+GET absence при known owned session failure; lost response/unknown
  session → cleanup_unverifiable, STOP, no key guessing.
- HTTP helper сохраняет transport/content-type/redirect/body-size/cache checks.
  Narrow observer записывает только HTTP status/duration, не body/headers/secrets.
- Product offer ordering проверяется priceASC до сравнения; только permitted
  equal-price ties canonicalized by price/storeCode в detail comparison, полные
  Offer objects/остальные Product fields не игнорируются.
- Не введена ложная equality всех product snapshotAt с dashboard timestamp:
  это offer capture times, не global published snapshot identity. Coordination
  и observed catalog truth отделены от continuous DB snapshot audit.

Local mock/loopback suite **13/13 PASS**, exit0:

| Check | Result |
| --- | --- |
| Full success order7GET/5POST/3Redis, no cleanup command needed | PASS |
| Safe output excludes test session/token/location fields | PASS |
| Missing operator credentials before any network call | PASS |
| Release drift before any Voice admission | PASS |
| Voice cap and separate GET/Redis/cleanup caps | PASS |
| Unexpected clarification registered then cleaned before further scenarios | PASS |
| Invalid clarification schema stops and finally cleans | PASS |
| Cleanup command failure → failure, never PASS | PASS |
| Wrong returned price → immediate STOP | PASS |
| Real short wall-clock timeout → cleanup_unverifiable | PASS |
| Normal global deadline cutoff preserves cleanup reserve | PASS |
| Unexpected HTTP failure fail-closed | PASS |
| Real loopback HTTP500 via unchanged HTTP helper recorded safely | PASS |

Initial11-test run had one mock-adapter error (dict body indexed as command
array). Corrected only temporary test adapter; final expanded13 PASS. Repository
runtime/tests untouched. Mock proof не объявляется production evidence.

## 3. Trusted credential context

Existing VPS private API env file checked root-owned regular file/mode0600;
использованы только existing Upstash URL/token entries внутри trusted operator
process. Значения не показаны, не переданы в SSH argv, не скопированы локально,
в helper/report/Git. No secret filesystem search, credential rotation или new
configuration. URL validated до Voice POST; known provider context не заменялся.
Session data получена только в памяти для presence/TTL decisions, не выводилась.
Gemini keys/provider responses не читались; actual application NLP path работал
с неизменённой runtime конфигурацией. Provider benchmarks не выполнялись.

SSH: existing alias, BatchMode=yes, StrictHostKeyChecking=yes, ConnectTimeout10.
Host-key verification не отключалась. Remote invocation exit0, stderr отсутствовал.

## 4. Production preflight — ровно7 public GET

Existing HTTP helper с truthful approved operator User-Agent, HTTPS/TLS verification,
redirect rejection, no cookies. Timing — per-operation wall duration, один sample,
не TTFB/p95/SLA. Raw catalog DTO/price/location values не записаны в report.

| GET | HTTP | duration_ms | Result |
| --- | ---: | ---: | --- |
| /health/live | 200 | 758 | ok |
| /health/ready | 200 | 801 | ready |
| /api/categories | 200 | 1485 | milk present |
| /api/categories/milk/filters | 200 | 1023 | volume1000/fat3.2 options available |
| /api/products with approved milk filters, price_asc, limit3 | 200 | 2014 | **3 matching usable products**, offer ordering/minPrice validated |
| /api/products/:id first discovered product | 200 | 1489 | Full detail/reference match; allowed offer ties preserved |
| /api/dashboard | 200 | 956 | Existing public locations available |

Synthetic coordinate выбрана из public StoreLocation только в памяти; finite
values, не реальная user geolocation. Coordinates не логировались/не публикуются.
Preflight PASS до первого Voice POST; ни один prerequisite не был «исправлен»
изменением данных, credentials, конфигурации или fixture fallback.

Owner no-parallel-publish confirmation — **attributed coordination evidence**,
не независимый continuous SQL snapshot observer. Каталог/detail reference и
Voice truth не показали изменения данных; дополнительного public GET/SQL audit
для published snapshot ID не было. Не утверждается full independent database
fingerprint/history invariance или невозможность незаметного identical-data publish.
При observed mismatch invocation прекращает сценарий; release check был direct.

## 5. Production Voice results — ровно5 POST

Request text, coordinates, session IDs, raw responses и provider logs не записаны.
Все results проверены existing `Smoke.result` по current catalog truth:
product name/image identity, minPrice, usable cheapest offer store, chosen-chain
nearest location/Haversine rounded distance, exact speech. При equal-price offers
store должен принадлежать valid cheapest set, secondary offer order не выдуман.

| Step / route | HTTP | duration_ms | Semantic result | Catalog /price /store /location /speech |
| --- | ---: | ---: | --- | --- |
| TOP1 /api/voice/start | **201** | **4079** | result/single,1item, PASS | true /true /true /true /true |
| TOP3 /api/voice/start | **201** | **4048** | result/list,3items, PASS | true /true /true /true /true |
| Clarification /api/voice/start | **201** | **3579** | needs_clarification, owned opaque session, required fields/question shape PASS | Not applicable: no fabricated result |
| Continue /api/voice/continue | **201** | **4805** | result/single, PASS | true /true /true /true /true |
| Completed-session /api/voice/continue | **404** | **805** | Expected frozen error envelope, PASS | Not applicable |

Нет HTTP500/5xx/429, timeout, unexpected schema/semantic mismatch или release drift.
Никакого repeat POST/automatic rollback. Provider success/fallback class отдельно
не считывался: **application-level correctness PASS**, не Gemini-perfect claim.
Historical e6ef854/d609 HTTP500 не воспроизведён этим single controlled run на438.

## 6. TTL, absence и budget

| Owned-session command | HTTP | duration_ms | Safe result |
| --- | ---: | ---: | --- |
| GET after clarification | 200 | 877 | Own session present; payload suppressed |
| TTL after clarification | 200 | 864 | **0<TTL≤600: true**; numeric TTL не нужен в report |
| GET after successful continue | 200 | 923 | **Own session absent: true** |

Server completion deletion подтверждена Redis absence и expected subsequent404.
Session cleanup confirmed=true. Emergency finally cleanup path был проверен на
mocks, но production DEL **не понадобился**. Не выполнялись KEYS/SCAN/FLUSH,
operations по чужим sessions или provider probe без owned key.

| Budget | Allowed max | Used |
| --- | ---: | ---: |
| Public API GET | 7 | **7** |
| Voice POST | 5 | **5** |
| Owned Redis GET/TTL/GET-absence | 3 | **3** |
| Reserved cleanup DEL/GET-absence | 2 | **0** |
| Total counted network requests | 17 | **15** |

Сумма recorded HTTP durations **28.506s**; это не отдельно измеренный полный
SSH process lifetime. Shared deadline enforcement не сработал/не исчерпан;
самая длинная recorded operation4.805s <18s. Remote execution завершился normal
exit0 с PRODUCTION_VOICE_PASS и cleanup_confirmed=true. Ни один budget не превышен.
Release inventory local reads и первичный loopback ready GET не public API requests;
additional public GET/POST после завершения не выполнялись.

## 7. Actual checks / remaining manual acceptance

| Command/check | Exit / result |
| --- | --- |
| rtk git fetch origin --prune; branch/rev-parse/status | 0; exact baseline, four known reports preserved |
| Trusted SSH selected docker revision/health/restart inventory | 0;438 release/healthy/restart0 |
| Trusted SSH loopback ready GET | 0;200 ready |
| Temporary python3 -B test_operator.py with clean local env/existing module imports | Initial1 for one mock bug; final **0,13/13 PASS** |
| One trusted SSH sudo python3 -B stdin operator invocation | **0**; stderr absent;15 counted network requests, all expected outcomes |
| Final accepted-report SHA256 / scope / links / diff-check / bounded secret scan | 0 PASS |

Temporary helper/tests outside Git are source-only, no secrets/session values
persisted. Repository source, API contracts, runtime/model/timeout, CI workflows
не менялись. Full local suite не повторялась: accepted PREP tests сохранены,
новый operator tested до production; никаких benchmark повторов.

**Осталось:** Owner manual physical iPhone/Siri TOP1, TOP3, clarification/continue,
spoken result/notification/permissions experience на runtime438; записать только
owner-reported outcome/date/release, не выдумывать screenshots/timing. Предыдущее
owner Siri PASS историческое, не выполнение этого следующего ручного gate.
Part16 signed/convergence, governance/operations/legal и другие Part18 gates
из B2 не закрываются этой Voice acceptance.

## 8. Safety / final disposition

Создан только `PART_18_STAGE_C_VOICE_PRODUCTION_REPORT.md` в repository.
Stage A/B1/B2/PREP byte-match PASS. No database/catalog/security writes, migration,
ingestion/snapshot publication, HMAC webhook, systemd/access/credentials/provider
config changes, deploy, frontend/Backend2/PR24 action. Единственные разрешённые
application state mutations — собственная короткая Voice session через start/
continue и её штатное завершение; direct Redis commands были read-only.
Automatic Go CI/CD остаётся FROZEN; никаких commit/push/PR/merge.
Bounded scan и safe result-only output не заменяют exhaustive production log audit:
runtime/provider logs в этой проверке не выгружались.

**PRODUCTION_VOICE_PASS. STOP для external review и ручного Siri acceptance.**
