# Aktau Market — Part18 Stage C: Voice/Siri Acceptance Preparation

Status: **READY_FOR_EXTERNAL_REVIEW**.

**Local preparation PASS. Production Voice acceptance NOT RUN; Part18 launch остаётся BLOCKED.**
Дата: 2026-10-14 Asia/Qyzylorda. Отдельное разрешение production POST ещё не получено.

## 1. Provenance и scope

Fresh `git fetch origin --prune` exit0; branch `feat/part-18-production-gate`,
HEAD = origin/main = **54174be84c0daf5feee50701e62d213107a68f0c**.
Worktree `/home/denis/tmp/adilbaga-part18-production-gate`. Три известных Stage A/B1/B2
reports сохранены byte-identical; tracked source clean, другие worktree не трогались.
Применены предоставленные project rules и explicit Part18 branch scope.

Изучены [Stage A](PART_18_STAGE_A_REPORT.md), [B1](PART_18_STAGE_B1_REPORT.md),
[B2](PART_18_STAGE_B2_REPORT.md), [Voice remediation](VOICE_VOCABULARY_REMEDIATION.md),
[исторический HTTP500](PUBLIC_VOICE_500_DIAGNOSTIC.md),
[frozen OpenAPI](../../../contracts/openapi.yaml),
[API v1](../API_V1_CONTRACT.md),
[live tests](../../../backend-go/tests/integration/voice_live_test.go),
[local parity](../../../backend-go/tests/integration/voice_parity_test.go),
[existing smoke helper](../../../scripts/deploy/auto_smoke.py), его tests и HTTP helper,
Voice/state/validation/fallback/session/location/HTTP regression tests.

Accepted production release **438ecdfa3d386a186dcd8b73c3c10aef5e79dc82** установлен
в B1; повторного production inventory здесь не было. main не объявляется API release.
Automatic CI/CD FROZEN; Backend2/PR24 не затрагивались. Не читались provider/DB/Redis
secrets, не было production HTTP/SSH/SQL/Redis calls, POST, benchmarks, deployment,
ingestion или snapshot publish. Production/remote конфигурация не менялась.

Локально: existing mocks/httptest и два task-owned disposable loopback PG17,
existing fixtures/helper. Миграции/роль/fixture/snapshot SQL выполнялись **только
в новых owned local test DB**, не Supabase. Это local test setup, не DB contract
change. Нет новых dependencies, Docker image build/API deployment, frontend changes.
Новый runner не создан; runtime/tests не изменялись — подтверждённого нового
runtime defect не найдено.

## 2. Что уже покрывает существующий tooling

| Tool/profile | Coverage | Boundary |
| --- | --- | --- |
| internal/voice, gemini, redis, location, httpapi, middleware tests | Strict schema, compact/targeted NLP, fallback, merge, TTL600/delete, TOP1/TOP3, speech, Haversine, HTTP/errors/privacy/limiter | Local mocks/loopback, не real providers |
| TestLocalVoiceParity | Go/Nest exact result/speech/location, direct/clarification/errors | Explicit local restricted PG/reference, deterministic fallback, test sessions |
| TestLocalVoiceVocabulary / SnapshotSwitch | Configured typed vocabulary/current live options, selected snapshot validation, stale required milk→clarification, no stale SQL result | Guarded dedicated loopback DB; local transient SQL only |
| TestVoicePhaseFullBudget | Unchanged Router15s + simulated provider8s → fallback → result201 | Real local time budget, not production latency benchmark |
| auto_smoke.Smoke | Catalog truth, prices/store/Haversine/speech, TOP1/TOP3, clarification, TTL/cleanup | Existing helper; production run требует отдельного approval/provider context |
| live integration profiles | Genuine Gemini, real Upstash, local API using live DB/provider configuration | Explicit opt-in; **SKIP**, не запускать как подготовительный smoke |

