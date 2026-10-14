# Aktau Market — Part18 Stage B1: Read-Only Production Inventory

Status: **READY_FOR_EXTERNAL_REVIEW**.

**Inventory готов к review; Part18 launch остаётся BLOCKED.**
Дата: 2026-10-14 Asia/Qyzylorda; observations вечером 2026-10-13 UTC.
Stage A Code Review PASS принят; [Stage A report](PART_18_STAGE_A_REPORT.md) сохранён без изменений.

## 1. Baseline и границы

`git fetch origin --prune` exit0. Branch `feat/part-18-production-gate`,
HEAD = origin/main = **`54174be84c0daf5feee50701e62d213107a68f0c`**.
Worktree `/home/denis/tmp/adilbaga-part18-production-gate`. Единственный pre-existing
untracked файл — Stage A report; сохранён. Root AGENTS отсутствует в committed main;
применены предоставленные правила и прочитанный AGENTS исходного repository.
Явно разрешённый Part18 worktree имеет приоритет над historical branch default.
Другие worktree не изменялись. Только этот новый report добавлен в B1.

Использован существующий доверенный `ssh my-vps` с `BatchMode=yes`,
`StrictHostKeyChecking=yes`, `ConnectTimeout=10`; host-key verification не отключалась.
Удалённые команды только inventory/metadata, GET health и boolean checks отдельных
**несекретных** APP_ENV/CORS/TRUSTED_PROXY_CIDRS. Не было полного docker inspect,
Env dump, чтения credentials/secret files, provider bodies, SQL, Voice/webhook POST,
restore/rollback/load, start/enable/restart, ingestion/publish, deploy или access changes.
Stat private configuration проверял metadata, не содержимое. Никаких secret values
или private endpoint/IP/host/key paths в report.

Прочитаны [deployment runbook](../../../deploy/README.md),
[compose](../../../deploy/compose.production.yml),
[revalidation](../FRONTEND_REVALIDATION.md),
[rollback](../../runbooks/rollback.md),
[alert policy](../OBSERVABILITY_ALERT_POLICY.md),
[backup tooling](../../../ops/postgres/README.md),
[sync units](../../../ops/sync/README.md), Go entrypoint/config/pool и webhook source.
Automatic CI/CD Activation — **FROZEN / WAITING_FOR_OWNER**, не активировался.

## 2. VPS runtime — актуальное evidence

| Проверка | Результат | Evidence boundary |
| --- | --- | --- |
| Container | running / healthy / restart count **0** | Point-in-time, не stability/load test |
| Active revision | **438ecdfa3d386a186dcd8b73c3c10aef5e79dc82** | Container label и image label совпали; container image ID = tagged image ID внутри того же VPS store |
| Image platform | linux/amd64 | Metadata, образ заново не build/load/byte-verify |
| Entrypoint/User | /usr/local/bin/api; **10001:10001** | Existing immutable release metadata |
| Hardening | readonly=true, cap-drop ALL, no-new-privileges:true, privileged=false, no host PID mode | Actual HostConfig selected fields |
| Tmpfs/logging | /tmp rw,noexec,nosuid,size16m; logdriver local | Log contents/rotation retention не проверялись |
| Published port | **127.0.0.1:8080 only** | Docker PortBindings и host ss согласованы |
| Network | dedicated adilbaga-production, не host | Exact peer address не выводился |
| APP_ENV | production boolean **true** | Только этот non-secret setting, не полный env |
| CORS | exact https://aktau.market boolean **true** | Credentials/provider configuration не читалась |
| Trusted proxies | **one prefix**, valid exact host /32 or /128 boolean **true** | Parsing ipaddress strict; повторное measurement socket peer не выполнялось, историческое Part15 measurement сохранено |
| Private config file metadata | API/release files root:root, mode0600 | Не proof содержимого/shared secret/provider validity |
| Local live/ready | **200 ok /200 ready**, curl exit0 | DB connection guard worked for readiness at this instant; no direct SQL probes |

