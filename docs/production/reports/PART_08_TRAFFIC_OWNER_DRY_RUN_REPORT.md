# Production Part 08D — Traffic owner deploy / ingestion runtime / dry-run

Status: **BLOCKED**

Current blocker: `SNAPSHOT_AWARE_NEST_DEPLOY_FAILED` — Railway local-source upload HTTP 500, failed deployment / traffic-owner outage.

Latest owner-authorized credential remediation **PASS**: обе Railway DB variables переведены с `postgres` на существующий restricted `aktau_api_runtime` через stdin/`--skip-deploys`; SQL SELECT6/private3 denial verified. Затем fresh PRE прошёл, но controlled local-source upload получил HTTP 500. Platform POST: новый deployment FAILED, прежний REMOVED, active deployments 0; public GET endpoints 404. DB/security/history/full-row fingerprints неизменны. Writer LOGIN/dry-run **NOT RUN**. Нужен owner/platform recovery review; обычный rollback, восстанавливающий старые owner variables, не выполнен.

Обе предыдущие BLOCKED истории ниже сохранены как historical evidence, а не current status.

## Initial run history — preserved

Остановка на discovery boundary, до production DB access/deployment/login provisioning. Существующий production backend service не удалось однозначно идентифицировать из доступного authenticated platform context/configuration. Новая инфраструктура не создавалась; target не угадывался.

## Immutable preflight — PASS

- Branch: `integrate/full-stack`.
- `rtk git fetch origin --prune`: exit 0.
- Initial working tree clean.
- HEAD = origin: `eb3fe34475d153803e0a81e550d3fce34ba0af01`.
- Parent: `0b95cdc93fc5278fc86a8d305921f7130e8a6371`.
- Commit: `docs(prod): record snapshot migration rollout`.
- Parent→HEAD delta содержит только `docs/production/reports/PART_08_PRODUCTION_MIGRATION_REPORT.md`; application source не изменён.
- Initial `rtk git diff --check`: PASS.

## Deployment target discovery — BLOCKED

Документация README указывает Railway как backend platform, но это не service binding и не доказательство текущего deployment.

Фактические safe checks:

- `railway`, `railway.exe`, `railway.cmd` не найдены в текущем PATH. Vercel/flyctl CLI также не найдены; переход на другую платформу не выполнялся.
- Existing Railway config/binding directories не обнаружены в проверенных стандартных WSL home locations, repository root и `backend/`.
- Railway token/project/service/environment/public-domain configuration отсутствует в текущем process environment; соответствующие имена также не configured в локальных backend/frontend env. Значения env не выводились.
- Repository file discovery не нашёл Railway deployment manifest/binding или NestJS deployment Dockerfile/Procfile/Nixpacks configuration. Найденный `backend-go/Dockerfile` не является разрешённым traffic-owner target.
- Поиск Railway references в README/docs/frontend нашёл только декларацию platform в README, без project/service/environment identifier или `*.up.railway.app` origin.
- Единственный локально configured frontend API URL классифицирован как loopback; он не подтверждает production backend origin. README public frontend URL также не является backend service/revision provenance.
- Доступные connected tools не предоставляют Railway management context. Нерелевантные Sites hosting tools не использовались как замена существующему deployment.

Current deployed revision, deployment ID/timestamp, build/start commands, production API origin и effective deployed DATABASE_URL role **не установлены**. Local immutable HEAD не выдаётся за deployed revision. Отсутствие локального CLI/config не означает, что Railway service не существует; оно означает, что безопасный target и доступ к нему в этой сессии не подтверждены.

По Part08D §§4–6/40 сработал STOP `PRODUCTION_TRAFFIC_OWNER_TARGET_UNRESOLVED`. Ни новый project/service, ни новый account/project link, ни guessed target не создавались. Production credentials не менялись.

## Mandatory downstream gates — NOT RUN after STOP

