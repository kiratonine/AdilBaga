# Aktau Market — Part18 Stage B2: Owner Security & Operations Evidence

Status: **READY_FOR_EXTERNAL_REVIEW**.

**Это готовность evidence/checklist к review, не launch PASS. Part18 launch BLOCKED.**
Дата: 2026-10-14 Asia/Qyzylorda; свежие GitHub observations — 2026-10-13 UTC.
[Stage A](PART_18_STAGE_A_REPORT.md) и [Stage B1](PART_18_STAGE_B1_REPORT.md)
external Code Review PASS принят. Оба файла сохранены byte-identical.

## 1. Baseline, scope и уровни evidence

Fetch/prune exit0; branch `feat/part-18-production-gate`, worktree
`/home/denis/tmp/adilbaga-part18-production-gate`.
HEAD = свежий origin/main = **54174be84c0daf5feee50701e62d213107a68f0c**.
Перед B2 только два известных untracked Stage A/B1 reports; tracked diff пустой.
Другие worktree не затрагивались. Root AGENTS отсутствует в committed main;
применены предоставленные правила и прочитанный AGENTS исходного repository.
Разрешение Part18 отдельной ветки имеет приоритет над historical branch default.

Прочитаны принятые reports, roadmap Part18, текущие Dependabot/deploy workflow,
[branch protection plan](../GITHUB_BRANCH_PROTECTION.md),
[revalidation](../FRONTEND_REVALIDATION.md), [backup tooling](../../../ops/postgres/README.md),
[alert policy](../OBSERVABILITY_ALERT_POLICY.md) и B1 production inventory.
Production settings не менялись; новый SSH/SQL/provider/application POST не выполнялся.
Existing credentials, backup/key files и env values не читались. Dashboard access
не расширялся и permission failures не обходились.

Evidence обозначено отдельно:

- **B2 direct** — выполненные сейчас Git/GitHub public/authorized metadata reads.
- **B1 accepted** — фактический ранее проверенный VPS inventory, не повторный B2 check.
- **Source/historical** — конфигурация/тесты/старые backup/restore/Siri results.
- **Owner pending** — конкретные вопросы; ответ/скриншот ещё не получен.

## 2. Confirmed и pending matrix