`TestLiveGeminiFullProductionContext` содержит прежние provider-perfect/benchmark
branches. Они **не launch gate** и не выбраны; acceptance application-level,
Gemini success или approved fallback допускаются при правильном публичном результате.
`TestFullLiveVoice` — не direct public edge smoke: он создаёт local httptest server,
используя live зависимости. Не смешивать его с проверкой deployed production API.
Его старые short privacy sentinels не используются как новая production privacy
сертификация; локальная parity проверяет реальные session IDs/high-entropy values.

## 3. Actual local evidence по всем девяти требованиям

| Requirement | Result | Actual evidence |
| --- | --- | --- |
| Cheapest → TOP1 | PASS | Service/degradation201 single1; selected category/price_asc/limit1; Go/Nest direct_cheapest |
| Search → TOP3 | PASS | Degradation201 list ровно3 synthetic rows with exact prices/stores; Go/Nest direct_search; реальный result может содержать0–3 по frozen contract |
| Clarification → session → continue | PASS | Existing direct/category-only/intent-only/missing-one parity; partial volume turn затем fat answer, same session/state, final result |
| TTL/merge/cleanup | PASS | Redis loopback SET EX600 typed GET/DEL/absence; session update TTL600; partial merge preserves known fields; завершённый continue затем404 in local parity |
| Gemini validation/fallback | PASS | Compact/targeted schemas, foreign/null/type/output rejection, classified failover/shared deadline tests; keyword fallback, one logical parse per utterance |
| Catalog truth | PASS | Existing Python comparator accepts exact synthetic truth; rejects wrong price/name/store/address/distance/speech; degradation exact1/3 price/store; local SQL/Nest parity |
| Nearest/Haversine | PASS | location suite, service distance/speech, Python distance calculation and local Go/Nest location parity; no external geocoder |
| Provider timeout / HTTP errors | PASS within tested scopes | Outage/provider failure/invalid-output fallback; controlled8s→201; expected400/404/429/503 and dependency errors remain covered |
| Privacy | PASS local | Exact text/coordinate/session/provider-error/token sentinels in actual candidate logs, safe class-only failures; Redis keys hashed; metrics privacy tests; loopback only |

No production TTL, Redis health, Voice201 или physical Siri PASS inferred from
этой таблицы. Frozen VoiceResult содержит name/price/store/address/distance/image,
не productId: truth comparison использует существующий Product DTO/reference,
не вводит новую публичную field. Offers equal-price secondary order не задан:
chosen store обязан принадлежать cheapest offers, но нельзя требовать другой
неопределённый tie order.

### Measured controlled timeout flow

Fresh `TestVoicePhaseFullBudget` verbose run: **HTTP201**.

| Fixed phase | duration_ms |
| --- | ---: |
| Vocabulary/category loading | 101.031 |
| Gemini preparation | 0.275 |
| Simulated provider deadline | 8000.208 |
| Deterministic fallback tail | 0.083 |
| Selected filter discovery | 701.376 |
| Product selection | 1004.219 |
| Nearest-store loading/tail | 0.003 /0.043 |
| Service total | **9807.398** |
| Remaining request budget | **5192.368** |

Filter discovery assertion=1, not nine sequential pre-NLP calls. Shared runtime
request15s/provider8s/model/failover/fallback unchanged. Results are local controlled
delay evidence, **не production SLA**. Existing tests также сохраняют documented
canceled/deadline dependency/error mapping; unexpected production500 остаётся STOP,
не повод менять status/timeout без diagnosis/review.

## 4. Local orchestration и failures, не скрытые за PASS

Использован existing `scripts/ci/postgres.mjs` через ephemeral inline Node callback,
не новый committed harness. Он sanitizes inherited env, owns exact PG container,
publishes loopback only и fail-closed guards local URLs. Все live opt-ins/providers
отсутствовали. Existing4 migration chain applied в пяти dedicated fresh DB каждого
owned container; seed/fixture SQL только локальный. No store scraping.

Первый callback:

- Frozen Nest install/generate/build PASS; local reference с restricted test role,
  no Gemini keys/Upstash; local Go candidate внутри httptest, no deployed image.