| Gate | Actual status |
| --- | --- |
| Fresh production PRE HTTP capture / safe hashes | NOT RUN — actual backend origin unresolved |
| Fresh production PRE DB/security/Prisma/count/fingerprint audit | NOT RUN |
| Existing traffic-owner restricted credential verification | NOT RUN — service env inaccessible |
| Existing build/start safety verification | NOT RUN |
| Exact immutable NestJS deploy / live revision proof / health | NOT RUN |
| Full deployed GET regression: 849×3 sorts, filters/detail/search/dashboard/errors | NOT RUN |
| Deployed direct Voice smoke | NOT RUN |
| Post-deploy zero-DB-mutation audit | NOT RUN |
| Writer durable storage precondition / password generation | NOT RUN |
| `aktau_ingest_runtime` creation / membership / security / connection proof | NOT RUN — no LOGIN/password created |
| Production `cmd/ingest` dry-run | NOT RUN — no CLI execution |
| raw863 / DINA564 / DANA279 / FIX_PRICE20 / canonical849 / reused849 / new0 / matched14 / applied=false | NOT VERIFIED in Part08D |
| Dry-run PRE/POST fingerprints / Snapshot1 / SourceRun3 / no N+1 / advisory lock release | NOT RUN |
| Final deployed API / production POST audit | NOT RUN |

Accepted Part08R counts/security/backfill/parity remain historical evidence in the committed migration report; they are **not** substituted for fresh Part08D audits. No fresh production PASS or role-absence claim is made here.

## Safety / remaining blocker

В этом запуске production PostgreSQL connections/queries/writes, provider calls, deployment actions и ingestion не выполнялись. Нет migration/seed/parser/scraper, role/grant change, writer secret generation, `--apply`, N+1, Go/frontend deploy, DNS/cutover, source hot-fix, commit/push или следующего Part. `.env` и существующие secret stores не изменены.

Для продолжения владелец должен предоставить подтверждённые existing Railway project/service/environment и backend public origin, а также existing authenticated management context в локальной среде. Tokens/passwords/DSNs не следует публиковать в chat/report/repository. Затем необходимо заново проверить immutable baseline и выполнить все fresh PRE gates до первого production action; отдельно подтвердить restricted API credential и отсутствие unsafe build/start writes.

Единственное repository change этого запуска — этот новый report. Предыдущие Part08/08R reports и reviewed application source сохранены.

## Review archive

Permanent target: `production-part-08`.
Path: `artifacts/production-part-08-review.tar.gz`.
Archive rebuild/exclusions/secret scan/source+report byte-match: **PASS**, 354 files. Проверены все source bytes и присутствие нового report вместе с неизменными Part08/08R reports; отсутствуют real env, actual known credentials/key patterns, DB dumps/backups, private CLI config, node_modules/build/test outputs, generated ignored files и Go binaries. Final report update включён в повторную сборку/проверку того же permanent target.

Archive является BLOCKED handoff, не доказательством deployment/dry-run PASS и не разрешением публиковать N+1. Остановлено для external review.

## Previous Railway-context continuation — fresh preflight / credential STOP history

- `rtk git fetch origin --prune`: PASS; branch `integrate/full-stack`.
- HEAD = origin = `eb3fe34475d153803e0a81e550d3fce34ba0af01`; parent `0b95cdc93fc5278fc86a8d305921f7130e8a6371`.
- Tracked working tree unchanged. Единственный intentional untracked файл — этот существующий report первоначального BLOCKED run; continuation явно разрешён владельцем. Reset/restore/rebase не выполнялись.
- CLI найден в existing WSL installation вне текущего PATH: Railway **5.63.1**. Authenticated `railway status --json` и service-scoped `railway variable list --service AdilBaga --environment production --json` выполнены. Secret-bearing variable output обрабатывался только privately, в tool/report выводилась исключительно безопасная projection.

### Confirmed existing target / current deployment

| Metadata | Verified value |
| --- | --- |
| Project | `scintillating-amazement` |
| Project ID | `c4da7d9d-7c04-4efe-a05c-90fd66c366fd` |
| Environment | `production` |
| Environment ID | `bf8f5ba2-7a9a-450a-9dce-ea265509e216` |
| Service | `AdilBaga` |
| Service ID | `09453e67-e7aa-4f1d-8794-7329b9179743` |
| Public origin | `https://adilbaga-production.up.railway.app` |
| Domain target port | `8080` |
| Current deployment | `2d0ca456-d9d2-44ce-9378-a13b1bada1f9`, `SUCCESS`, instance `RUNNING` |
| Deployment timestamp | `2026-10-01T09:19:51.348Z` |
| Deployed commit | `37fdf7cfcbc13a02ea43aa97c7a727b96189c4e2` |
| GitHub binding | `kiratonine/AdilBaga`, branch `main` |
| Root | `/backend` |
| Build | `pnpm db:generate && pnpm build` |
| Start | `pnpm start:prod` |
| Pre-deploy command | absent |