Read-only source diff438ecdf…→accepted main для `cmd/api`, config, pool,
middleware, Voice **пустой**. Поэтому inspected production-mode entrypoint
выбирает `OpenProductionReadOnly`: physical SET/SHOW read-only/statement timeout
и restricted identity/membership/ownership checks перед admission. Production
APP_ENV + ready200 — **indirect runtime evidence** guard acceptance, не полный
fresh ACL inventory. Никакого вывода current_user из новой SQL session здесь нет.

Config.Load в этом release требует real Upstash/provider settings в production,
но successful startup не доказывает текущую Redis/Gemini connectivity или работу
Voice. Provider/session tests запрещены B1. No memory/mock DB/session fallback
подтверждён source; реальный frontend env scope всё ещё неизвестен.

**Historical Voice500 не является текущим failure:** actual runtime438ecdf…
независимо установлен и отличается от e6ef854/d609 исторической диагностики.
Owner-reported Siri PASS на438ecdf… остаётся атрибутированным прошлым evidence.
Текущую application Voice/Siri correctness B1 не проверял.

### Rollback artifacts

На VPS сохранились SHA-tagged images438ecdf…, d6098f6…, e6ef854… и695f7e3….
Selected inspect старого e6ef854 image подтвердил exact revision
`e6ef854e2973e5b0871888bbc3111e026cdccc5b`, User10001:10001, linux/amd64.
**Rollback image existence VERIFIED_PASS**, но operational rollback readiness
не повышается автоматически: e6ef854 тоже участвовал в историческом Voice500.
Нужны owner-approved compatible target/current app checks и обновлённое inventory,
не слепое возвращение старого образа. Новый rollback/restore drill не выполнялся.

## 3. Tunnel/firewall/origin isolation

- cloudflared **active и enabled**. Config/tunnel credential contents не читались;
  remote ingress/WAF dashboard attribution отдельно pending.
- UFW active, default **deny incoming /allow outgoing /deny routed**;
  единственная shown incoming allow — OpenSSH22 для IPv4/IPv6.
- Host socket inventory80/443/8080 показывает только **127.0.0.1:8080**.
  Docker publication также loopback only; UFW сам по себе не считается proof
  Docker isolation.
- `ip -j -6 addr show scope global` aggregate: **global IPv6 absent**.
- Из того же WSL контекста target resolved privately из existing SSH config;
  по одному TCP connection attempt на origin80,443,8080 с4s budget:
  **bounded_timeout для всех трёх**, ни один port не доступен. IP не выводился.
  Timeout означает not reachable from this operator path, не точную attribution
  firewall/provider и не всемирный multi-vantage scan.
- Public API HTTPS health/catalog200 подтверждает working edge path одновременно
  с closed origin observation. Новые DNS/правила/Tunnel не создавались.

**Origin isolation для проверенных host publication/ports/network path:
VERIFIED_PASS.** Это не новая audit certification всех возможных alternate hostnames
или изменённых WAF rules. Exact trusted prefix подтверждён; current measured peer
не угадывался/не перенастраивался.

## 4. Frontend/Vercel и public GET/HEAD

Authenticated GitHub commit status: exact main context **Vercel success**.
Дополнительный public GitHub REST read `/deployments?per_page=5` HTTP200:
latest record **7048115046**, SHA54174be8…, environment **Production**, created
2026-10-13T19:32:03Z. Его `/statuses` HTTP200: **success**, environment Production.
GitHub record `production_environment=false` также честно сохранён: boolean не
переписан как true и сам по себе не доказывает Vercel domain alias.

Итого: **Vercel-reported Production deployment SHA/status VERIFIED_PASS** на
accepted base. **Текущий alias aktau.market→этот deployment SHA:
PENDING_EVIDENCE**, поскольку доступ к Vercel Settings/alias association отсутствует.
Source SHA и deployment-reported SHA одинаковы, но live HTML не выдаёт доверенную
Git SHA attestation. Env names/scopes/значения не читались. Root/frontend/Next/main
settings требуют owner Dashboard read-only evidence, не изменения.

