# Production Part 11 — Observability, backups & recovery

Status: **READY_FOR_EXTERNAL_REVIEW**.
Date: 2026-10-05. Local foundation only; no deployment/production mutation.

## Immutable provenance and scope

Branch `integrate/full-stack`.
**PART11_BASE_SHA / HEAD / origin: `75d57d1ae61ade26c8db87cb85390b2336776793`**.
Commit `feat(prod): harden security baseline`; parent
`bd98670f5d617b4c4324037930c8643d70e9710a`.
Initial Part11 tree was clean. Continuations preserved the known partial candidate;
fetch/recheck confirmed the same immutable HEAD=origin. No reset/restore/rebase,
merge, commit, push or tag. Owner authorized resume from the known dirty candidate.

Production interaction: **SELECT/read-only metadata + logical backup only**.
No DDL/DML/roles/grants/migrations/rotation, no writer LOGIN, ingest dry-run/apply
or N+1 on production. No Railway/VPS/domain/DNS/Cloudflare/deploy/cutover.

## Blocker history — preserved, resolved

1. **PART11_BACKUP_OPERATOR_CONFIG_MISSING**: first prerequisite-only run had no
   explicit backup variable. No production connection or implementation occurred.
   Its BLOCKED archive was verified (364 members, 362 tracked files scanned).
2. **PART11_BACKUP_SOURCE_APPLICATION_SCHEMA_MISSING**: owner initially supplied
   a separate empty PostgreSQL18 database, with none of the expected public app
   tables. Sanitized read-only inventory identified this; STOP before dump/restore.
   Partial instrumentation/tooling was retained; BLOCKED archive had 372 members.
3. Owner corrected the same private `~/.config/adilbaga/part11-backup.env` (regular
   file0600) to the current direct application operator connection. It was sourced
   quietly/exported; fresh PRE below PASS. No alternative runtime URL was guessed
   or copied into backup config, and no URL/host/password/key was printed.

Local harness corrections, not hidden PASS: a URI supplied solely as PGDATABASE
does not expand through libpq defaults; private URL components now use environment
fields, not DSN argv. Restore guard rejected a local URL query parameter before
pg_restore; corrected harness target had none. pg_restore requires explicit
dbname to perform restore (now private-local dbname, never DSN). Ingestion profile
initially lacked its explicit local admin and then overlapped a local Docker DB
outage; it was rerun **sequentially with complete local config**, PASS. No runtime
business/test assertion was weakened to fix those orchestration issues.

## Audit-first logging / privacy — PASS

Private pre-edit signal/gap matrix covered HTTP/errors/health, pool/query, Redis,
Gemini/Voice, ingestion, ages/freshness, lifecycle and backup/restore.
Only missing observability fields/signals were implemented.

JSON slog normalizes top-level time to **timestamp** and preserves configured
level. HTTP access: timestamp, level, request_id, route template, method, status,
duration_ms, error_code. Success code empty. Fixed codes:
bad_request/forbidden/not_found/method_not_allowed/payload_too_large/
uri_too_long/rate_limited/internal_error/service_unavailable; other client/server
errors map to bounded classes. Panic logs no panic payload/stack/private values.

High-entropy privacy tests verify no private path/query/text/session/token/
provider-body/SQL-argument markers in observations. Redis logs only fixed op/
outcome/duration/error_code; Gemini keeps classified outcomes plus parse duration;
ingestion completion logs mode/phase/counts/duration/safe failure code, not raw
products or driver/config details. Public error/status/DTO semantics unchanged.

## Metrics — PASS

In-process thread-safe Registry.Snapshot(), **no exporter or public /metrics**.
Closed route/method/status-class/dependency/operation/outcome/store dimensions,
unknown values collapse to other. No product/session/request IDs, SQL/args,
search/voice text, coordinates/IP/URL/raw error labels or retained raw samples.

- HTTP counters/failures and fixed exclusive duration buckets:
  <=1ms,10ms,50ms,100ms,500ms,1s,5s,+Inf. Tests cover 200/400/404/429/500/503,
  multiple route classes, concurrent observations and bounded high-entropy input.