Initial `PRODUCTION_TRAFFIC_OWNER_TARGET_UNRESOLVED` **resolved** by owner-configured existing authenticated context and fresh metadata verification. Новая инфраструктура/домены не создавались, source branch не менялась, redeploy/up не запускались. Current deployed revision не выдаётся за immutable local HEAD.

### Mandatory environment STOP

Service-scoped configuration inspection, without exposing URL/password:

- `DATABASE_URL` username role: **`postgres`**, not approved restricted `aktau_api_runtime`.
- `INGEST_DATABASE_URL`: absent.
- Existing Gemini key and Upstash URL/token: configured; values unchanged. Provider health NOT RUN.
- Explicit `DATA_SOURCE=postgres` not confirmed; explicit `PORT` variable not confirmed. Эти configured-or-not наблюдения не доказывают fixture runtime или неисправный port: downstream checks не выполнялись.
- Declared build/start/pre-deploy commands не содержат migration/seed/parser/pipeline; deployment safety нельзя объявить полностью PASS при failed DB credential gate.

§11 требует STOP при owner/migration credential и запрещает silently менять service secret. В результате active-role DB connection test и fresh HTTP/DB fingerprints **NOT RUN**: configured credential уже не соответствует требованию, и последующие действия остановлены. Не утверждается, что runtime identity/read-only privileges проверены SQL-запросом. PRE counts/security/Prisma/fingerprints из Part08R не подменяют новые Part08D gates.

### Remaining gates / safety

Fresh PRE DB/security/count/fingerprint audit и PRE HTTP hashes, local-source deployment, full 849×3 GET regression/filter/detail/search/dashboard, direct Voice, post-deploy audit, writer credential generation/persistence, LOGIN/membership creation, production dry-run и POST/advisory-lock proof: **NOT RUN after STOP**. Runtime LOGIN не создавался, пароль writer не генерировался.

Production DB connections/queries/writes в continuation не выполнялись. Нет DB/schema/migration/role/ACL/password changes, seed/parser, N+1, `--apply`, Go deploy/cutover, frontend/OpenAPI/source changes, commit или push. Existing secrets/`.env` не изменены.

Owner action required: separately reviewed secure update of existing Railway API service DB credential to restricted `aktau_api_runtime`; не публиковать DSN/password в chat. После этого нужны повторные fresh immutable/config/DB/HTTP PRE gates, включая фактическую SQL identity/read-only privilege verification, до `railway up --service AdilBaga`. Такое secret update не входит в этот запуск.

### Rebuilt review archive

`artifacts/production-part-08-review.tar.gz`, permanent target `production-part-08`.
Rebuild + all source/report byte-match + exclusion/actual known credential scans: PASS. Проверка включает newly accessible Railway service secrets/auth-token material только privately; real env/credentials/DB backups/private CLI config/node_modules/build/test artifacts/Go binaries в archive отсутствуют. Архив — **BLOCKED review artifact**, не rollout approval. Остановлено для external review.

## Owner-authorized credential remediation and rollout attempt

### Immutable preflight — PASS

Fresh fetch/prune exit 0. Branch `integrate/full-stack`; HEAD = origin = `eb3fe34475d153803e0a81e550d3fce34ba0af01`, parent `0b95cdc93fc5278fc86a8d305921f7130e8a6371`. Tracked tree unchanged, только уже известный untracked report. Никакого reset/restore/rebase/source hot-fix.

Existing authenticated project/environment/service/domain и deployment metadata повторно проверены. Target тот же: `scintillating-amazement` / `production` / `AdilBaga`. PRE active deployment `2d0ca456-d9d2-44ce-9378-a13b1bada1f9`, SUCCESS/RUNNING; deployed commit `37fdf7cfcbc13a02ea43aa97c7a727b96189c4e2`, repo `kiratonine/AdilBaga`, GitHub branch `main`, root `/backend`. Build `pnpm db:generate && pnpm build`, start `pnpm start:prod`, pre-deploy absent. Reviewed package scripts generate client / compile TypeScript / run Node; migration/seed/parser commands не вызываются.