Bounded sequential public Node24 fetch, truthful
`AktauMarket-Part18-B1-ReadOnlyAudit/1.0`, TLS verification on, redirects manual,
20s per request. Без retries/load/cookies/auth. Body в report не сохранялся.

| Request | Status | Safe observation |
| --- | ---: | --- |
| API GET /health/live /health/ready | 200 /200 | JSON, no redirect |
| API GET /api/categories | 200 | 9 categories |
| API GET /api/products?category=milk&limit=1 | 200 | Discovered current product для RU/KK read checks |
| API GET /api/dashboard | 200 | JSON, no redirect |
| GET /ru/catalog /kk/catalog | 200 /200 | Aktau Market, exact language canonical, RU/KK alternates, OG site_name |
| GET /ru/products/:id /kk/products/:id | 200 /200 | Brand/canonical/Product JSON-LD sampled присутствуют |
| GET /sitemap.xml | 200 | application/xml,6062 loc entries; не full integrity crawl |
| HEAD /og/ru.png /og/kk.png | 200 /200 | image/png; binary/visual не пересматривались |
| GET /internal/revalidate | 405 | No redirect; это не auth/secret/config correctness proof |

Frontend снова содержит HSTS **max-age=63072000**, API HSTS отсутствует.
Source security headers не включают HSTS: hosting/edge attribution/owner policy
всё ещё PENDING_EVIDENCE. Не менялся Vercel/Cloudflare/HSTS.

## 5. Security/admin evidence boundaries

| Gate | Current evidence | Status / remaining proof |
| --- | --- | --- |
| Go production safe runtime | Actual revision/User/hardening/APP_ENV/CORS/prefix/ready200 | VERIFIED_PASS scoped to inspected properties; no fresh direct DB ACL query |
| Supabase SELECT6/private3/role separation | Production physical identity guard accepted + historical ACL report | PENDING_EVIDENCE для complete current grants/reader/writer/ownership metadata; no credential/SQL access B1 |
| GitHub main branch protection | Authorized API GET attempted, **403 Resource not accessible by integration** | PENDING_EVIDENCE; 403 не отсутствие protection |
| Dependabot security alerts/updates | Metadata tool rejects endpoint as unsupported **400 INVALID_ARGUMENT** | PENDING_EVIDENCE; не disabled conclusion. Config limit0 only version PR policy |
| GitHub deployments metadata | Authorized tool unsupported400, public unauthenticated REST GET200 | Used public deployment/status records; no permission widening |
| Cloudflare WAF/managed/rate/DNSSEC | No authorized settings connector/access available | PENDING_EVIDENCE; edge health != settings proof |
| Auto-deploy | B1 known broker/journal paths absent; accepted Stage A workflow rollout skipped | FROZEN retained; exact repo variable/Environment settings still owner-only |
| Secret rotation/current custody | No values/files accessed | PENDING_EVIDENCE, historical proof not silently refreshed |

No settings were changed. API unsupported endpoint/403 — проверка доступа,
не failing application security test. Не пытались обходить permissions или искать tokens.

## 6. Operations — timers, temporary access, backups, alerts

### Daily / weekly sync

`aktau-sync.timer` и `aktau-sync-full.timer`: **LoadState=not-found,
ActiveState=inactive, SubState=dead**, next/last trigger empty. Оба related
services тоже not-found/inactive. Explicit `systemctl is-active` exit4 для обоих
timers; `Result=success`/ExecMainStatus0 у absent service **не successful sync run**.

Для этих expected units **recurring ingestion VERIFIED_FAIL (not installed/active)**,
а не предположение о pending scheduler. Альтернативный scheduler/path не исследован:
если Backend2 использует другие unit names, он должен дать точное evidence.
PR24/source branch не изменялись и заново не открывались; не утверждается merged.
Ничего не запускалось/включалось и не запрашивался manual sync.

### Backend2 temporary access

