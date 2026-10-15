# Aktau Market — Part18 Stage C: HMAC Acceptance Preparation

Status: **BLOCKED**.

**PRODUCTION_POST_NOT_RUN.** Local source/protocol/cache validation PASS.
Read-only preflight observation: **PUBLIC_GET405_NO_STORE_MISMATCH** — response
Cache-Control не содержит требуемый в ТЗ no-store. Это header-requirement gap,
не доказанный HMAC/authentication defect. Source/production не исправлялись;
нужен external review этого наблюдения до C1 authorization.

## 1. Immutable provenance / isolation

ТЗ прочитано полностью из существующего owner TODO в исходном repository;
в Part18 checkout ignored TODO отсутствует. Fetch origin --prune exit0:
fresh **origin/main=c8e7bb74e2e5cb31d1d1e460ed57c6456d0d8f5f**.
Issued baseline92863b1… уже включает PR24; новый main дополнительно содержит
merged PR28 с пятью accepted Part18 reports. Их наличие в origin/main и ancestor
previous Part18 HEAD0bffef4… проверены до branch switch; initial tree clean.
Не создавался новый worktree поверх незавершённого PR.

В существующем native-WSL worktree создана разрешённая новая ветка
**feat/part-18-hmac-acceptance** от fresh origin/main. HEAD совпадает с base above.
Предыдущая ветка/другие worktree не менялись. Все пять reports byte-identical
до/после. Root AGENTS отсутствует в committed main: применены owner project rules
и прочитанный AGENTS исходного repository; frontend/AGENTS.md также прочитан.

Изучены [roadmap Part18](../../PRODUCTION_ROADMAP_AKTAU_MARKET.md),
[Part16 report](PART_16_REPORT.md), [revalidation contract](../FRONTEND_REVALIDATION.md),
пять accepted [A](PART_18_STAGE_A_REPORT.md)/[B1](PART_18_STAGE_B1_REPORT.md)/
[B2](PART_18_STAGE_B2_REPORT.md)/[Voice prep](PART_18_STAGE_C_VOICE_PREP_REPORT.md)/
[Voice production](PART_18_STAGE_C_VOICE_PRODUCTION_REPORT.md) reports,
frontend handler/helper/tests/proxy, Go notifier/cmd ingest, verifier/cache-smoke.
Next-best-practices (route handlers/data patterns) и shipped Next16.3.8 docs
использованы для проверки API/cache boundaries; никакая новая strategy не внедрялась.

Source/runtime/tests/contracts/dependencies/settings не изменены. Не было production
POST, HMAC event, Voice/Redis calls, SSH/SQL, ingest/publish, timer/deployment,
secret reads или Backend2 operations. Go auto-deploy FROZEN/WAITING_FOR_OWNER.
Local tests использовали очищенное окружение, synthetic secrets и loopback only.

## 2. Фактический source protocol

| Assertion | Source/local result |
| --- | --- |
| Fixed POST /internal/revalidate | PASS; Node runtime, отсутствует GET handler; locale proxy narrowly bypasses exact path |
| Raw event bytes/HMAC | PASS; fixed UTF-8 snapshot_published body; timestamp + period + raw bytes; existing SHA256 signer; shared synthetic Go/TS golden vector |
| Auth shape/window | PASS; v1 lowercase hex format, Unix seconds, boundaries ±300s accepted, outside rejected; timingSafeEqual |
| Body bound | PASS;128bytes stream counted, oversized/cancel/read failure auth rejected |
| Secret missing/short | PASS;503, no invalidation; source checks byte length≥32, entropy/custody отдельно Owner responsibility |
| Missing/bad/tampered auth | PASS;401, no tag/path invalidation; response empty |
| Authenticated non-fixed event/query | PASS;400, no caller-selected tag/path |
| Correctly signed event | PASS locally;204 empty response; fixed catalog-data expire0 and fixed product ISR pattern |
| POST response Cache-Control | Source reject() always no-store; statuses tested. Public POST headers NOT CHECKED |
| Generated GET405 | No exported GET, local cache smoke405; public405 observed. Public no-store **not confirmed** |
| Go config | Production HTTPS/fixed endpoint path/no userinfo/query/fragment; min secret length; tests reject invalid settings |
| Go notification | Fixed body/headers, bounded5s, redirects rejected, one attempt; no raw error/secret disclosure |
| Commit ordering | PublishThenNotify only after successful Publish; no HTTP inside ingestion transaction/package; fresh bounded notification context |
| Dry-run/failure | Dry-run and failed publish never notify. Notify failure=degraded, already-published data remains committed; no automatic rollback/failed snapshot/re-publish |
| Cache fallback | Existing3600s fetch/ISR TTL retained; accepted convergence≤5s after successful204, first-response STALE permitted |