| Gate | Status | Confirmed evidence | Missing proof / boundary |
| --- | --- | --- | --- |
| Baseline main | VERIFIED_PASS | B2 fetch + GitHub branch SHA =54174be8… | API runtime не обязан совпадать с docs/frontend main |
| Classic main protection metadata соответствует plan | VERIFIED_FAIL | B2 branches/main: **protected=false**, protection.enabled=false; enforcement_level=off; contexts/checks пусты | Это конкретный metadata gap, не assertion о любых возможных external controls |
| Effective main rules/required CI Gate | PENDING_EVIDENCE | Detailed protection GET403; visible repository rulesets GET вернул **[]** | Effective branch/organization policy и bypass требуют Owner Dashboard; CI success != merge enforcement |
| Force push/deletion blocked | PENDING_EVIDENCE | No enabled classic protection in returned metadata | Не пытались force push/delete; нужны effective rules/screens |
| Dependabot alerts/security updates | PENDING_EVIDENCE | Source пять ecosystems, version PR limit0, no target-branch override | Admin switches/alert triage неизвестны; source limit0 не security toggle |
| AUTO_DEPLOY_ENABLED absent/false | PENDING_EVIDENCE | B2 variable endpoint tool400 unsupported; accepted exact-SHA rollout skipped; source literal true gate | Variable actual state неизвестен; automation остаётся FROZEN, ничего не включалось |
| Vercel-reported Production deployment | VERIFIED_PASS | B2 record7048115046, SHA54174be8…, environment Production, latest status success | Record production_environment=false сохранён как есть; alias не доказан |
| aktau.market → exact Production deployment SHA | PENDING_EVIDENCE | B1 public Aktau Market/RU/KK SEO; B2 deployment record выше | Production domain association в Dashboard |
| Vercel main/frontend/Next/env scopes | PENDING_EVIDENCE | Approved source contract, previous owner context | Current settings/names/Production scopes без secret values |
| Current Go runtime identity/health/hardening | VERIFIED_PASS | Accepted B1 actual438ecdfa… healthy/restart0/UID10001/read-only/cap-drop/loopback | Scoped inventory; current Voice не проверялся |
| Origin isolation | VERIFIED_PASS | Accepted B1 Tunnel/UFW/loopback/no globalIPv6/origin ports bounded unreachable | Evidence operator-path scoped, не новый B2 scan |
| Tunnel ingress/WAF/Voice edge rules | PENDING_EVIDENCE | Historical Part14B + B1 active Tunnel | Current effective Dashboard/config-only evidence |
| HTTPS/DNSSEC policy | PENDING_EVIDENCE | B1 valid TLS/public200; historical DNSSEC proof | Current DNSSEC Active/registrar status/redirect settings; no new DNS action |
| HSTS attribution | PENDING_EVIDENCE | B1 frontend max-age63072000/API no HSTS; source сам header не задаёт | Current Cloudflare/Vercel header configuration, provenance/owner approval |
| Backup current metadata/retention/custody | PENDING_EVIDENCE | Historical encrypted backup/restore genuine PASS | Newest recovery point/current-snapshot coverage, effective retention/off-host/key custody |
| Restore/key recovery/RPO/RTO | PENDING_EVIDENCE | Historical PG17 fingerprints/security/count restore PASS | Latest drill/date/current coverage, independent recoverability, approved targets |
| Monitoring/alert delivery | PENDING_EVIDENCE | Internal metrics source, B1 limited agent inventory, policy deferred | Actual cadence/destination/alarm receipt/recovery; no absence inferred from missing known agents |
| Rollback image exists | VERIFIED_PASS | B1 retained e6ef854/d609/438 images; selected old image metadata PASS | Existence не recovery readiness |
| Rollback compatibility/current approved target | PENDING_EVIDENCE | Old actual rollback historical; e6ef854 historical Voice500 | Current approved image/DB/config compatibility и application recovery evidence |
| Expected daily/weekly sync units | VERIFIED_FAIL | **B1:** оба expected timer/service not-found/inactive | B2 не refreshed; alternate scheduler неизвестен, Backend2 отвечает сам |
| Temporary Backend2 sudo expiry | VERIFIED_PASS | **B1:** NOTAFTER20261020200631Z, password-required broad sudo | Account/SSH не expire автоматически; owner revocation plan pending |
| Privacy/Terms/Contact launch content | BLOCKED | Part17 approved brand/logo, operator/contact/legal decisions unresolved | Product/legal decisions и separately reviewed content; не выдумывать реквизиты |
| Part16 production acceptance | PENDING_EVIDENCE | Source/local smoke PASS; B1 GET405 | Auth webhook smoke и genuine publish→cache freshness — разные future gates |

**Новые whole-row launch PASS не добавлены** за счёт owner checklist.
B1 уже подтвердил runtime/origin/artifact subgates; B2 уточнил Github governance
metadata gap и обновил Vercel-reported deployment record. PENDING не означает
подтверждённый runtime defect. main metadata false — реальное наблюдение, но
effective rulesets/bypass conclusion пока ограничен доступом.

## 3. Owner checklist — читать, не менять

Для каждого ответа указать **кто проверил, UTC date/time, screen, outcome**.
Скриншоты только обрезанные/redacted: без secret values, private host/IP, env
contents, ключей, account tokens, recovery codes. Не нажимать Reveal/Copy secrets,
Save/Edit/Enable, Redeploy/Run workflow или setup buttons. Если screen недоступен,
ответить «нет доступа», а не request token/admin privilege для агента.
Owner answers будут attributed evidence; независимые APIs/production tests
останутся отдельными. Этот checklist ещё **не выполнен владельцем**.

### 3.1 GitHub — kiratonine/AdilBaga

1. **Settings → Rules → Rulesets**: откройте только applicable main ruleset details.
   Какой enforcement (Active/Evaluate/Disabled), target main, inherited rules,
   bypass actors/conditions? Есть ли require PR, require status checks,
   block force pushes и restrict deletions? Укажите только несекретные названия/flags.
2. **Settings → Branches → Branch protection rules** (если используется classic):
   какой pattern реально покрывает main, enabled ли require PR/status checks,
   какой bypass/admin policy? API сообщил protected=false/off/empty — объясняется
   ли это отсутствием rule или другой policy? Ничего не создавать/исправлять сейчас.