### DATABASE_URL and DIRECT_URL — remediation PASS

- BEFORE: обе service-scoped variables содержали username role **postgres**.
- Existing restricted credential взят из private production secret store, не сгенерирован/rotated и не выводился. Из него сформирован уже проверенный session-mode connection того же LOGIN; обе переменные используют этот connection. Отдельный owner/direct connection в service не сохранён.
- Выполнены ровно два update class: `railway variable set DATABASE_URL --stdin --skip-deploys --service AdilBaga --environment production` и аналогично `DIRECT_URL`. DSN/password отсутствовали в command arguments/output/report/repository.
- AFTER: обе variables exact-match private restricted connection, role **aktau_api_runtime**. Остальные service variables unchanged; ingestion credential absent. Existing Gemini/Upstash config сохранена. DATA_SOURCE не equals fixture; reviewed runtime по умолчанию Prisma/PostgreSQL, fixtures только при explicit `fixture`.
- Фактический SQL connection: `current_user=aktau_api_runtime`, explicit transaction read-only on, reader USAGE=true / SET=false; schema CREATE=false и write privileges=false для 9 app tables.
- SELECT6 counts: stores3 / locations15 / categories6 / canonical849 / offers863 / snapshots1. Actual SELECT raw_products/product_mappings/source_runs каждый denied **42501**. Production DML/DDL denial probes не выполнялись.
- Immediately after variables updates: latest/active deployment IDs/status/branch совпали с BEFORE, automatic deployment **не возник**. Source connect/disconnect/branch update/redeploy не выполнялись.

Previous `TRAFFIC_OWNER_DATABASE_CREDENTIAL_NOT_RESTRICTED` resolved **для configured service variables и проверенного SQL connection**. Это не доказательство, что прежний уже запущенный process перечитал env; immutable application rollout проверяется отдельно.

### Fresh READ-ONLY DB/security/Prisma/count/fingerprint PRE — PASS

Operator audit использовал explicit `SET default_transaction_read_only=on`, `SET statement_timeout=5000`, `BEGIN READ ONLY`, settings on/on/5s. Security catalog exact-match accepted Part08R POST, reader flags/membership/ACL and writer NOLOGIN/17 grants/policies/creator anchor unchanged; ingest runtime absent. RLS9/FORCE0/policies23 = reader6 + writer17. Prisma catalog: ровно 3 successful migrations, reviewed checksums, steps0/1/1, no failed/rolled-back/extra rows. Prisma deploy/resolve/status CLI не запускались; проверена actual history read-only SQL.

| Table | PRE | POST after failed upload |
| --- | ---: | ---: |
| stores | 3 | 3 |
| store_locations | 15 | 15 |
| categories | 6 | 6 |
| raw_products | 863 | 863 |
| canonical_products | 849 | 849 |
| product_mappings | 863 | 863 |
| offers | 863 | 863 |
| snapshots | 1 | 1 |
| source_runs | 3 | 3 |
| _prisma_migrations | 3 | 3 |

Snapshot только `baseline-internal-v1`, published; no N+1. Full rows всех 10 перечисленных tables fingerprinted with deterministic ID ordering and normalized float representation, включая snapshotId и полную Prisma history. Security/managed ACL/roles/schema metadata сохранены privately.

### Fresh PRE HTTP — PASS

| Actual public GET | Status | SHA-256 |
| --- | ---: | --- |
| `/api/categories` | 200, count6 | `8d3d1b0ff0dff325f25cf8e0c3241ac0218765a8876bea6562c6414700166d43` |
| `/api/products?limit=100` | 200, count100 | `977bd139e0991e0873cb02aedd8ac8f3111b9984e6706ffa50ae257f1ec38a07` |
| `/api/dashboard` | 200 | `d4203dab8ee10e6e9d2ad58afd87651c54804f584463112e309abb5324c30f60` |

Dashboard summary: canonicalProducts849, stores3, matchedAcrossStores14; snapshotAt `2026-09-26T11:36:05.102Z`. Basket totals DINA2230 / DANA1963 / FIX_PRICE2050. HTTP captures GET-only, Voice before deploy не запускался.

### Controlled local-source upload — FAIL / STOP