Frontend cache calls: catalog-data immediate expiry плюс fixed RU/KK product
route-group pattern. Sitemap runtime/tagged API reads; no public dynamic tags,
custompaths, general cache purge или changed API v1.
Shipped framework docs допускают webhook Route Handler, expire0 и route-pattern
page invalidation; это source semantics, не runtime production SLA.

У Next unsupported method405 generated framework response: это не вызов POST
reject() и не доказательство совпадения его headers. Не добавлялся новый GET action
или header override, чтобы скрыть preflight mismatch.

## 3. Actual local verification

Node24.10.0/pnpm10.32.1, Go1.27.2/GOTOOLCHAIN=local; native WSL. env -i + explicit
loopback HTTP/site settings, no inherited production/provider/libpq/backup/HMAC
credentials. Metadata-only guard подтвердил отсутствие real frontend dotenv files
до tests/build; никакие их contents не читались. Frozen install lockfile unchanged.

| Command / check | Exit | Result |
| --- | ---: | --- |
| pnpm install --frozen-lockfile (frontend) | 0 | Pinned graph from existing lock; no upgrade/packageManager change |
| pnpm test src/app/internal/revalidate/route.test.ts src/proxy.test.ts --pool=forks --maxWorkers=1 --no-isolate | 0 | **25/25 PASS**, handler17 +proxy8 |
| go test -count=1 -v ./internal/revalidation | 0 | **5 top-level PASS**; notification6 HTTP cases, publication4 cases |
| go test -race -count=1 ./internal/revalidation | 0 | PASS |
| go vet ./internal/revalidation | 0 | PASS |
| node --test scripts/revalidation/verify-part16.test.mjs | 0 | **4/4 PASS**, rejects unsafe timing/tag/post-commit conflation |
| node scripts/revalidation/verify-part16.mjs | 0 | Static boundaries PASS; not production acceptance |
| pnpm build with explicit local HTTP env | 0 | Real Next16.3.8 production build PASS; TypeScript PASS; no production API fetching |
| node scripts/revalidation/cache-smoke.mjs, clean env | 0 | Real loopback Next + synthetic mutable API, GET405/auth401/signed204 and6 paths within shared5000ms |
| Git metadata/merge/report presence/branch creation | 0 | Expected reviewed reports merged; new branch from fresh main |
| Final diff/scope/links/bounded scan/previous-report byte-match | 0 | PASS; only this new report |

One initial frozen-install command was mistakenly run from repo root and returned
ERR_PNPM_NO_PKG_MANIFEST exit1; corrected frontend cwd rerun PASS. Some initial
source discovery used non-existing revalidation.test.ts/vitest.config.ts names;
actual tests/config found as route.test.ts/proxy.test.ts/vitest.config.mts.
A combined read from backend-go cwd returned exit2 for root-relative ops paths;
correct root reads and standalone vet exited0. These are command/discovery mistakes,
не dependency/runtime failures; source/fixtures/assertions не подгонялись.

### Cache smoke observations — LOCAL, not Vercel

All six warm preconditions stale; product warm HIT. Fresh namespace/IDs исключили
previous-run contamination. One shared deadline отсчитывается после accepted204,
не новый budget на каждую page. No unconditional wait masks failure.

| Path class | First-response cache | First fresh | Eventual freshness | elapsed_ms | Stale count | Detail API fetch count at observation |
| --- | --- | --- | --- | ---: | ---: | ---: |
| RU product | MISS | true | PASS | 241 | 0 | 16 |
| KK product | MISS | true | PASS | 243 | 0 | 16 |
| Sitemap | not reported | true | PASS | 51 | 0 | 9 |
| Catalog | not reported | true | PASS | 235 | 0 | 16 |
| Dashboard | not reported | true | PASS | 229 | 0 | 16 |
| Category | not reported | true | PASS | 240 | 0 | 16 |