3. В applicable rule **Required status checks**: присутствует ли **CI Gate**,
   правильный required check/source, применяется ли до merge? Exact baseline CI
   [run38455467669](https://github.com/kiratonine/AdilBaga/actions/runs/38455467669)
   9/9 PASS из Stage A — необходимое execution evidence, не enforcement proof.
4. **Settings → Security → Advanced Security / Code security** (название зависит
   от UI): Dependabot alerts и Dependabot security updates включены? Доступен ли
   dependency graph? **Security → Dependabot**: есть ли open actionable alerts,
   assessed/dismissed items? Сообщить count/severity/package/advisory identifiers,
   не raw private scan payload. Не dismiss/enable/auto-fix в B2.
5. **Settings → Secrets and variables → Actions → Variables → Repository variables**:
   AUTO_DEPLOY_ENABLED отсутствует или literal false? Только этот non-secret flag,
   не Secrets tab/secret values. Если true/другое значение — сообщить и STOP перед
   следующими release actions; не переключать автоматически. Проверить также,
   не inherited ли relevant variable; не утверждать off из одного skipped run.

Source Dependabot policy пяти ecosystems останавливает обычные version PRs,
не отменяет requirement security alerts/updates. Visible API rulesets=[] не
используется для обхода403 detailed protection access. GitHub About old homepage
из Stage A — owner hygiene follow-up, не permission менять Settings сейчас.

### 3.2 Vercel — adil-baga

1. **Project → Domains → aktau.market**: связан с Production? Откройте именно
   current domain deployment link, не latest Preview. В **Deployment → Details**:
   Ready/Success, target Production, Git SHA, production alias association и дату.
   Совпадает ли SHA с54174be8…? Если новее/старее — дать exact public SHA;
   не Redeploy/Promote. GitHub deployment record — supporting, не alias proof.
2. **Settings → Git**: Production Branch=main? **Settings → Build & Deployment**:
   Root Directory=frontend, Framework=Next.js, Node version, install/build/output
   overrides? Прислать names/public configuration, не весь settings export.
3. **Settings → Environment Variables**: читать только имена и scopes:

| Name | Expected scope / question |
| --- | --- |
| REVALIDATE_HMAC_SECRET | Production, server-only. Exists? Не NEXT_PUBLIC, не показать значение/хеш; раньше provisioned Owner, не rotate |
| NEXT_PUBLIC_API_MODE | Production. Owner privately confirms HTTP mode; не mock |
| NEXT_PUBLIC_API_BASE_URL | Production. Public config должен ссылаться на api.aktau.market |
| API_BASE_URL | Expected explicit Production server override; source допускает public-base fallback. Есть/нет? Не считать отсутствие автоматически defect, проверить approved effective HTTP target |
| NEXT_PUBLIC_SITE_URL | Production. Public config должен ссылаться на aktau.market |
| NEXT_PUBLIC_ENABLE_TEST_MOCKS | Не active production test override. Сообщить boolean отсутствует/disabled, не включать |

Expected public origins — source contract, **не считанные фактические env values**.
Укажите, применимы ли settings к current deployment; наличие variable сегодня
не доказывает, что она вошла в уже выпущенный deployment. Не менять Vercel Branch,
env, credentials или выпускать build ради этого evidence.

### 3.3 Cloudflare — aktau.market

1. **Zero Trust → Networks → Connectors / Cloudflare Tunnels**: existing Tunnel
   Healthy? Hostname route api.aktau.market, origin service **http://127.0.0.1:8080**,
   final catch-all404? Не показывать ID/token/credential/config file contents.
   Если Tunnel locally managed и UI не показывает ingress — отметить limitation;
   future approved sanitized config evidence, не invent UI proof.
2. **Zone → Security → WAF / Security rules → Managed rules**: Free Managed Ruleset
   Enabled? Есть ли custom global JS/interactive challenge, влияющий на API/Voice?
   Сообщить effective policy/matches, не менять rules и не пробовать abuse payloads.
3. **Rate limiting rules → Adil Baga Voice Rate Limit → view details**:
   exact expression start OR continue, IP counting,20requests/10s, Block10s,
   enabled/deployed? B1/historical expected paths:
   `/api/voice/start` OR `/api/voice/continue`. Есть ли method condition/rule
   precedence/exclusion? Прислать фактический expression, не «paths or prefix».
4. **Rules → Cache Rules → API Bypass cache**: hostname api.aktau.market,
   Cache eligibility Bypass, enabled/effective priority? Voice/session/errors
   должны no-cache; не выполнять POST для proof здесь.
5. **SSL/TLS → Edge Certificates**: Always Use HTTPS, certificate status/expiry,
   HSTS actual state/options? **DNS → Settings → DNSSEC**: Active/Confirmed?
   Registrar DS status проверить read-only; не раскрывать account/access secrets,
   не переключать SSL mode/DNSSEC/HSTS и не публиковать DNS records.
6. **Rules → Transform Rules / response-header rules**: есть ли rule добавления
   Strict-Transport-Security frontend hostname? Есть ли Vercel/project headers
   override? Кто/когда approved? B1 frontend max-age63072000, API absent —
   observed result, источник пока не доказан. Cloudflare HSTS OFF само по себе
   не доказывает Vercel attribution; назвать provenance unknown, если нет evidence.

No new browser challenge bypass, origin opening, certificate issuance или network
activation в B2. HTTPS response alone не managed-WAF/rate/DNSSEC proof.

## 4. Operations evidence — точные вопросы без новых drills

### Backup / restore / custody

Owner/operations предоставляет **существующий redacted manifest/drill summary**,
не env/key/backup contents и не private absolute paths:

- Самый новый encrypted recovery point: timestamp UTC, safe filename/opaque ID,
  encrypted size, recorded checksum type/value, PG tool version, source Supabase
  application project identity confirmed privately. Какой published snapshot/
  migration baseline покрыт? Когда был последний legitimate publish после него?
- Effective backup cadence и actual successful runs (не «есть backup.sh»).
  Retention configured/enforced? Source план7daily/4weekly/monthly — historical
  policy; actual monthly count, newest/oldest retained points ещё неизвестны.
  Не удалять старые recovery points для подтверждения retention.
- Off-host copy где по **storage class**, кто отвечает? Workstation copy вне DB
  server — исторический факт, не independent disaster redundancy proof. Есть ли
  копия, переживающая loss VPS/workstation/provider account? Не присылать bucket
  credentials/URLs/private storage paths.
- Last completed restore test: date, encrypted input ID/checksum, decrypt/checksum/
  custom format/PG17 --exit-on-error results, exact counts/schema/RLS/migrations/
  history/fingerprints/local restricted smoke outcome. Совместим с current state?
  Отдельно отметить no-owner/no-acl limits; нельзя заявлять roles/password recovery
  из public pg_dump.
- Кто independently может recover decryption key, где custody/escrow по классу,
  когда это последний раз подтверждалось существующим drill? Не присылать ключ,
  passphrase/keyring/fingerprint material, секреты или выполнять новое decryption.
- Owner-approved **RPO и RTO**: target, measured result/date, on-call ответственное
  лицо. Recovery-point age вычислить по timestamp, не invent arbitrary SLA.

Historical Part11/Oct7 backup+restore PASS сохранён. B1 conventional directory
not-found **не доказал отсутствие backups**. Fresh storage/drill metadata не
предоставлена этой сессии, глобальный filesystem/secret search не выполнялся.
Новый backup/restore/pruning/key recovery test требует отдельного scope.

### Monitoring / alerts

По **каждому** signal class: API live/ready/5xx, DB/session failures, ingestion/
snapshot/source freshness, backup failure, disk/memory, HTTPS/certificate/DNS:

1. Кто/что собирает signal, current cadence, threshold/window/minimum sample?
2. Какова destination **по классу** (например owner channel), кто primary/backup
   responder? Не публиковать private email/webhook/token/channel ID.
3. Existing last alarm receipt UTC и recovery receipt UTC, safe event class,
   redacted incident link/opaque reference, acknowledgment и duration до реакции?
4. Если никогда не доставлялось — написать NOT_VERIFIED, а не PASS по config.
   No new alarm/test outage в B2; provider screenshots не заменяют actual receipt.

Source alert policy deferred; B1 отсутствие известных service names не exhaustive
proof отсутствия external monitoring. **Delivery remains pending** и launch gate
20 BLOCKED до фактического evidence/отдельной approved activation.

### Rollback

B1 реально подтвердил active438 и retained SHA-tag images, включая e6ef854.
Нужны Owner-approved rollback **target SHA**, platform/binary/artifact identity
reference, current schema/DTO/private config compatibility, предыдущий actual
application acceptance на этом target и operator responsibility.
Old e6ef854 historical Voice500 должен быть явно учтён: image existence не делает
его безопасным launch rollback target. Не выполнять rollback для proof и не
объявлять current recovery PASS из старого d609→e6 health200.
Any compatibility gap — separately reviewed plan; не менять image/config/DB.

## 5. Backend2 — сохранённые evidence и пределы

**Accepted B1, не refreshed в B2:** ожидаемые daily `aktau-sync.timer` и weekly
`aktau-sync-full.timer` плюс services были LoadState=not-found/inactive; is-active
exit4. Это VERIFIED_FAIL именно expected installation/activation тогда. Alternate
names/scheduler или последующие работы неизвестны — не делать conclusion о любых
sync systems сегодня. Backend2 предоставляет свои read-only metadata/run outcomes
сам; B2 не подключался к VPS, не открывал/менял PR24 или его branches.

Temporary backend2 access по B1: PASSWD broad sudo rule NOTAFTER
**2026-10-20 20:06:31 UTC**; account/password expiry never. Expiring sudo не revoke
SSH key/account. Owner вопросы: handoff due date, ответственный за revoke, нужен ли
continued SSH после sudo expiry, отдельно approved timing/targets revocation?
Не продлевать/удалять rule/user/key и не читать credentials здесь.

Timer installation, ingestion dry-run/apply, secret wiring и Part16 notifier
integration принадлежат отдельно authorized Backend2 scope. B2 не дублирует эту
работу и не использует launch gate для включения таймера.

## 6. Legal/Product решения Owner

Нужен утверждённый decision set, **не готовые юридические тексты**:

| Page / area | Owner должен решить |
| --- | --- |
| Privacy | Реальный operator/controller и применимая юрисдикция; purpose/data classes voice text, precise coordinates, session ID/state, diagnostics; источник consent/Siri permission; retention и removal rights/process |
| Third parties | Роли/transfer/retention провайдеров Gemini, Upstash, Supabase, Vercel/Cloudflare; external image/tile requests; возможные analytics/cookies только если реально используются, не выдумывать |
| Security/privacy claims | TTL600 session ≠ retention всех providers; sanitized logs ≠ «никакие данные не собираются». Owner утверждает точные claims и request/contact handling |
| Terms | Реальная сторона/применимое право; сервис comparison, не продавец/checkout; price/source/snapshot freshness limitations, unavailable/out-of-stock handling, attribution/usage ответственности — только approved wording |
| Contact | Утверждённый публичный канал и handling owner/hours при необходимости; не private персональный email/телефон без consent |
| Operator/legal identity | Название/реквизиты/адрес, только реально подтверждённые и разрешённые к publication; если не юридическое лицо, отдельно approved correct identity |
| Publication | RU/KK language coverage, revision/effective date, link placement/Footer, SEO/public routes, responsible reviewer; отдельный implementation/release scope |

Brand Aktau Market и existing SVG final APPROVED; нового logo/repo/Vercel rename
не требуется. Нет решения operator/legal/contact — launch content gate25 BLOCKED,
но не автоматически установленное нарушение закона. Frontend/legal source здесь
не изменялся; никто не придумывал реквизиты или provider retention policy.

## 7. Оставшиеся P0 и минимальный Stage C

P0 ownership/enforcement: Owner подтверждает или отдельно планирует correction
main governance (classic metadata off, visible rulesets empty), required CI Gate,
force/deletion/bypass, security alerts/updates и off flag; Settings mutation требует
новой authorization, не «выполнить checklist».

P0 production evidence: Vercel alias/env scope, effective edge policy, current
restricted ACL inventory, legitimate ingestion/freshness evidence Backend2,
recovery-point/drill/custody/RPO/RTO, actual alert delivery, current compatible
rollback target, application Voice и Part16 signed/convergence acceptance.
Contact/operator/legal decisions обязательны. HSTS provenance не выдаётся за
runtime defect или permission переключать setting.

**Минимальная последовательность C, пока только план:**

1. Получить redacted Owner checklist evidence; привязать к observed dates/SHA,
   проверить drift origin/main/API438/domain deployment. Unresolved setting/gate
   не исправлять автоматически. Keep auto-deploy FROZEN.
2. Отдельный scope на current restricted DB metadata/backup summaries при
   необходимости; no owner credential fallback, no writes/secret values.
3. **C1 отдельное разрешение:** bounded webhook auth/rejection и один signed
   fixed event204. Successful HMAC POST меняет cache; не выполнять до approval.
   Это delivery/auth proof, не genuine publish→freshness proof.
4. **C2 отдельное согласование с Backend2:** observe следующий **легитимный**
   publish, post-COMMIT notifier outcome, six required new-server-request paths
   fresh≤5s после accepted204 с first-response STALE честно recorded. Не создавать
   snapshot ради теста, не запускать timer/ingest этим plan.
5. Отдельно approved application Voice TOP1/TOP3/clarification/continue/owned
   session cleanup и Owner physical Siri на подтверждённом runtime; no repeated
   provider benchmark. Historical HTTP500 не объявлять текущим failure.
6. Review operations/legal evidence, обновлять Part18 disposition только с proof.
   Новые backup/restore/alert/rollback/load или release actions — отдельный Stage D
   scope/approval, не неявная часть Stage C/B2.

## 8. Реально выполненные read-only checks

| Check | Actual result | Ограничение |
| --- | --- | --- |
| rtk git fetch origin --prune; branch/rev-parse/status | exit0, exact54174… | Preserved A/B1; other worktree untouched |
| Authorized GitHub GET /branches/main | completed; SHA54174…, protected=false, disabled/off/empty required contexts | Branch metadata, не exhaustive external enforcement audit |
| Authorized GET /branches/main/protection | API403 Resource not accessible by integration | No admin grant/permission bypass |
| Authorized GET /rulesets | completed, visible list[] | Не proof скрытых/unavailable policies |
| Authorized GET /rules/branches/main | tool400 INVALID_ARGUMENT unsupported endpoint | No effective-rules verdict |
| Authorized GET /actions/variables/AUTO_DEPLOY_ENABLED | tool400 INVALID_ARGUMENT unsupported endpoint | Flag remains pending; values других variables/secrets не запрашивались |
| Authorized exact-SHA commit status GET | success, Vercel success | Deployment signal, не domain alias |
| Public REST GET deployments?per_page=5, selected Production statuses via Node24 fetch | HTTP200 /200, process exit0 | Latest Production record7048115046/SHA54174…/success; production_environment=false retained |
| Read source Dependabot/workflow/revalidation/backup/alert/rules plan | exit0 | Source requirements, не settings/operation activation |
| sha256sum Stage A/B1 before and final | exit0; unchanged | Both accepted reports preserved |
| Final scope, Markdown links, bounded report secret scan, git diff --check | exit0 PASS | Only new B2 report; no exhaustive security certification |

Public REST metadata used truthful `AktauMarket-Part18-B2-ReadOnlyAudit/1.0`,
15s request budget, no tokens/cookies; selected fields only. Authorized tool
unsupported endpoint не обходился альтернативным credential/Settings access.
GitHub public deployment endpoint уже approved/used в B1; доступен без privileged
settings. B2 не повторял весь application GET/SSH inventory или tests: source
не менялся, accepted A/B1 evidence атрибутировано, не представлено как новый run.

Fresh admin Dependabot/Vercel/Cloudflare screens недоступны и Owner answers ещё
не получены. Screens/checklist не создают evidence самостоятельно. No existing
backup/key files sourced, нет provider/session raw logs или private data в report.

## 9. Safety и final disposition

Новый файл только `docs/production/reports/PART_18_STAGE_B2_REPORT.md`.
Stage A/B1 SHA256 byte-match, tracked diff пустой. Проверены relative Markdown
links, LF/trailing whitespace, scope и bounded DSN/private-key/secret-assignment/
private-credential-path patterns. No source/API/CI/dependency/runtime/DB/SSH access
policy changes; no GitHub/Vercel/Cloudflare Settings actions. Не было POST,
deploy/rollback/restore/load, ingestion/publish, timer/auto-deploy activation.
No commit/push/PR/merge. Backend2 не затронут.

**READY_FOR_EXTERNAL_REVIEW; Part18 launch BLOCKED.** Owner checklist и конкретные
missing proofs готовы; не подтверждённые gates не повышались. STOP для review.