- DB pgx tracer observes fixed query success/failure/duration without SQL/args.
  Numeric pool snapshot max/total/acquired/idle/constructing; local proof holds
  four physical connections and observes pool stats plus query failures.
- Redis get/set/delete success/failure/duration; TTL600/hashed keys/timeouts/
  bounded response/no redirects/no memory fallback unchanged.
- Gemini full parse call duration/outcome, separate classified provider-attempt
  counters. Model/schema/failover/shared8s timeout unchanged; fake providers only.
- Ingestion dry_run/stage/publish counters/durations and safe CLI completion
  counts/classes; local lifecycle tests prove successful phases and failed stage.
- Latest publication age sampled by existing snapshot reads, not an added query
  or cached pointer. SourceFreshness observes succeeded sources of latest publish.
  **Operator/local only**: API reader source_runs access remains denied. Local
  race profile proves source3 gauges and reader denial.

No RPS dashboard/external p50/p95/p99 claim: fixed histograms support future
delta-RPS/approximate quantiles. Age gauges update on reads, not a background
polling loop. Readiness remains DB/runtime-only; Gemini/transient Redis do not
make catalog globally unready.

## Fresh application backup PRE / POST — PASS

Source PostgreSQL **17.6**, client **pg_dump17.10**, restored PostgreSQL17 Alpine
(local image17.11). Explicit private operator backup variable only; production
read-only defaults and bounded timeouts. No owner credential used by API.

PRE and POST identical: all counts/ordered fingerprints below; public schema,
RLS9/FORCE0, exact23 policies (reader6/writer17), table ACLs, role flags/membership,
migration/history. Ingest runtime LOGIN absent. One published baseline snapshot,
three succeeded SourceRuns, exactly these applied migrations:

`20260923000000_init`,
`20261004000000_rls_runtime_access`,
`20261005000000_snapshot_history`.

| Table | PRE = restored = POST count | Exact aggregate fingerprint |
| --- | ---: | --- |
| stores | 3 | 9f71c07b93e8182eb840f4684d1fdba7 |
| store_locations | 15 | e7190d62ba2719334ab2a614530adc57 |
| categories | 6 | 8a999f271c5e502b7140ffe19e3c04dd |
| raw_products | 863 | 05bb2b92a288212cf4eae7fd016a7114 |
| canonical_products | 849 | 9d194563e3189c7342faa02d023ce50d |
| product_mappings | 863 | eaee049588f7f77a9a5ecdb47cf8410e |
| offers | 863 | faf1eabf7b5353ac3b00de99d6b8e8b5 |
| snapshots | 1 | 276aa61c17ee7ea12f2c2353403f253a |
| source_runs | 3 | acdf0a6946c9d2bd572c4f58477d85fe |
| _prisma_migrations | 3 | 5c6a192355ef9999b02074be3601f841 |

Fingerprints aggregate MD5 row digests ordered by id COLLATE C; no row data in
report. product_mappings float confidence uses float8send bytes plus canonical
non-float JSON. Initial JSON-text fingerprint differed across source/local
formatter, but **all other fields and exact float binary values matched**.
No rounding/drop of fields/data change used to obtain integrity PASS.

## Encryption / restore — PASS

Established GnuPG **2.4.4**, no install/custom crypto. Private local-proof
Ed25519/CV25519 recipient/keyring outside repo; retained for recoverability.
Encryption/key custody is local proof, not final independent production escrow.

Complete portable **public application schema/data** custom dump, no-owner/no-acl;
all9 app tables plus Prisma history, not just SELECT6. Supabase-managed internal
schemas excluded; pg_dump does not capture cluster-global roles/passwords.
Final scripts ignore inherited PGHOSTADDR/PGSERVICE so explicit target cannot
silently redirect. Guards reject missing config, relative/repo/symlink-to-repo/
artifacts/TODO/node_modules destinations, missing encryption config, non-loopback/
wrong-db/query-bearing restore targets. No overwrite/pruning of existing backups.
Synthetic guard/failed-encryption/checksum/cleanup tests PASS.