Warm detail count8; counts shared across concurrent LOCAL probes, не индивидуальная
стоимость каждой страницы. This run first responses fresh; historical STALE
evidence сохранено и не переписано как guaranteed first-response freshness.
Owned Next process и mutable API закрыты existing harness finally; no persistent
local server left intentionally. Generated Next build output ignored, не source.

## 4. Read-only production preflight

Only bounded sequential public GET/HEAD и public GitHub metadata; truthful
AktauMarket-HMAC-Preparation/1.0, TLS verification on, redirects manual,
15s each, no retries/cookies/auth/production POST.

| Probe | Result |
| --- | --- |
| GET https://aktau.market/internal/revalidate | **405**,1023ms, empty body, no redirect |
| GET405 Cache-Control | **public, max-age=0, must-revalidate**, **no-store absent** |
| HEAD /ru/catalog | **200**,611ms, no redirect; private/no-cache/no-store/max-age0/must-revalidate |
| Frontend HSTS | max-age63072000 observed; attribution остаётся pending, nothing changed |
| Exact main GitHub Vercel status | **success** for c8e7bb74… |
| Latest GitHub Production deployment | **7066363941**, SHA=c8e7bb74…, environment Production, latest status success |
| aktau.market alias → exact deployment | **PENDING_EVIDENCE**, no authorized Vercel Dashboard access |
| Vercel Production HMAC env name/scope | **PENDING_EVIDENCE**, not inspected via secret values |

Production metadata updates older Stage A/B evidence without overwriting it.
Success context/deployment record поддерживают source/deployment correspondence,
но не independently prove current domain alias or applied env scope.
GET405 proves method rejection, **не** valid server secret/HMAC verification.
Missing no-store here не доказывает unauthorized invalidation, cached sensitive
data или failed POST behavior: POST was not executed. Но literal requested
GET405/no-store preflight не пройден, поэтому статус BLOCKED.

### Owner/Backend2 prerequisites

- Owner read-only Vercel: current domain deployment SHA/Ready, branch main/root
  frontend/Next, REVALIDATE_HMAC_SECRET name with Production scope applied to
  deployment. Не Reveal/Copy secret; не создавать/ротировать ранее provisioned value.
- ТЗ сообщает, что Backend2 HMAC setting раньше было пустым. **Это external
  handoff, не проверенное в B2 private-file observation.** Не считать shared-secret
  parity PASS. Owner+Backend2 отдельно подтверждают secure provisioning/equality
  внутри trusted context, не публикуя значение/хеш/signature/headers/private paths.
- Source/example FRONTEND_REVALIDATE_URL matches approved fixed HTTPS endpoint;
  **effective Backend2 process setting PENDING**, не прочитан. Source existence
  notifier ≠ installed ingest binary/config parity. Pipeline/systemd и
  /opt/aktau-sync принадлежат Backend2; не проверялись/не менялись здесь.
- No ingestion/publish/notification initiated by this task. Отсутствие чужих
  параллельных notifications не сертифицировано source inspection: перед будущим
  C1 требуется Owner+Backend2 coordination window, без самовольной остановки timer.

## 5. Blocker disposition — без speculative remediation

**PUBLIC_GET405_NO_STORE_MISMATCH:** literal preflight header missing.
Нужно external review/Owner решение, распространяется ли requirement no-store
на automatic unsupported-method405. Если да — отдельно reviewed narrow source/
deployment scope, не немедленный runtime/Next/cache/settings rewrite. Если
requirement относился только к POST outcomes — это должно быть явно уточнено,
а observation405 headers сохранено. No claim of a proven HMAC security bypass.

Secret scope/equality и actual alias остаются PENDING_EVIDENCE. Это отсутствие
proof, не доказательство того, что secret отсутствует или различается сегодня.
Production C1 не запускается до review и отдельного Owner approval.

## 6. C1 — минимальный будущий acceptance plan (NOT RUN)

Независимая authorization на **максимум2 production POST**, sequential, no retries,
no loops/parallelism. Optional third tamper probe **не входит** в default budget;
только отдельное явное разрешение/необходимость до run.

1. До сети: exact deployed frontend/settings/secret custody confirmation, fixed
   target allowlist, main/source drift, clock sync/skew, no parallel notifications,
   coordination с Backend2. Header blocker решён review, не скрыт.