- `TestLocalVoiceParity -race` **PASS всех9 subscenarios**.
- `TestLocalVoiceVocabulary -race` PASS.
- Мой callback попытался **повторно** load INSERT-only fixture в тот же DB.
  Categories truncate не удаляет stores: duplicate stores primary key, psql exit3,
  outer Node exit1. Это orchestration mistake, не product/runtime defect и не
  permission ослаблять constraints/fixture/harness. Owned Nest и PG finally cleanup PASS.

Повторный fresh callback загрузил fixture **один раз**, vocabulary overlay один раз
и запустил два существующих tests вместе:
`TestLocalVoiceVocabulary|TestLocalVoiceVocabularySnapshotSwitch` с race — **PASS2/2**,
outer Node exit0. SnapshotSwitch подтверждает live validation/clarification и
product-repository revalidation независимо. Owned PG cleanup PASS; финальный
`docker ps --filter label=adilbaga.part12=ci` — пусто. Не чистились чужие ресурсы.

Две первоначальные команды также ошиблись cwd: Python discover из backend-go
не нашёл scripts/deploy (exit1); race invocation из repo root не нашёл go.mod
(exit1). Правильные standalone reruns Python5/5 и race6packages PASS. Source/tests
для скрытия startup ошибок не менялись. На первом combined command Go unit6packages
уже прошли, но overall exit1 из-за следующей Python command — это явно разделено.

## 5. План controlled production smoke — НЕ авторизация и НЕ выполнен

Reuse existing `Smoke.get/post/product/result/redis` и existing HTTP helper;
не запускать deployment broker/Host.rollout/Host.public или automatic workflow.
Не создавать ещё один smoke script. Полный `Smoke.run()` умеет более широкий
catalog/CORS/preflight smoke и direct Redis; не запускать его вслепую как minimal
Voice gate. Минимальный operator sequence ниже использует те же validation methods.

Перед start Owner должен отдельно разрешить production Voice POST, trusted
private provider-context handling и **owned Redis GET/TTL/DEL** для exact cleanup
proof. Только разрешение Voice POST не является разрешением direct Redis.
Если Redis metadata/cleanup access не разрешён, назвать это отсутствующим proof:
local TTL/API404 не превращать в actual production TTL PASS. В текущем этапе
никакие secrets/production Redis не читались; запрашивать только private file
path/env name, никогда value. Никаких GitHub/VPS setup/settings/deploy changes.

### Precheck: максимум7 GET

Проверить actual API release438/health/config evidence не stale, coordinated no
concurrent publish during comparison (не выключать timer самостоятельно):

1. `/health/live` и `/health/ready`:200 JSON ok/ready.
2. `/api/categories`:200, milk visible/current scope.
3. `/api/categories/milk/filters`:200; **1000 и3.2 доступны сейчас**.
4. `/api/products?category=milk&volumeMl=1000&fatPercent=3.2&sort=price_asc&limit=3`:
   200, nonempty current usable set. Для exactTOP3 gate нужны≥3 подходящих rows;
   если меньше — STOP fixture precondition, не выдумывать товары и не менять DB.
5. `/api/products/:id` первого discovered row:200, same catalog truth.
6. `/api/dashboard`:200, current locations. Approved synthetic coordinate выбрать
   из existing public location, не пользователя; numeric values не логировать.

В сумме7 GET, no retries/pagination loop. Capture catalog/snapshot truth в памяти,
не report/log. Если data changed или required options absent — STOP precondition,
не подбирать молча другой benchmark/fixture и не POST невалидную combination.

### Approved requests и statuses: максимум5 Voice POST