Пользователь **backend2 существует**; group inventory: только backend2,
docker/sudo group membership не показан. `sudo -n -l -U backend2` exit0:
**(ALL:ALL) PASSWD:ALL с NOTAFTER=20261020200631Z**.
Это временный broad sudo, срок **2026-10-20 20:06:31 UTC**
(2026-10-21 01:06:31 Asia/Qyzylorda). `chage -l`: account/password expiry never.
Таким образом **sudo rule expiry подтверждён**, но SSH account/key access не
истекает вместе с sudo rule. Пароль, authorized_keys/private keys не читались.
Права другого пользователя/сервиса не менялись.

Owner revocation plan (предложение, НЕ выполнено): определить момент handoff с
Backend2; после окончания работы отдельно разрешить removal только его temporary
sudo rule, затем при необходимости отдельный отзыв SSH key/account; не полагаться
на NOTAFTER как на полный SSH revoke. Перед future access change inventorize exact
targets/active work и сохранить admin recovery path. Продление/отзыв не разрешены B1.

### Backup / restore metadata

Known conventional `/var/backups/adilbaga` directory existence test: exit1.
Это **не доказательство отсутствия backups**: historical operator artifacts были
outside repo/workstation, actual storage location здесь не предоставлена/не читалась.
Не искались secret directories/keyrings и не читались encrypted/plaintext dumps.
Fresh backup timestamp/checksum/current-snapshot coverage/restore outcome/key custody
**PENDING_EVIDENCE**; accepted historical Part11/Oct7 proof остаётся historical.
Нужен owner-safe manifest/drill summary, не backup/key paths/contents.

Known auto-deploy journal directory и broker executable existence checks exit1:
эта approved automation installation не подтверждена/не найдена в expected paths.
Это не loss of manual release artifacts: предыдущие SHA images реально присутствуют.
Rollback journal/portable archive/restored-data compatibility не обнаруживались
глобальным filesystem search и не считаются готовыми по наличию images.

### Alerts

Scoped enabled unit inventory не показал application backup/alert timer;
dpkg backup и mdmonitor units **не database backup/production alert delivery**.
Aggregate enabled-services check для известных Prometheus/Alertmanager/Grafana/
node_exporter/uptime-kuma/Netdata names: false. Это не exhaustive absence proof:
managed/external monitoring может существовать без такого unit.
**Actual alert delivery PENDING_EVIDENCE**, Stage A operational blocker не закрыт.
Policy явно deferred; нужен existing alarm+recovery receipt/cadence/destination
evidence. Не вызывалась test alarm и не читались raw application logs.

## 7. Part16 — разделение компонентов и двух acceptance gates

| Component | Safe evidence | Что остаётся |
| --- | --- | --- |
| Frontend fixed protected endpoint | Committed source HMAC/timestamp/constant-time, fixed event/tag/path; public GET405 | Production secret presence/scope и POST auth outcome неизвестны |
| Go post-COMMIT notifier | Current main source cmd/ingest + PublishThenNotify; source/local Stage A tests | Deployed ingestion checkout/binary/config revision, existing shared secret match; не API image env обязан содержать notifier secret |
| Ingestion runtime wiring | Expected sync units absent, not activated | Backend2 existing config-only boolean evidence, без чтения секрета |
| Cache | 3600 fallback/ISR, accepted local convergence≤5s | Production end-to-end freshness ещё не PASS |

**C1 auth/webhook smoke:** отдельно Owner-authorized bounded missing/invalid auth
и signed fixed event,204 expected; successful POST меняет cache state даже без
новых данных. B1 не сделал ни одного POST. C1 докажет auth/delivery/invalidation
path, но не N→N+1 freshness или notify-after-COMMIT workflow.

**C2 genuine publish→cache convergence:** только после independently authorized
**легитимного** Backend2 publish наблюдать commit/new snapshot, notifier outcome,
RU/KK product/sitemap/catalog/dashboard доfresh≤5s с documented first-response
STALE. Нельзя публиковать production snapshot ради теста. C2 не подменяется C1
или local smoke; B1 не разрешает publish/timer activation.

## 8. Какие строки Stage A повышаются

Stage A file/matrix не редактировались. Ни один широкий gate не повышен за счёт
частичного metadata evidence.