2. Temporary operator invocation outside Git, zero persisted secret/header data.
   Reuse existing Go revalidation.Body/Signature и bounded client policy; не
   запускать cmd/ingest/--apply ради notification. Existing tests already prove
   signer/golden protocol; exact будущий invocation дополнительно dry-run на
   loopback mock до любой production request.
3. Mock cases:401/204,503 missing server secret, unexpected200/3xx/5xx/HTML,
   timeout/body bound, no redirect/retry, max2 cap и no secret output. Acceptance
   обязана требовать **204 exactly**: Go Notify accepts any2xx как operational
   success, что не заменяет stricter C1 status/header/body assertion.
4. Operation budget≤5s wall-clock, no redirect, bounded response≤1024bytes;
   общего budget≤15s достаточно для двух5s операций и local checks. Guard выводит
   только fixed step/status/duration/outcome_class. Raw timestamp/signature/body,
   request headers/secret/URLs с credentials не логировать. Future invocation
   должен enforce whole deadline, а не просто надеяться на socket timeout.
5. **POST1** fixed event, без authentication: expected **401 empty/no-store**.
   **503** = server-secret precondition BLOCKED, не HMAC PASS; любой другой status/
   redirect/challenge/timeout → STOP, не POST2 и не retries.
6. **POST2** correct existing shared secret, fixed event/raw bytes, current stamp/
   signature: expected **204 empty/no-store**. Correct204 реально invalidates
   production cache; это отдельная authorized state mutation без DB publish.
   Unexpected status/headers/body/timeout/challenge → STOP, sanitized evidence,
   no apply/re-publish/secret rotation/hotfix.
7. Optional **POST3 invalid-signature** expected401 only if pre-authorized after
   explicit need; тогда cap3/time budget согласовать до run. Не выполнять
   authenticated wrong event/query probes в production без отдельного scope.

C1 подтверждает auth/delivery/invalidation pathway. **204 не доказательство
нового snapshot или N→N+1 freshness**, не launch/Part16 DONE автоматически.
Actual production operator/secrets injection здесь не создана и не запускалась;
only plan/existing synthetic tests, not approval to read private configuration.

## 7. C2 — отдельно после legitimate publish

Только следующий **самостоятельно approved легитимный** Backend2 publish; не
инициировать snapshot/data changes специально ради этого report.
Owner+Backend2 pre-coordinate stable frontend revision/shared secret/effective
fixed URL. Capture old/new published identity операторским approved способом,
post-COMMIT frontend_revalidation outcome и accepted204 timestamp without headers/
body. Clock synchronization/observation boundary должны быть достаточно точными.

После успешного204 одним shared monotonic≤5s budget проверять **new server requests**:
RU product, KK product, sitemap lastmod/current scope, catalog, dashboard, category.
Заранее выбрать реальные changed products/snapshot signals; не требовать новое
время capturedAt у всех строк, если legitimate publish сохраняет прошлый source.
Записать first-response cache status/freshness, actual elapsed until fresh, stale
response counts и API detail count только если доступен безопасный collector.
Непроверяемый counter пометить PENDING, не придумывать его из browser waterfall.

First-response STALE allowed только внутри5s; no unconditional delay/infinite
poll/retry beyonddeadline. Published snapshot неизменён/нет controlled changed
signals или notification degraded — **C2 PENDING**, не fresh PASS из unchangedHTML.
Не rerun --apply для доставки webhook, не скрывать failed convergence3600TTL.
Ingest transaction/selection/source files не затрагиваются этим acceptance scope.

## 8. Safety / scope

Создан только `docs/production/reports/PART_18_STAGE_C_HMAC_PREP_REPORT.md`.
Все пять ранее merged Part18 reports unchanged SHA256; tracked diff пустой.
Markdown links/whitespace/git diff --check/bounded DSN/private-key/credential
assignment/private-config-path scan PASS. Report не содержит actual signing
headers/secret values/private operator paths. No commit/push/PR/merge.

**PRODUCTION_POST_NOT_RUN. BLOCKED** до review GET405 header mismatch;
Owner+Backend2 scope/equality/coordination и C1 authorization отдельно pending.
Local25/Go/race/verifier4/cache6 PASS не превращаются в production HMAC PASS.
STOP для Code Review; никакого самостоятельного C1/C2/ingest/deployment.