| Step | Request (synthetic, не реальные user данные) | Expected |
| --- | --- | --- |
| 1 | start: «Самое дешёвое молоко 1 литр 3.2 процента» + approved synthetic coordinates | **201 result/single**,1item, exact cheapest product/price/valid cheapest store/Haversine/speech |
| 2 | start: «Найди молоко 1 литр 3.2 процента» + same coordinates | **201 result/list**,3items given≥3 reference products; exact product order/truth/speech |
| 3 | start: «Самое дешёвое молоко» + same coordinates | **201 needs_clarification**, nonblank opaque session, expected required milk missing fields/question |
| 4 | continue: owned session + «1 литр 3.2 процента» | **201 result/single**, same current catalog truth; server session cleanup |
| 5 | continue: same completed owned session + harmless synthetic follow-up | **404**, frozen envelope; completion absence check, no retries |

Все запросы JSON, HTTPS directly, no redirects/cookies/browser impersonation.
Последовательно, POST admission не чаще одного в секунду; без parallel callers
в этом smoke. Это соблюдение existing Voice2/4 policy, не retry и не увеличение
production лимитов. При неожиданном429 остановиться, а не ждать/повторять запрос.
Gemini primary success **или approved deterministic fallback** допустимы, если
public result полностью корректен. Provider timeout сам по себе не FAIL при
correct201; end-to-end transport/request timeout — FAIL/STOP. No direct provider
benchmark, model/timeouts/keys/rate defaults unchanged.

### Request budget, privacy и cleanup

- Network cap: **7 GET +5 Voice POST +3 owned Redis reads +2 reserved cleanup
  commands = maximum17 requests**, no retries. Redis normal reads: GET state,
  TTL после step3 (0<TTL≤600), GET absence после step4. State содержимое не печатать.
- Existing HTTP helper uses18s socket/network timeout, response cap2MiB,
  redirect rejection, fixed safe errors. **Это не общий wall-clock deadline**.
  Operator execution должен enforce per-operation wall-clock≤18s и total≤360s,
  reserve≤36s для cleanup; application phase admission закрыть после324s.
  Deadline handling должен unwind finally, не kill process до cleanup.
  Это требование будущего reviewed invocation, не утверждение, что unmodified
  `Smoke.run()` уже имеет общий timer. Если invocation не гарантирует bounds/cleanup,
  STOP до production POST. Не менять runtime timeouts ради smoke.
- Immediately register **любой** returned needs_clarification session как owned
  в memory **до** semantic assertions, включая unexpected clarification в steps1/2.
  Existing helper owned-set/redis methods reuse; не логировать/persist session ID,
  hash/key/body. Максимум один owned live session; unexpected branch → stop+cleanup,
  не продолжать остальные сценарии. No KEYS/SCAN/FLUSH/external session operations.
- On failure с известным owned ID: reserve DEL точного hashed existing session key,
  затем GET absence. Failed DEL/GET/remaining state — **cleanup_failed, STOP**,
  не PASS. Normal completion uses built-in deletion + absence +404, не broad cleanup.
- При HTTP timeout/lost response session ID мог не быть получен: не выдумывать ID
  и не искать чужие keys; **cleanup_unverifiable, STOP**, record known TTL600 limit,
  Owner incident review. TTL expiry не выдаётся за verified immediate cleanup.
- Safe output только step/route template, HTTP status, duration_ms, mode/item count,
  catalog_match/nearest_match/speech_match/session_cleanup booleans, fixed error
  class; request_id/cf-ray при наличии допустимы. Не output speech/text/names,
  coordinates/session IDs/tokens/DSN/provider bodies/raw errors.
- STOP immediately на unexpected500/5xx/timeout/edgeHTML challenge/wrong price,
  wrong product/store/location/speech/order, invalid schema или cleanup error.
  Expected final404 не failure. Unexpected429 означает admission/edge limiter
  STOP, не permission поднять rates. Не автоматический rollback/deploy.

### Manual Siri — separate Owner gate

После public application smoke PASS Owner отдельно выполняет на реальном iPhone
Shortcut/Siri: complete TOP1, search TOP3, уточнение→continue, correct spoken
price/store/address и notification; no fixture/screenshot/timing inventions.
Owner reported outcome/date/runtime SHA записать с attribution. Local tests не
доказывают physical Siri, audio UX/permissions или notification. Не считать старый
ownerPASS438 новым прохождением; historical HTTP500 не current failure автоматически.