Final retained encrypted backup:
`/home/denis/.local/share/adilbaga/part11-recovery-1791207105152/encrypted/app-public-20261005T135420Z-BqpeD4bE.dump.gpg`.
Size **293893 bytes**. Plaintext SHA256:
`ee92d9b0f79ce22a4e625fcd89bfda579437924dfccfd90115738ee2189da355`.
Ciphertext rejected by pg_restore; decryption checksum matches; decrypted custom
format validates; actual restore **--exit-on-error, exit0**. Final backup repeated
after operator-script hardening and restored into a second fresh local DB.

Private directories700; encrypted artifacts/metadata600. EXIT cleanup removes
plaintext on failure/success. **No plaintext/decrypted temp leftovers**; no dump/
key/backup in repo/archive. Both task-created encrypted recovery points preserved,
private keyring retained outside repo. No existing user backup removed.

Owned disposable loopback PG17 only, port15491, `part11_recovery` and
`part11_final`. Production credentials never put in container. Local-only dummy
NOLOGIN reader/writer prerequisites satisfy policy references; no-owner/no-acl
intentionally does not restore production ownership/ACL/passwords. Verified exact
tables/RLS/policies/constraints/indexes plus **76 columns/defaults/types,
17 enum labels and 1 function**; source unchanged. Semantic relations query
canonical+category+offers+store returns863. Migration/history fingerprints exact.

Reviewed SELECT6/public USAGE and a safe sole-reader local aktau_api_runtime
membership recreated **locally only**. Four-connection read-only observability
profile PASS; source3 operator observations/private-table denial PASS. Restricted
Go against both actual restored backups: live200, ready200, categories6,
products849 via bounded pages, dashboard baskets3, /metrics404. No real providers.
Owned Part11 containers/processes/volumes/networks removed after proof; images
remain local review artifacts, encrypted recovery points/keyring remain private.

## Alert policy / runbooks / deferred activation

Created `docs/production/OBSERVABILITY_ALERT_POLICY.md`, required9 alert classes
with signal/condition/source/severity/action/recovery/deployment boundary and
links. Thresholds/windows/N/cadence are configuration decisions after staging,
not arbitrary permanent values. Disk/memory/certificate alerts explicitly deferred.

Six runbooks under docs/runbooks:
api-down, db-down, redis-down, ingestion-failed, rollback, secret-rotation.
All separate LOCAL NOW/FUTURE VPS, read-only-first and least-privilege recovery;
no fake deploy/restart/provider commands. Rollback separates app/migration/
snapshot/credential; no blind migration reversal/history deletion/owner fallback.

Retention documented: **7 daily +4 weekly +several monthly**, no automated pruning.
Private workstation backup is off the managed DB server but not final redundancy.
**Scheduler NOT CONFIGURED. External alert delivery NOT CONFIGURED.**
No live alerts/scheduled-backup PASS claim.
Part12 CI/staging, Part13 thresholds, Part14 network/domain probes, Part15 actual
private collector/exporter, host monitoring, delivery/timer/independent off-VPS
storage and key custody remain separately reviewed activation work.

## Actual commands / mandatory final gates

RTK used throughout, proxy for exact env/tool/process behavior.
Go PATH=/usr/local/go/bin; GOTOOLCHAIN=local; Go1.27.1. Node24/pnpm retained.

