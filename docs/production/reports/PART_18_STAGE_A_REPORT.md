# Aktau Market — Part18 Stage A: Final Production Readiness Audit

Status: **READY_FOR_EXTERNAL_REVIEW**.

**Это готовность отчёта к review, не разрешение launch. Final Part18 launch gate: BLOCKED.**
Дата проверки: 2026-10-14 (Asia/Qyzylorda); GitHub/HTTP observations получены вечером 2026-10-13 UTC.
Stage A — audit only. Новые функции и production mutations не выполнялись.

## 1. Provenance, scope и источники

Fetch/prune выполнен до создания worktree и повторно перед report. Accepted base:
`54174be84c0daf5feee50701e62d213107a68f0c`; HEAD = origin/main, исходный новый tree clean.
Отдельный native-WSL worktree `/home/denis/tmp/adilbaga-part18-production-gate`,
branch `feat/part-18-production-gate`. Существующие worktree и незакоммиченные
файлы не изменялись; shared refs обновились только через fetch. Root AGENTS
отсутствует в committed main: применены предоставленные правила и прочитанный
AGENTS исходного repository. Явное разрешение отдельной ветки имеет приоритет
над историческим integration-only default. Single-agent, без delegation.

Изучены [ТЗ](../../00_TECHNICAL_SPEC.md), [roadmap](../../PRODUCTION_ROADMAP_AKTAU_MARKET.md),
[API v1](../API_V1_CONTRACT.md), frozen [OpenAPI](../../../contracts/openapi.yaml),
reports Part10–17, [dependency hygiene](PRE_PART18_SECURITY_HYGIENE_REPORT.md),
[revalidation](../FRONTEND_REVALIDATION.md), [Voice500](PUBLIC_VOICE_500_DIAGNOSTIC.md),
[Voice remediation](VOICE_VOCABULARY_REMEDIATION.md), [network perimeter](../NETWORK_PERIMETER.md),
[Cloudflare checklist](../CLOUDFLARE_ACTIVATION_CHECKLIST.md),
[alert policy](../OBSERVABILITY_ALERT_POLICY.md), [backup tooling](../../../ops/postgres/README.md),
six incident/recovery runbooks, [deployment](../../../deploy/README.md),
[auto-deploy setup](../AUTO_DEPLOY_SETUP.md), workflows и текущие Go/Next/config/sync sources.
Next-best-practices использован для проверки metadata/cache boundaries; source не менялся.
Исторический MVP ТЗ не отменяет production roadmap, frozen v1 и последние owner decisions.

Создан только этот report. Не читались private env/credentials/keyrings/backup contents.
Не было SSH, SQL, Voice POST, signed/unsigned webhook POST, ingestion, publish,
таймеров, load/restore/rollback drills, deploy, настроек GitHub/Vercel/Cloudflare,
commit/push/merge. Локальные тесты используют только test doubles/loopback, не production.

## 2. Fresh GitHub evidence