## 6. Actual commands/results

Go1.27.2 GOTOOLCHAIN=local, Node24.10.0, pnpm10.32.1. `env -i`/existing CI env
allowlist исключили inherited live/provider/libpq/backup config; no private env
source. Correct cwd Go=backend-go, Python/root scripts=repository root.

| Command/profile | Exit | Actual result |
| --- | ---: | --- |
| git fetch/branch/HEAD/origin/status | 0 | Exact base, preserve3 reports |
| go test -count=1 ./internal/voice ./internal/gemini ./internal/redis ./internal/location ./internal/httpapi ./internal/middleware | 0 for Go | **6packages PASS**, httpapi10.476s; first combined Python command then failed cwd |
| go test -race -count=1 same6packages (correct cwd) | 0 | **6packages PASS**, httpapi11.586s |
| python3 -B -m unittest discover -s scripts/deploy -p auto_smoke_test.py (correct cwd) | 0 | **5/5 PASS**, injected/mock request only |
| Initial incorrect Python/race cwd attempts | 1 /1 | Startup/orchestration errors, corrected without source changes |
| go vet same6packages | 0 | PASS |
| go tool staticcheck same6packages | 0 | Pinned tool PASS |
| go test -count=1 ./internal/httpapi -run '^TestVoicePhaseFullBudget$' -v | 0 | HTTP201; measured9807.398ms and5192.368ms remaining; no live NLP |
| go test -count=1 -tags=integration ./tests/integration -run selected privacy/live profiles -v | 0 | **2privacy PASS /5 explicit live SKIP** |
| TestLocalVoiceParity -race, using existing PG helper/Nest + CI voice overlay | 0 for test | **9/9 scenarios PASS**; real local repositories, no real providers |
| First combined PG callback | 1 | Parity/vocabulary PASS, repeat INSERT fixture setup psql3; finally cleaned owned resources |
| Fresh PG callback: TestLocalVoiceVocabulary + TestLocalVoiceVocabularySnapshotSwitch -race | 0 | **2/2 PASS**, guarded local snapshot safety; owned cleanup PASS |
| Nest frozen install/db:generate/build in existing local helper | 0 | PASS, local restricted reference; production backend.env not sourced |
| contracts: node --test tests/contract.test.mjs with clean env | 0 | **12PASS /10HTTP-profile SKIP /0FAIL**; offline frozen examples/invariants |
| docker context show /final owned-container inventory | 0 /0 | default local context; helper-labeled PG containers none remaining |
| Final scope/links/accepted report byte-match/bounded scan/git diff --check | 0 | PASS, report-only delta |

Explicit skipped profiles: TestLiveGeminiStructuredParse, TestLiveGeminiFullProductionContext,
TestLiveUpstashSession, TestFullLiveVoice, TestLiveVoiceParity. Не представлены как
PASS и не opt-in через найденные credentials. Frozen HTTP fixture/live contract
profiles не запускались; Go/Nest Voice HTTP parity и unit DTO/errors пройдены,
но offline12 не названо live contract PASS.

## 7. Scope/safety и итог

Создан только этот report. Stage A/B1/B2 hashes unchanged; tracked Go/source/tests,
frontend, API contracts, Prisma, CI/CD, Backend2 files не изменились. Markdown links,
LF/whitespace, bounded DSN/private-key/credential assignment/private-config-path
scan PASS. No secrets, precise user coordinates, session IDs или raw provider
payloads в report. No commit/push/PR/merge/image build/production deployment.

**READY_FOR_EXTERNAL_REVIEW для local Voice preparation и controlled-smoke plan.**
Production execution требует отдельного Owner approval и reviewed bounded
operator invocation/owned Redis cleanup scope; оно здесь NOT RUN. Part18 launch
BLOCKED; Stage B2 governance/operations/legal/Part16 gates не исчезают из-за local
Voice PASS. STOP для review.