| Gate | Actual result |
| --- | --- |
| gofmt changed Go files; gofmt -l . and gofmt -d . empty | PASS |
| go mod tidy; mod verify; go.mod/go.sum diff empty | PASS |
| go test -count=1 ./... | PASS |
| go test -count=1 -race ./... | PASS |
| go vet ./... | PASS |
| go tool staticcheck ./... | PASS |
| go tool staticcheck -tags=integration ./... | PASS |
| go tool govulncheck ./... | PASS, no reachable known vulnerabilities |
| go build cmd/api +cmd/ingest (private /tmp outputs) | PASS |
| full tagged fixture integration suite (prepared loopback fixture) | PASS |
| final full go test -count=1 -race -tags=integration ./... | PASS; explicit restored observability profile, other profiles separately run |
| local production identity / unsafe role and physical pool policy profiles | PASS |
| LOCAL HTTP parity849×3 /6 filters/detail/10 searches/dashboard | PASS |
| LOCAL canonical/injection/Content-Type/error/semicolon query parity | PASS |
| deterministic LOCAL Voice parity/privacy/outage-abuse profiles | PASS |
| snapshot security reader6/writer17/constraint/deny/fingerprint profile | PASS |
| local EXPLAIN ANALYZE catalog/dashboard plans | PASS |
| LOCAL ingestion lifecycle (dry-run/lock/failed safety/atomic publish/history) + phase metrics, -race | PASS |
| node --test ops/postgres/backup.test.mjs | PASS (1 synthetic test, all guard/failure cases); real restore/encryption separately proven |
| bash -n scripts; node --check guard/pg-run | PASS |
| Nest pnpm db:generate /build /test | PASS,25 tests/pass25/fail0/skip0 |
| contracts pnpm lint /test | PASS; offline12/pass12,10 HTTP skips; explicit profiles below |
| frozen GET black-box test:live against LOCAL Go and LOCAL Nest | PASS both; no production HTTP profile |
| final docker build adilbaga-part11-api:review | PASS |
| final Docker production-config LOCAL PG smoke | PASS |
| fresh backup/encryption/checksum/decrypt/restore/integrity/restricted smoke | PASS |
| production read-only POST vs PRE | PASS |

Docker image:
`sha256:16999a990615fe2753c2b5f00b455ce198dc02473c35eebe19f4b4c8df07bb0e`.
UID/GID10001, read-only rootfs/tmpfs noexec+nosuid/cap-dropALL/
no-new-privileges, CA present, no compiler or image credentials. healthy/live/
ready/GET200; DB down live200/ready503, DB restart ready200 **same API PID**,
SIGTERM exit0 in375ms. No runtime writable filesystem needed.

Frontend untouched; no full UI matrix/vendor SDK required. NestJS, frozen
OpenAPI/examples/contracts, Prisma schema/migrations/security, dataset and
dependencies byte-unchanged. No real Gemini/Upstash calls for Part11.

## Changed files and review artifact

Changes confined to backend-go observability/middleware/query tracer/provider/
ingestion instrumentation and focused tests, backend-go README, ops/postgres
source/tooling/tests/README, alert policy, six runbooks, this report and permanent
archive target/exclusions. No public API/DB/security-contract changes.

`artifacts/production-part-11-review.tar.gz` via permanent
`production-part-11` target. Excludes real env/known credentials/DB dumps/
encrypted artifacts/private keys/keyrings/dependencies/build/test/binaries/
temporary workspaces. **Archive verification PASS: 386 safe regular members;
all archived source/report bytes match current files.** Redacted scan includes
explicit backup URL/password privately plus known app credentials/private-key/
PGP/age-identity/Gemini/JWT patterns: PASS. Tracked-tree scan PASS (362 files).
No real env, credentials, backup/dump/keyring, compiled binary or build/test output.
Final diff --check PASS; protected backend/frontend/contracts/Prisma diff empty;
go.mod/go.sum unchanged; HEAD=origin remains PART11_BASE_SHA.

### External-review archive completeness correction

Runtime/recovery content received owner review PASS. The previous 385-member
archive passed safety/byte-match checks but omitted the existing safe
docs/runbooks/secret-rotation.md because of the generic secret-* exclusion.
Added an exception for **that exact relative path only**; all other secret-*/
credentials exclusions remain intact. Runbook content was not rewritten.
All six runbooks are now explicitly checked for inclusion and byte-match, and
rotation links from the alert policy, redis-down and ops/postgres README resolve.
Archive syntax/diff/safe-members/secret scan rerun; full Go/Nest/Docker matrix
not repeated for this docs/archive-only correction. No runtime/DB changes.

**READY_FOR_EXTERNAL_REVIEW. No commit/push. Stop; no next Part.**