| Stage A row / gate | B1 disposition | Reason |
| --- | --- | --- |
| **14. Origin closed Tunnel/firewall** | **PENDING_EVIDENCE → VERIFIED_PASS**, для проверенной текущей topology/ports | Actual loopback publication/ss, UFW deny/SSH only, globalIPv6 absent, origin80/443/8080 inaccessible, active Tunnel/public200 |
| **7. Recurring ingestion** | **PENDING_EVIDENCE → VERIFIED_FAIL**, для expected daily/weekly units | Обе пары unit not-found/inactive; alternate scheduler unknown. Backend2-specific P0 остаётся |
| 2. API v1 coverage | PENDING_EVIDENCE retained | Active438 independently verified, но Voice POST не выполнен |
| 4. No production fixture/mock fallback | PENDING_EVIDENCE retained aggregate | Go production config/revision/source strongly verified; frontend actual env scopes не доступны |
| 5. Supabase role separation | PENDING_EVIDENCE retained | Readiness guard indirect identity PASS; complete current ACL/writer metadata отсутствуют |
| 6. Upstash/Voice | PENDING_EVIDENCE retained | Config-required source evidence не session connectivity/continue proof |
| 10/13. App+edge rate/WAF | PENDING_EVIDENCE retained | Exact proxy/CORS config подтверждены, edge Dashboard нет |
| 15. Secrets rotated | PENDING_EVIDENCE retained | No values/rotation evidence access |
| 18/19. Backup/restore | PENDING_EVIDENCE retained | No fresh safe recovery metadata |
| 20. Monitoring/alerts | BLOCKED retained | No actual delivery proof; отсутствие известных agents не exhaustive failure conclusion |
| 23. Production smoke | PENDING_EVIDENCE retained | GET/HEAD PASS; Voice and Part16 gates open |
| 24. Rollback verified | PENDING_EVIDENCE retained | Images present, no approved current compatibility/application recovery proof |
| 26. Full brand/domain | PENDING_EVIDENCE retained | HTML+Vercel-reported production SHA PASS; alias/settings/external launch checks pending |

Подгейты теперь **VERIFIED_PASS**: current API release identity/health/hardening,
old rollback image existence, exact CORS/one host-only proxy prefix, Vercel-reported
Production deployment success/SHA, sampled RU/KK SEO/OG, Backend2 sudo expiry.
Они не заменяют whole-row requirements. Строки Stage A, уже VERIFIED_PASS для
source/CI/local scopes, не переинтерпретируются как full production certification.

## 9. Реально выполненные команды и exit codes

Все SSH sessions используют `rtk proxy ssh -o BatchMode=yes -o StrictHostKeyChecking=yes
-o ConnectTimeout=10 my-vps`. Ниже точные inventory commands внутри sessions;
compound session exit0 не притворяется отдельным exit каждой ранней команды.