| Проверка | Фактическое evidence |
| --- | --- |
| PR25 branding | merged; merge SHA `ea01c2568d06d15e87acad3b3cb99035bd476e74`, 2026-10-13 |
| PR26 dependency hygiene | merged; merge SHA равен accepted base, 2026-10-13 |
| Exact-base CI | [run38455467669](https://github.com/kiratonine/AdilBaga/actions/runs/38455467669), push/main, completed/success, attempt1 |
| Mandatory jobs | Contracts, Frontend, Go Quality, Security, Nest Reference, Pipeline Quality, PostgreSQL Integration, Ephemeral Staging, CI Gate — **все success, 9/9** |
| Auto-deploy | [run38456070101](https://github.com/kiratonine/AdilBaga/actions/runs/38456070101), completed/success; Deployment offline checks success; **gate и rollout skipped**. Workflow success не означает API deployment |
| Vercel commit status | exact base context `Vercel: success`; не доказательство текущего production alias SHA или env scope |
| Backend2 PR24 | [PR24](https://github.com/kiratonine/AdilBaga/pull/24) **open, merged=false, merged_at=null**. Прочитана только metadata; branch/source/PR не менялись |
| GitHub About | fresh repository metadata homepage всё ещё `https://adil-baga.vercel.app`; description соответствует сравнению цен/аналитике/Siri |

CI содержит immutable actions, contents:read, bounded jobs, always CI Gate,
trusted event migration-base guard. Security/Go jobs включают source scan,
synthetic backup guards, race/vet/staticcheck/govulncheck; Frontend/Nest — audits.
Ephemeral Staging использует disposable PG17, local Go/Nest/Next и fake providers,
не реальный production. Job conclusions проверены; все raw logs/artifacts заново
не анализировались. Branch protection, security alerts/updates и Environment
protection административным доступом **не проверены**.

Auto-deploy activation остаётся **FROZEN / WAITING_FOR_OWNER**. Skip согласуется
с этим состоянием, но не заменяет owner read-only проверку literal enable flag.

## 3. Production identities и историческая Voice диагностика

Frontend candidate/current main — accepted base. Vercel success есть, фактический
deployment SHA домена должен подтвердить Owner в Dashboard. Публичный HTML уже
показывает Aktau Market; это content evidence, не криптографическая SHA attestation.

Последний accepted owner/task handoff API release:
**`438ecdfa3d386a186dcd8b73c3c10aef5e79dc82`**. Его deployment/manual Siri PASS
атрибутированы владельцу; такой handoff сохранён и в
[auto-deploy report](AUTO_DEPLOY_CI_CD_REPORT.md#2-repository-and-preserved-work).
**Активный VPS revision в Stage A независимо не установлен.** Именно фактически
активный image SHA, ожидаемо438ecdf…, надо подтвердить прежде следующего Voice gate.
main54174… не объявляется API release: auto-deploy skipped.

Исторически d6098… rollout был откачен на e6ef854…; старый e6ef854… тоже дал
Voice500 с access duration15000ms и NLP timeout/fallback8003ms. Pre-NLP6440ms
в [диагностике](PUBLIC_VOICE_500_DIAGNOSTIC.md#5-facts-hypotheses-and-missing-evidence)
было **inferred**, не измеренным stage duration. Позднее vocabulary remediation
убрала девять последовательных discovery, сохранила strict selected-category
validation и прошла local controlled timeout→fallback→201, snapshot/clarification
и parity tests. Это не новый production Voice smoke здесь.

Старый HTTP500 **не помечен текущим VERIFIED_FAIL**. Owner-reported real-iPhone
Siri PASS на438ecdf… — historical/attributed evidence. Текущие real Upstash,
application TOP1/TOP3/continue и physical Siri нуждаются в отдельно разрешённой
проверке после подтверждения actual release. Никаких provider benchmarks не нужно.

## 4. Bounded fresh public GET/HEAD observations

WSL operator network, Node24 fetch, truthful User-Agent
`AktauMarket-Part18-ReadOnlyAudit/1.0`, TLS verification включена, redirect manual,
timeout20s (asset follow-up15s), sequential requests; без cookies/auth/load test.
Timings — один end-to-end sample с чтением body, **не p95, не TTFB и не SLA**.

| Endpoint | Status | duration_ms | Evidence |
| --- | ---: | ---: | --- |
| API /health/live | 200 | 428 | JSON, no redirect, CF DYNAMIC |
| API /health/ready | 200 | 587 | JSON, no redirect, CF DYNAMIC |
| API /api/categories | 200 | 675 | 9 categories, other отсутствует |
| API /api/categories/milk/filters | 200 | 774 | JSON,1809 bytes |
| API /api/products?category=milk&limit=1 | 200 | 764 | one product,558 bytes |
| API /api/products/:id | 200 | 771 | тот же discovered product,556 bytes |
| API /api/dashboard | 200 | 798 | JSON,43631 bytes |
| API live, Origin=https://aktau.market | 200 | 170 | ACAO точно expected origin |
| API live, invalid synthetic Origin | 403 | 170 | JSON, ACAO отсутствует; intentional denied origin, не outage |
| /ru/catalog | 200 | 910 | Aktau Market, canonical, RU/KK hreflang, JSON-LD |
| /kk/catalog | 200 | 432 | same brand/SEO evidence |
| /ru/dashboard | 200 | 656 | brand/canonical/hreflang; dashboard JSON-LD не требуется |
| /ru/collections/milk | 200 | 4931 | brand/canonical/hreflang/JSON-LD; single slow observation, причина не установлена |
| /ru/products/:id | 200 | 1769 | brand/canonical/hreflang/JSON-LD |
| /kk/products/:id | 200 | 419 | same evidence |
| /robots.txt | 200 | 79 | text/plain; follow-up подтвердил Allow / и expected sitemap URL |
| /sitemap.xml | 200 | 984 | application/xml,4293775 bytes,6062 loc entries, expected domain/RU/KK alternates |
| GET /internal/revalidate | 405 | 232 | no redirect; не доказательство POST auth/secret correctness |
| HEAD /icon.svg | 200 | 227 | image/svg+xml |
| HEAD /og/ru.png, /og/kk.png | 200 /200 | not recorded | correct configured origins, image/png |

Первоначальные HEAD `/og-ru.png` и `/og-kk.png` вернули404: это **не используемые
source URLs**, не OG runtime defect. После сверки `defaultOgImage` проверены
настоящие `/og/ru.png` и `/og/kk.png` выше. Binary text/visual PNG comparison
в Stage A не выполнялся; он покрыт историческим Part17 review.

Все шесть sampled HTML страниц содержат новый бренд; проверка точных legacy
строк `Adil Bağa`/`Адил Баға` отрицательная. CSP присутствует, global
Referrer-Policy=no-referrer сохранён. Это sampled SSR/source evidence, не полный
browser/map/SEO crawl, external images/Siri/индексация не проверены.

**Новое observable docs discrepancy:** frontend responses содержат
`Strict-Transport-Security: max-age=63072000`; API sampled responses HSTS не
содержат. Next security source сам HSTS не задаёт, docs называют HSTS deferred.
Источник header (hosting/edge), approval и scope требуют read-only Owner review.
Не предполагается самовольное Cloudflare activation или подтверждённый runtime
defect; ничего не включалось/отключалось. TLS GETs прошли с обычной verification,
но expiry/DNSSEC/WAF/origin isolation заново не доказаны.

## 5. Evidence matrix — все 26 требований roadmap Part18

Status относится к указанному требованию и уровню evidence, не переносит CI/local
PASS в production. PENDING_EVIDENCE — нет свежего доказательства; BLOCKED —
известный незакрытый decision/acceptance gate. VERIFIED_FAIL без доказанного
текущего дефекта не применяется. NOT_APPLICABLE не подменяет обязательные gates.

| Requirement | Status | Evidence | Missing proof | Owner | Priority | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Next frontend — единственный frontend | VERIFIED_PASS | Current source только frontend Next App Router; sampled live SSR/SEO; exact CI Frontend success | Vercel alias SHA/settings для release inventory, не second runtime | Frontend / Owner | P1 | Подтвердить main/frontend/Next deployment SHA |
| 2. Go backend полностью покрывает API v1 | PENDING_EVIDENCE | Source7 routes; GET endpoints fresh200; historical Part15/Voice handoff | Active image SHA + current Voice201/TOP1/TOP3/continue | Backend1 / Owner | P0 | Read-only release inventory, затем отдельно approved Voice smoke |
| 3. NestJS contract parity PASS | VERIFIED_PASS | Exact-base PostgreSQL Integration/Ephemeral Staging success; historical full3083×3 GET parity + corrected equal-price comparator; Voice local parity | Fresh production parity не выполнялась; staging fixture coverage не весь live dataset | Backend1 | P1 | Сохранить exact CI evidence; при release/data drift отдельно read-only parity |
| 4. Production runtime без fixture/mock fallback | PENDING_EVIDENCE | Go config/main production real DB/providers; Next explicit HTTP config; fake settings явные test-only | Actual VPS APP_ENV/image и Vercel env scope/absence test overrides | Owner | P0 | Private boolean attestation без env values; no secrets reading здесь |
| 5. Supabase roles разделены | PENDING_EVIDENCE | Historical rotation/restore audit: reader6/private3 denied, separate writer17/runtime; physical production identity fail-closed в source | Current ACL/membership/ownership; source не доказывает отсутствие subsequent grants | Owner / Backend2 | P0 | Approved read-only privilege metadata, no write probes |
| 6. Upstash обязателен для Voice | PENDING_EVIDENCE | Config rejects absent production provider; TTL600/no memory fallback; historical real sessions/Siri handoff | Current real isolated session/start→continue cleanup | Backend1 / Owner | P0 | Только отдельный approved application smoke, не provider benchmark |
| 7. Recurring ingestion работает | PENDING_EVIDENCE | PR19 merged in ancestry; sync script/units существуют; PR24 open | Installed unit revision/active timers, last successful scheduled publish, freshness/stores | Backend2 | P0 | Backend2 read-only evidence; не запускать/включать timer и не merge PR24 |
| 8. Failed ingestion не ломает current snapshot | VERIFIED_PASS | Transactional Staged.Publish/source gates + historical lifecycle/security tests и current integration job | Current operational failure history/cadence отдельно row7 | Backend2 | P1 | Приложить test evidence; не симулировать production failure |
| 9. CORS strict | VERIFIED_PASS | Source exact allowlist; fresh allowed200/ACAO exact, denied403/noACAO; no-Origin200 | POST/preflight и full current proxy path отдельно Stage C | Backend1 / Owner | P1 | Read-only config attestation; authorized full smoke позже |
| 10. App + Cloudflare rate limits | PENDING_EVIDENCE | Source general20/40, Voice2/4/concurrency4, bounded8192 clients; historical edge20/10s IP exact2 Voice paths | Current Dashboard enabled rule/action, exact peer config | Owner | P0 | Read-only Cloudflare/proxy policy confirmation; не нагрузка |
| 11. Request/body/query limits | VERIFIED_PASS | Source body1MiB/URI16KiB/header64KiB; frozen limit100/offset safe integer, strict parser; exact CI + focused local tests | Production image identity ties source to deployed binary | Backend1 | P1 | Inventory row2; не вводить новые search/text bounds |
| 12. HTTP timeouts | VERIFIED_PASS | Source header5s/read15s/write20s/idle60s/request15s/ready2s; Gemini8s; focused tests/current CI | Current deployed revision; operational tail latency не source guarantee | Backend1 | P1 | Inventory + scoped application verification; не увеличивать budgets |
| 13. Cloudflare/WAF/DDoS | PENDING_EVIDENCE | Part14B historical owner UI/edge proof; current API HTTPS CF DYNAMIC/no challenge for this client | Current WAF/managed rules/DNSSEC settings; TLS expiry; HSTS attribution | Owner | P0 | Read-only Dashboard check, keep protection unchanged |
| 14. Origin закрыт Tunnel/firewall | PENDING_EVIDENCE | Historical loopback8080/UFW/origin80/443/8080 denial/exact peer; static verifier PASS | Current host binds/firewall/Tunnel/IPv6 and external origin denial | Owner | P0 | Read-only host inventory; не открывать origin |
| 15. Secrets rotated | PENDING_EVIDENCE | Historical owner/admin+ingest manual rotation and fresh-auth proof; API separate; no owner fallback | Current custody/rotation inventory; old credentials not independently testable; provider/SSH scope | Owner | P0 | Non-secret rotation/custody attestation; не ротация в Stage A |
| 16. CI security gates PASS | VERIFIED_PASS | exact54174… run38455467669, mandatory9/9 success; local Security PASS; ajv8.20/yaml2.9.1 | Branch protection/security settings — separate owner gate | Owner / Backend1 | P0 | Check protected main, required CI Gate, security updates/alerts |
| 17. Migrations tested | VERIFIED_PASS | Current PG Integration success; historical fresh+populated clone/schema/security/count proofs,4 migrations | Actual future production deployment never inferred from tests | Backend2 | P1 | Record deployed migration history via approved read-only evidence |
| 18. Backups работают | PENDING_EVIDENCE | Part11 and Oct7 Supabase encrypted current-state backup historicalPASS; explicit URL/GPG guards; local synthetic1/1 | Fresh recovery point after later sync, schedule/retention/off-host custody, RPO | Owner / operations | P0 | Existing safe artifact metadata/custody evidence; no new backup in Stage A |
| 19. Restore протестирован | PENDING_EVIDENCE | Historical Oct7 PG17 restore exact10 counts/schema/RLS/policies/history/fingerprints PASS; Part13 double-restore mappings proof | Recovery freshness after later publications, independently recoverable key, RTO/drill date | Owner / operations | P0 | Review latest drill metadata; separately authorize local restore if needed |
| 20. Monitoring/alerts работают | BLOCKED | Internal bounded metrics/JSON logs tested; alert policy explicitly NOT_CONFIGURED/deferred | Current delivery destination/cadence, safe test alarm/recovery receipt, backup/freshness alerts | Owner / operations | P0 | Approve operations activation/evidence scope; scripts alone не PASS |
| 21. Load test PASS | VERIFIED_PASS | Part13 representative local5/10/20/40RPS +20RPS5min soak, fake dependencies/outage recovery reviewed | Not current VPS capacity, not provider throughput or launch SLA | Backend1 / Owner | P1 | Accept historical local scope or separately scope current representative test; no production load |
| 22. Staging E2E PASS | VERIFIED_PASS | Exact-base Ephemeral Staging job success after PG Integration + Frontend | Persistent staging not configured; real-provider E2E not covered | Backend1 | P1 | Accept ephemeral evidence explicitly; don't invent persistent staging |
| 23. Production smoke PASS | PENDING_EVIDENCE | Fresh bounded GET/HEAD catalog/SEO/health PASS; owner historic SiriPASS | Current actual release Voice/Siri, Part16 signed204+bounded freshness, browser paths | Owner / Backend1 / Frontend | P0 | Separately authorize Stage C after read-only inventory |
| 24. Rollback проверен | PENDING_EVIDENCE | Historical actual d609→e6 rollback health200; auto broker mock failure/compensation tests | Current438 rollback image/DB compatibility/private config inventory; refreshed operator runbook | Owner / Backend1 | P0 | Read-only retained-image evidence first; no live rollback test here |
| 25. Privacy/terms/contact pages готовы | BLOCKED | No source routes; Part17 explicitly pending contact/operator/legal owner decisions | Approved identity/contact/legal content, publication/SEO checks | Owner / Frontend | P0 | Product/legal decision, separately reviewed implementation, nothing fabricated |
| 26. Brand/domain полностью заменены | PENDING_EVIDENCE | PR25 merged; SITE_NAME Aktau Market; fresh RU/KK HTML/canonical/hreflang/OG asset200; SVG final | GitHub homepage remains old; Vercel SHA/external launch/search-owner checks | Owner / Frontend | P1 | Owner UI-only review/update later; don't rename repo/project |

Дополнительные cross-Part gates: **Part16 signed production acceptance OPEN**;
GitHub main protection/Dependabot security settings PENDING_EVIDENCE;
auto-deploy activation FROZEN (не условие включить ради launch);
PR24/timer live state относится исключительно Backend2.

## 6. P0/P1 и необходимые Owner decisions

P0: current runtime release/config/security inventory; restricted DB evidence;
application Voice/session/Siri revalidation on actual release; Part16 signed
acceptance; recurring ingestion/freshness evidence from Backend2; current encrypted
backup/recoverability/off-host custody/RPO/RTO; effective alert delivery; rollback
target inventory; privacy/terms/contact/operator decision; protected-main/security
settings review. Не все это подтверждённые defects: большинство — отсутствующее
evidence; legal и signed gate точно открыты.

P1: HSTS hosting/edge attribution и соответствие owner policy; GitHub About URL;
документированный acceptable ephemeral staging scope; applicability старого local
load baseline к current release/data; bounded browser/SEO/maps/images evidence.
Single collection GET4931ms и sitemap4.29MB требуют наблюдения, но не доказывают
новый defect и не разрешают speculative performance rewrite.

Owner отдельно решает: legal operator/contact/texts; freshness/cadence SLA вместе
с Backend2; recovery retention (monthly count), RPO/RTO, key escrow; alert routing;
stage-specific production POST authorization; acceptance старого local load
baseline; GitHub protection features/permissions; HSTS provenance/policy.
Не нужно повторно утверждать logo или переименовывать repository/Vercel project.

## 7. Docs drift — обнаружен, НЕ исправлен

- AGENTS исходного worktree: old architecture/Nest target, temporary brand,
  Part16+ NOT_STARTED; в main самого root AGENTS нет.
- deploy/README, api-down, rollback, network checklist и committed Part15 report
  называют e6ef854 active; latest owner438 handoff не следует потерять.
- API_V1_CONTRACT preamble: planned API origin/Adil Bağa brand; wire definitions
  frozen и не изменяются ради docs drift.
- Part12 report: source PhaseA NOT_RUN/seven upstream jobs/Go1.27.1 — historical;
  сейчас real CI9/9/go.mod1.27.2 verified.
- Part16 report/FRONTEND_REVALIDATION: source candidate/main untouched wording
  historical; code merged, signed production acceptance всё ещё open.
- Part17 source-candidate/not-deployed narrative historical: PR25 merged/live
  sampled brand verified; legal/contact pending остаются current.
- Alert/backup/recovery runbooks “LOCAL NOW/FUTURE VPS/not provisioned” historical;
  это не подтверждение активного operations monitoring/scheduling сегодня.
- HSTS deferred wording расходится с frontend header; API без HSTS.
- Sync docs/units existence не означает установленный/активный VPS scheduler.
  PR24 улучшения не считаются частью current main.

## 8. Безопасная последовательность Stage B/C/D

**B — read-only inventory и decisions:** подтвердить frontend alias SHA/settings,
API image SHA/health/hardening/Tunnel/binds, current restricted DB permissions и
backup/monitoring metadata; Owner GitHub/Cloudflare security settings; Backend2
даёт timer/run/snapshot/freshness evidence. Не выполняется apply/start/enable,
не читаются значения env, не меняются роли. На SHA/security mismatch STOP.

**C — отдельно разрешённые bounded production acceptance:** после B Owner явно
разрешает один HMAC event (cache mutation, не publish), проверить204/auth rejection
и RU/KK product/sitemap/catalog/dashboard convergence≤5s с честным first-response
STALE. Не публиковать snapshot специально. Отдельно application Voice TOP1,
TOP3, clarification/continue/session cleanup и owner physical Siri; no repeated
Gemini benchmark. GET browser/SEO/map smoke. Без разрешения POST НЕ выполняются.
Production DB writes/migrations/ingestion не нужны этому frontend/API gate.

**D — operations evidence и final launch review:** принять свежие backup/restore,
alert receipt/recovery, rollback-image/compatibility evidence. Если нужны новый
backup, disposable restore/rollback rehearsal или representative load, определить
отдельный scope/authorization; не выполнять live outage/rollback/load по этому
report. Backend2 выполняет собственный approved ingestion scope независимо.
Заполнить pending rows фактическими evidence, обновить stale operational docs
только в отдельно reviewed docs change и получить final external/owner acceptance.
Automation остаётся frozen; Stage D не означает enabling CI/CD.

## 9. Точные read-only действия/команды для Owner

Команды ниже **не выполнялись** в Stage A. Выполнять в доверенной operator сессии,
без tracing, env dump и raw provider/session logs. SSH host verification не отключать.

```bash
git fetch origin --prune
git rev-parse origin/main
git log -1 --format='%H %s' origin/main

ssh -o BatchMode=yes -o StrictHostKeyChecking=yes my-vps 'sudo docker inspect adilbaga-api --format "revision={{index .Config.Labels \"org.opencontainers.image.revision\"}} image={{.Image}} user={{.Config.User}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restarts={{.RestartCount}} readonly={{.HostConfig.ReadonlyRootfs}} ports={{json .HostConfig.PortBindings}}"'
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes my-vps 'sudo docker image ls --format "{{.Repository}}:{{.Tag}} {{.ID}}"'
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes my-vps 'systemctl is-active cloudflared; sudo ss -lnt; sudo ufw status'
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes my-vps 'systemctl list-timers --all aktau-sync.timer; systemctl show aktau-sync.service -p ActiveState -p SubState -p Result -p ExecMainStatus -p ActiveEnterTimestamp'

curl --max-time 15 --silent --show-error --fail https://api.aktau.market/health/live
curl --max-time 15 --silent --show-error --fail https://api.aktau.market/health/ready
curl --max-time 15 --silent --show-error --head https://aktau.market/internal/revalidate
curl --max-time 15 --silent --show-error --head https://aktau.market/og/ru.png
curl --max-time 15 --silent --show-error --head https://aktau.market/og/kk.png
```

Host listeners/image inventory могут содержать private infrastructure metadata:
прислать только normalized outcome/release/loopback/no-public-origin booleans,
не IP/paths/config contents. Timer commands не запускают sync; Backend2 должен
предоставить last successful run/publish/source-age evidence без raw output.
Нельзя использовать docker inspect без выбранного format (там env secrets).

Owner UI read-only checklist:

- GitHub Actions exact-base run/jobs URLs выше; Settings→Rules/Branches: main PR,
  required CI Gate, force-push/deletion/bypass policy; Settings→Security: alerts/
  security updates enabled; Actions Variables: AUTO_DEPLOY_ENABLED absent/false.
  Dependabot `open-pull-requests-limit:0` останавливает version PR, не доказывает
  admin security updates setting. Не изменять Environment/activation.
- Vercel adil-baga: Production domain aktau.market, Deployment Git SHA, branch
  main, Root Directory frontend, Next.js, Node/build; Production scope **names
  only** API mode/base URL/site URL/HMAC secret. Не Reveal/Copy secret values.
- Cloudflare: current Tunnel ingress host→loopback, managed rules, API cache
  bypass, exact Voice start OR continue rule20/10s Block10s, HTTPS/DNSSEC status;
  HSTS header attribution (Vercel vs Cloudflare), не переключать настройки.
- Existing backup/drill private manifest: safe timestamp, encrypted filename/size,
  checksum match/decrypt/restore outcome, source snapshot/migration summary,
  retention/off-host/key recovery booleans. Не открывать secret/key files для отчёта.
- Existing alert receipt/recovery evidence и rollback image SHA/date. Отсутствие
  evidence явно сообщить, а не создавать alarms/restore/rollbacks этим checklist.

Для separately approved restricted DB metadata audit точный SQL ниже (в existing
private operator tool/connection; не вставлять DSN в command/report):

```sql
BEGIN READ ONLY;
SELECT current_user, session_user;
SHOW default_transaction_read_only;
SELECT c.relname, has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
       has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
       has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
       has_table_privilege(current_user,c.oid,'DELETE') AS can_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY c.relname;
SELECT g.rolname, m.admin_option, m.inherit_option, m.set_option
FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid
JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=current_user;
COMMIT;
```

Expected API identity/session aktau_api_runtime; sole reader parent,
ADMIN=false/INHERIT=true/SET=false; SELECT6/public USAGE, no private3/writes.
SHOW in a generic psql connection не доказывает Go physical-session initialization:
source tests и current API pool proof нужны отдельно. Owner metadata audit
не заменять DML/DDL probes; не выполнять migrations/status repair/role grants.

## 10. Реально выполненные local checks

Node24.10.0/pnpm10.32.1; Go local cached1.27.2, GOTOOLCHAIN=local. RTK wrapper
использован там, где он не меняет поведение проверки. Нет tool/dependency upgrades.

| Command / check | Exit | Result |
| --- | ---: | --- |
| git fetch origin --prune; rev-parse HEAD/origin/main; status | 0 | exact baseline, new worktree initially clean; repeated fetch no drift |
| node --test scripts/ci/guard.test.mjs scripts/network/verify-part14.test.mjs scripts/deploy/verify-part15.test.mjs scripts/revalidation/verify-part16.test.mjs | 0 | **55/55**: guard4, Part14 16, Part15 31, Part16 4 |
| node scripts/ci/run-checks.mjs security | 0 | source/workflow/secret guard PASS; synthetic backup1/1; no real dump/restore |
| node scripts/network/verify-part14.mjs | 0 | offline perimeter PASS, not activation proof |
| node scripts/deploy/verify-part15.mjs | 0 | static deployment PASS, not live acceptance |
| node scripts/revalidation/verify-part16.mjs | 0 | static boundaries PASS, not signed production acceptance |
| contracts: pnpm install --frozen-lockfile | 0 | installed pinned approved graph, lockfile unchanged |
| contracts: pnpm lint | 0 | frozen OpenAPI valid; CLI update suggestion ignored |
| contracts: pnpm test | 0 | **12 PASS /10 explicit HTTP-profile SKIP /0 FAIL** |
| backend-go: go test -count=1 ./internal/config ./internal/middleware ./internal/revalidation ./internal/observability | 0 | all4 packages PASS, isolated mocks/loopback only |
| bounded public GET/HEAD | 0 | observations section4; intentional403/405 and wrong-path404 not hidden |
| final scope / Markdown links / bounded secret scan / git diff --check | 0 | PASS; only this report is changed/new |

Part16 actual cache-smoke, full Go/Next suites, restore/load/rollback drills и
production POST здесь **не повторялись**. Current full suites подтверждены exact
hosted CI job conclusions, не заявлены как вновь выполненные local tests.
Scan — bounded patterns, не exhaustive secret/security certification. Relative
report links проверены локально; внешние docs links не делают settings verified.

**Final disposition:** audit READY_FOR_EXTERNAL_REVIEW; Part18 launch BLOCKED
до закрытия перечисленных P0 gates. Production не изменён этой задачей.
STOP для Code Review; никаких commit/push/PR/merge/deployment.