`git archive HEAD` exported immutable committed source в private directory вне repo. Все exported tracked file bytes сверены с текущим immutable checkout; hashes/export digest сохранены privately. Real env, node_modules/dist, private secrets, untracked report и generated runtime artifacts в export отсутствуют. Runtime target остаётся `/backend`; frontend/Go не деплоились.

Один actual local-source action:

```text
railway up <private immutable export> --path-as-root
  --service AdilBaga --environment production
  --project c4da7d9d-7c04-4efe-a05c-90fd66c366fd --detach
  --message "Part08D immutable eb3fe34475d153803e0a81e550d3fce34ba0af01"
```

CLI exit1 после `Indexing... / Uploading...`: **Failed to upload code with status code 500 Internal Server Error**. Это не build/start PASS и не доказательство размещения exact revision. Retry/redeploy/source-branch change не выполнялись.

Fresh platform inspection после failed upload:

- New deployment `bcfb10bc-5a1c-4c43-9bc4-b2994c549b34`, created `2026-10-05T00:08:27.749Z`, **FAILED**, stopped, instances empty.
- Previous `2d0ca456-d9d2-44ce-9378-a13b1bada1f9`: **REMOVED**; active deployments **0**.
- Build log fetch сообщает **Deployment does not have an associated build**; deployment logs empty. Platform upload failure подтверждён, compiler/application failure cause не придумывается.
- Post-upload service variable recheck: обе DB variables всё ещё exact restricted runtime connection; writer credential absent; repository source remains `kiratonine/AdilBaga`. GitHub source branch mutation commands не выполнялись.
- Actual public `/api/categories`, `/api/products?limit=100`, `/api/dashboard`: **404**, JSON Content-Type. Это platform/traffic-owner outage, не frozen application 404 acceptance.

§§12–16/34/40 STOP: `SNAPSHOT_AWARE_NEST_DEPLOY_FAILED`; live/healthy deployment, all-product regression и direct Voice **не доказаны**. Expected rollout source не выдаётся за successfully deployed source.

### READ-ONLY POST and rollback safety

Fresh POST DB audit **PASS**: все 10 full-row fingerprints, counts, original/managed ACLs, reader/writer state, schema metadata и Prisma history exact-match PRE. Ingest runtime absent, Snapshot1 / SourceRun3, no N+1. Failed application upload не изменил database.

POST HTTP gate честно **FAIL**: 404 вместо PRE200. Полный 849×3 GET/filter/detail/search/dashboard/query-error profile, direct Voice, writer password/persistence/LOGIN/membership, cmd/ingest dry-run, dry-run metrics/advisory lock lifecycle — **NOT RUN after STOP**. Не утверждается Part08D PASS по историческим Part08R results.

Platform rollback **не выполнен**: [Railway deployment-actions documentation](https://docs.railway.com/deployments/deployment-actions) указывает восстановление не только image, но и custom variables предыдущего deployment. Предыдущая конфигурация содержала owner credentials; безопасное сохранение новых restricted credentials при recovery не доказано. Возвращать owner DSN в API service ради recovery запрещено текущей remediation. Нельзя считать обычный rollback harmless image-only operation. Требуется owner/platform-reviewed recovery, сохраняющий restricted DB credentials, без source branch change/DB mutation; ad-hoc repair не выполнялся.

### Final boundary / archive

Intentional production changes этого continuation: **только DATABASE_URL/DIRECT_URL variables** и failed controlled local-source deployment attempt. Нет production application/security/schema/data SQL mutations, migration/seed/parser, writer LOGIN/password, ingestion, `--apply`, N+1, Go cutover, frontend deploy, commit/push. `.env`/существующий secret store не изменены; прочие service variables unchanged.

Current status **BLOCKED**, outage требует owner/platform attention. Истории initial target-unresolved и previous owner-credential STOP сохранены; credential remediation не откатывалась.

Permanent `production-part-08` archive: `artifacts/production-part-08-review.tar.gz`. Rebuild/exclusions/current-report and source byte-match/actual service+runtime+Railway auth credential scan **PASS**, 354 files. Real env/secrets/DB backup/private export/CLI context/dependencies/build/test outputs/Go binaries не включены. Единственный repository change — тот же report; source unchanged, final diff-check PASS. Остановлено для external review, не rollout approval.