| Command/check | Actual exit | Result |
| --- | ---: | --- |
| rtk git fetch origin --prune; branch --show-current; rev-parse HEAD/origin/main; status --short | 0 | Exact base; preserved Stage A only before B1 |
| docker inspect adilbaga-api --format selected revision/User/State/Health/RestartCount/ReadonlyRootfs/CapDrop/SecurityOpt/PortBindings/NetworkMode | compound SSH0 | Metadata section2; no full inspect/env |
| docker image ls --filter reference=adilbaga-api:* --format repository:tag | compound SSH0 | Four retained SHA tags |
| systemctl is-active/is-enabled cloudflared | is-active0; enabled printed in compound0 | Active/enabled |
| sudo -n ufw status verbose | 0 | Deny incoming/routed, SSH allow4+6 |
| sudo -n -l -U backend2 | 0 | PASSWD ALL with exact NOTAFTER |
| getent passwd backend2, chage -l backend2 | compound SSH0 | User exists, account/password never expire |
| systemctl show daily/weekly timers/services, selected state/result properties | compound SSH0 | not-found/inactive; no successful-run claim |
| systemctl is-active aktau-sync.timer /aktau-sync-full.timer | 4 /4 | Expected missing units, not test suppression |
| systemctl list-unit-files --type=timer --no-pager, scoped awk | pipeline0 | Only unrelated dpkg/mdmonitor names matched, no app evidence |
| stat selected API/release env-file mode/owner/group | 0 | root:root0600; contents not read |
| ss -H -lnt, filter ports80/443/8080 | pipeline0 | loopback8080 only |
| ip -j -6 addr show scope global → private aggregate | 0 | GlobalIPv6 absent |
| curl --max-time 10 -fsS loopback /health/live /health/ready | 0 /0 | ok/ready |
| docker image inspect e6ef854 tag, selected revision/User/OS/Arch | 0 | Rollback artifact metadata verified |
| docker exec /bin/sh boolean APP_ENV/CORS checks | check0 /0; exec0 | Production/exact origin; no credentials access |
| docker exec selected non-secret TRUSTED_PROXY_CIDRS → private Python ipaddress parsing | 0 | One valid host-only prefix; value not emitted |
| container/image selected image ID inspection | 0 /0 | Same VPS image ID, revision438/platform verified |
| systemctl enabled service metadata → fixed aggregate | 0 | No known monitoring service name; limited negative inventory |
| test -d known backup dir /known deploy journal; test -f known broker | 1 /1 /1 | Not found; no global absence claim |
| id -nG backend2 | 0 | No docker/sudo group shown |
| local Python ssh -G target resolution +3 socket attempts timeout4 | 0 | No hostname/IP emitted; all three bounded timeout |
| GitHub commit status via authorized read | API success | Vercel success exact base |
| GitHub branch protection read | API403 | No permission, PENDING_EVIDENCE |
| GitHub deployments/security endpoints via metadata tool | tool400 | Unsupported; no disabled-setting inference |
| Public GitHub deployments/status REST through bounded Node fetch | HTTP200; process0 | Production record541/status success; Preview record not misclassified |
| Public sequential GET/HEAD section4 | process0 | Exact HTTP statuses reported; no POST |
| git diff438..HEAD --name-only scoped API/config/pool/middleware/voice | 0, empty | Guard/entrypoint source unchanged |
| Scope/links/report bounded scan; git diff --check | 0 | PASS; Stage A preserved, only B1 added |

Full local Go/Next/CI matrix не повторялась: executable source не менялся.
Exact baseline hosted CI9/9 сохранён из accepted Stage A, новый CI run не создан.
No provider benchmarks/production mutation/SSH setup/deployment.

## 10. Остаток и отдельные approvals

1. Owner read-only Vercel alias/settings/env **names/scopes only**, GitHub protection/
   Dependabot security/admin evidence, Cloudflare rules/HSTS attribution.
2. Backend2 сообщает alternative timer names либо отдельно решает installation/
   activation в собственном approved scope; B1 это не разрешает. Нужен last genuine
   run/source freshness/publish evidence, не `Result=success` absent unit.
3. Owner даёт safe latest backup/restore/custody/retention/RPO/RTO summary и alert
   delivery proof; любые новые backup/restore/alarm operations требуют scope отдельно.
4. Restricted role complete ACL/identity metadata и current rollback target
   compatibility evidence — отдельно разрешённая read-only verification; без secrets.
5. C1 HMAC/webhook POST, C2 legitimate publish observation, Voice/session/Siri smoke —
   отдельный Owner approval. Никаких new snapshots/provider benchmarks ради gate.
6. Owner фиксирует срок/ответственного temporary Backend2 access handoff/revoke;
   NOTAFTER подтверждён, SSH revoke не автоматический и не выполнен.
7. Contact/operator/legal decisions и ранее перечисленные launch gates не закрыты.
   Automatic CI/CD остаётся frozen; main/source/runtime не меняются.

**READY_FOR_EXTERNAL_REVIEW для B1 inventory; Part18 launch BLOCKED.**
Production application/config/security/access не изменены этой задачей.
STOP. No commit/push/PR/merge/deployment.
