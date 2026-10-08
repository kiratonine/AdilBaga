# Production Part 00 — Aktau Market / AdilBaga

Status: **READY_FOR_EXTERNAL_REVIEW**. Updated: 2026-10-03.

## A. Goal and scope

Integrate the Next frontend while preserving the NestJS reference backend and
old Vite frontend; establish real-data baselines and a verified rollback backup.
Root AGENTS.md, Production Part 00, production roadmap, technical specification,
risks/decisions, frontend worklog, Next migration plan and API contracts were read.
No Go, brand rename, production deploy, DB seed/migration/schema change or push.

## B. Branch baseline

`rtk git fetch origin --prune`: PASS; source SHAs were rechecked on this run.

| Ref | SHA |
| --- | --- |
| Local / origin integrate/full-stack before | 400f23bccdf54031fd05f5526a11d4e247294b94 |
| origin/main | 37fdf7cfcbc13a02ea43aa97c7a727b96189c4e2 |
| origin/feat/frontend | 80abf2f9ce28b0ec4eb61c79b77b5c03e83fdf32 |
| Integration/frontend merge base | 7a5a5a9df4c10ebc876a029e11eb418509217e66 |
| Final local HEAD | 37fdf7cfcbc13a02ea43aa97c7a727b96189c4e2 |
| Pending MERGE_HEAD | 80abf2f9ce28b0ec4eb61c79b77b5c03e83fdf32 |

Before integration: main divergence 0/2; frontend divergence 23/44.
Local safety tag `hackathon-final-37fdf7c` points to origin/main; not pushed.

### Initial CRLF blocker — resolved

The previous run correctly stopped with 174 dirty tracked files. This run
rechecked all 173 files other than `.gitignore` BEFORE restoration: after
CRLF → LF their bytes exactly matched HEAD, with zero substantive content diffs.
Only these verified files were restored via scoped `git restore --worktree`.
Index entries for identical files were refreshed; no content was staged by this
refresh. No blind conversion, renormalization, reset, clean, stash or rebase.

`.gitignore` now uses LF and preserves intentional `Presentation/`.
Added root `.gitattributes` with text=auto/eol=lf and requested binary exceptions.
Local `core.autocrlf=false`, `core.eol=lf` were already configured and retained.
Roadmap and existing report were preserved. Cleanup `rtk git diff --check`: PASS.
Only owner-approved intentional files remained before branch integration.

## C. Merge result

- `rtk git merge --ff-only origin/main`: PASS, fast-forward; main had the same tree.
- Frontend preflight: additions only in Next/frontend docs; no backend/data changes.
- `rtk git merge --no-commit --no-ff origin/feat/frontend`: PASS, no conflicts.
  `--no-commit` preserves the owner's explicit no-commit instruction.
- Merge remains pending for review, with 151 staged frontend/Next/docs files.
- Both `frontend/` and `frontend-next/` preserved; README and brand not rewritten.
- `git diff HEAD --name-only -- backend data frontend`: empty.
  Backend runtime, Prisma schema, dataset and old frontend are unchanged.
- pnpm automatically added a packageManager field to the new Next package during
  installation; this incidental change was removed to preserve the source branch.

## D. Backend baseline

| Executed command (backend/) | Result |
| --- | --- |
| `rtk pnpm install --frozen-lockfile` | PASS |
| `rtk pnpm db:generate` | PASS, Prisma 5.22.0 |
| `rtk pnpm build` | PASS |
| `rtk pnpm test` | PASS, 24/24, 0 failed |
| `rtk pnpm test:matching` | PASS, 34/34 |
| `rtk pnpm test:audit` | PASS, 52/52 |
| `rtk pnpm db:verify` | PASS, real Supabase read-only |

Prisma CLI skill was used only as generate guidance; existing Prisma 5 setup was
preserved. No Prisma 7 migration/configuration or database mutation was introduced.
The audit's location fixture covers 12 points; actual DB/HTTP counts confirm 15.
Its printed production-ready verdict is NOT this Part's production verdict.

| Entity | Real Supabase count |
| --- | ---: |
| Store | 3 |
| StoreLocation | 15 |
| Category | 6 |
| RawProduct | 863 |
| CanonicalProduct | 849 |
| ProductMapping | 863 |
| Offer | 863 |

Counts match the current canonical snapshot/baseline. Matched across stores: 14.
Runtime `.env` was loaded without printing values; DATA_SOURCE was not fixture.

## E. Real API baseline

NestJS was built and started on :3000 against Supabase. All GET responses below
were HTTP 200 and JSON/shape PASS; no simulation or fixture adapter.

| Endpoint | Verification |
| --- | --- |
| `/api/categories` | Exactly bread/eggs/milk/oil/other/sugar |
| `/api/categories/milk/filters` | Real volumeMl/fatPercent/brand schema |
| `/api/products?sort=price_asc&limit=10` | 10 products; cheapest-first; offers sorted ASC; minPrice recomputed correctly; imageUrl/attributes/category/snapshotAt present |
| `/api/products/:id` | Real ID from preceding list; matching product detail |
| `/api/dashboard` | 849 canonical, 3 stores, 14 matched, 15 locations; baskets PASS |

Dashboard snapshotAt: `2026-09-26T11:36:05.102Z`.
All baskets contain milk/sugar/oil, totals equal found-item price sums:

| Store | Total, KZT | Missing positions |
| --- | ---: | --- |
| DINA | 2230 | none |
| DANA | 1963 | none |
| FIX_PRICE | 2050 | none |

## F. Voice baseline

Real POST `/api/voice/start` and `/api/voice/continue`: HTTP 201, PASS.
Used fixed synthetic test coordinates, not personal location; payloads not logged.

- Direct: result/single, one item, nonempty speech; real DB product
  `Молоко Мумуня ТБА 3.2% 1 л`, 627 KZT; address matches dashboard locations.
- Clarification: needs_clarification/sessionId/missingFields PASS.
- Continue with missing attributes: result/single/one item PASS.
- Reusing completed session: HTTP 404, confirming session deletion.
- Upstash URL/token configured; actual runtime uses Upstash adapter. The above
  clarification exercised real session set/get/delete, not in-memory fallback.
- Physical Siri: PENDING OWNER.

`rtk pnpm test:gemini-keys` completed with exit 1:

| Key name | Result | HTTP class |
| --- | --- | --- |
| GEMINI_API_KEY | PASS | unavailable from existing safe script |
| GEMINI_API_KEY2 | PASS | unavailable from existing safe script |
| GEMINI_API_KEY3 | FAIL | unavailable from existing safe script |

Historical first-run result above; superseded by the continuation below.
No provider bodies or keys printed. Existing script catches provider details and
reports only PASS/FAIL. No speculative retry: a transient 503 was not established.
Voice PASS alone does not establish which NLP key/fallback handled each request.

### Gemini key3 correction — resolved

Continuation live smoke made exactly one new generate request per configured key,
using the same JSON-only health request as the existing safe script. It printed
only env name, HTTP status, allowlisted provider enum and PASS/FAIL. Results:

| Key name | Generate HTTP status | Provider status | Result |
| --- | ---: | --- | --- |
| GEMINI_API_KEY | 200 | OK | PASS |
| GEMINI_API_KEY2 | 200 | OK | PASS |
| GEMINI_API_KEY3 | 200 | OK | PASS |

Key3 blocker resolved independently of voice failover. No models diagnostic or
additional retry was needed because the first new key3 request passed. No key,
headers, provider body or .env value printed; no key rotation or code change.

## G. Next baseline

Next 16.3.8, pnpm frozen lockfile; checks used installed Node v24.10.0.

| Check | Actual result |
| --- | --- |
| Install frozen lockfile | PASS |
| First `rtk pnpm typecheck` | FAIL: RTK substituted direct tsc, skipping next typegen; 13 missing global-type errors |
| `rtk proxy pnpm typecheck` | PASS: actual next typegen + tsc --noEmit |
| `rtk proxy pnpm lint` | PASS, 0 errors |
| Default unit command | FAIL: 150 tests passed / 28 files, 5 fork-worker startup timeouts |
| Unit retry, threads/maxWorkers=1/no-isolate, mock env | FAIL: 10 tests passed / 2 files, 1 worker startup timeout |
| Unit retry, forks/maxWorkers=1/no-isolate, mock env | INTERRUPTED after backup restore stop condition; not PASS |
| Continuation: native WSL full unit suite, forks/maxWorkers=1/no-isolate, mock env | PASS, 165 tests / 33 files, 0 failed, 0 worker startup timeouts |
| HTTP production build | PASS against real NestJS |
| Real SSR/SEO HTML smoke | PASS |
| Existing Next E2E, continuation | PASS, mock E2E: 47 passed / 3 skipped / 0 failed |
| Mock build, continuation | PASS, performed by existing Playwright webServer command |

Build/start explicitly received NEXT_PUBLIC_API_MODE=http and public/server API
base URLs for local :3000, with NEXT_PUBLIC_SITE_URL for local :3100. No frontend
`.env` was created. RTK passthrough was necessary to execute the complete typecheck
package script and oxlint instead of RTK's command substitutions.

SSR checks: `/` HTTP 307; `/ru/catalog`, `/kk/catalog`, `/ru/dashboard`, real
`/ru/products/:id` and `/kk/products/:id`, filtered milk category, robots.txt and
sitemap.xml HTTP 200. Product HTML contains actual milk name/627 KZT in Product
AggregateOffer JSON-LD, breadcrumbs, title, canonical and ru/kk/x-default
hreflang. Catalog/dashboard HTML uses real dataset; known mock name/ID absent.
Sitemap includes actual product in both languages and excludes search.
Robots references the explicitly configured local sitemap.

### Next tests — native WSL filesystem correction

Owner-authorized temporary test workspace:
`/home/denis/tmp/aktau-market-part00-e4UgM8/frontend-next`.
Copied current source without node_modules/.next/coverage/Playwright outputs,
generated next-env.d.ts or real .env files. Runtime repo remained on /mnt/d.
Compared 141 copied source files byte-for-byte: zero substantive differences.
Package scripts/dependencies match; only pnpm's incidental packageManager field
was added in the temporary workspace. Repository package/config/dependencies
were not modified. Native frozen-lockfile install PASS.

Executed with Node v24.10.0:

```text
NEXT_PUBLIC_API_MODE=mock rtk pnpm test --pool=forks --maxWorkers=1 --no-isolate
```

165 tests / 33 files PASS in 20.66s; zero failures and worker startup timeouts.
The /mnt/d startup failures are a filesystem/environment limitation, not assertion
failures. No timeout or dependency/config changes; diagnostic threads rerun was
unnecessary after full forks PASS.

### E2E — existing mock suite

Executed in the native workspace:

```text
PW_CHANNEL=chrome NEXT_PUBLIC_API_MODE=mock NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 rtk pnpm test:e2e
```

The existing config performed its own mock production build and start on :3100.
Result: 47 passed, 3 platform-specific skips, 0 failed (50 scheduled; 28.6s).
Projects: desktop and iPhone viewport. Covered mock SSR/SEO, catalog/category
filters/product/navigation/search/dashboard map and relevant console checks.
This is **mock E2E**, not real HTTP E2E or physical-iPhone Siri verification.
Server emitted known `destination stream closed early` messages while tests
remained green; retained as an observed non-gating diagnostic, not suppressed.
Prior real NestJS/Next HTTP/SSR baseline remains separately PASS and was not rerun.

## H. Backup correction

### Historical raw all-schema Supabase archive

Private directory (outside repo):

`/home/denis/.local/share/aktau-market/backups/part00/2026-10-03T14-06-55-491Z`

- Server: PostgreSQL 17.6; pg_dump client: 17.10.
- schema.sql: PASS.
- full.dump: RAW_ALL_SCHEMA_ARCHIVE — file created, restore not verified;
  custom format, 659586 bytes, all schemas, not public-only.
- metadata.txt: timestamp/server version/counts/main+integration SHAs only.
- Backup parent/directory permissions: 700; backup files: 600.
- Counts before/after dump: equal for all 46 non-system tables.
- Actual disposable restore: **FAIL**.

Used `supabase/postgres:17.6.1.054` to provide existing Supabase extensions,
including supabase_vault, instead of incompatible plain PostgreSQL. Container
`adilbaga-part00-restore` had no network/public ports, a generated private local
password, and a read-only mount of the backup. Created empty template0 DB and ran:

`pg_restore -U postgres --dbname=part00_restore --no-owner --no-acl --exit-on-error /backup/full.dump`

Exact failure, redacted:

```text
pg_restore: error: could not execute query:
ERROR: permission denied to set parameter "log_min_messages"
```

The raw dump includes Supabase-managed/internal objects/settings, not just the
portable application schema. Its pg_restore did NOT complete; it is not a
portable application restore PASS artifact. The continuation corrects the backup
scope, rather than elevating restore roles or suppressing errors.
Restored counts comparison and canonical+offers query: NOT RUN. No backup PASS
is inferred from file existence. Part 00 section 27 requires immediate STOP on
restore failure; no attempts to suppress/ignore restore errors or change live DB.
Disposable container and its anonymous volumes removed: PASS. Backup retained.
NestJS and Next processes started by this run were stopped; ports 3000/3100 freed.
Pre-existing `solarch-postgres` container was not touched.

### Portable application public-schema backup — PASS

Continuation read-only query confirmed application scope: exactly the seven
Prisma tables in public, no application tables outside public. Non-system tables
outside public belong to managed auth/realtime/storage/vault schemas and are
excluded, along with all other internal schemas. No application dependencies on
these managed schemas were needed to restore the public application.

Supabase-aware CLI was unavailable; used the authorized PostgreSQL pg_dump
fallback (server 17.6, client 17.10: matching major). Credentials read in memory
from DIRECT_URL and passed through libpq environment, never printed. Every live
session enforced `default_transaction_read_only=on` through session PGOPTIONS.

In the same private directory:

- `app-public.dump`: PASS, custom-format full application backup (304536 bytes),
  `--schema=public --no-owner --no-acl`.
- `app-public-schema.sql`: PASS, schema-only with the same schema/owner/ACL options.
- `metadata-app-public.json`: safe scope/version/timestamp/counts only.
- `APPLICATION_RESTORE_VERIFICATION.json`: safe restore/count/semantic evidence.
- `RAW_ALL_SCHEMA_ARCHIVE.txt`: labels the retained original full.dump/schema.sql
  as raw, restore not verified. Original raw artifacts not deleted or overwritten.
- Directory 700; portable backup files and private metadata/verification 600.

Live counts before and after portable dump were identical:

| Application table | Live before | Live after | Restored local |
| --- | ---: | ---: | ---: |
| stores | 3 | 3 | 3 |
| store_locations | 15 | 15 | 15 |
| categories | 6 | 6 | 6 |
| raw_products | 863 | 863 | 863 |
| canonical_products | 849 | 849 | 849 |
| product_mappings | 863 | 863 | 863 |
| offers | 863 | 863 | 863 |

### Local application restore — PASS

New disposable `adilbaga-part00-public-restore`, plain `postgres:17-alpine`
(17.11), no public ports, network=none, read-only backup mount, newly generated
local password. No production credentials supplied to the container and no
role elevation. Fresh template0 DB; removed only its empty default public schema
before the archive recreated it (the TOC explicitly contains SCHEMA public).

`pg_restore --dbname=part00_app --no-owner --no-acl --exit-on-error app-public.dump`
inside that local container: **exit 0**. No errors ignored, no extensions guessed
or added, no migration/seed run. Only public restored; seven LIVE → LOCAL counts
equal. Read-only semantic join canonical product + category + offer + store:
863 joined usable offers, 6 categories, 3 stores — PASS.

Disposable container and its volumes removed after PASS. Backup retained outside
repo. **No production schema/data mutation occurred**; Supabase read/backup only.
This portable application backup, not the unverified raw all-schema archive,
satisfies the owner-corrected Part 00 restore gate.

## I. Redacted secret/config audit

- Tracked env files: only backend/frontend/frontend-next `.env.example`; no real env.
- Current tracked source + pending merged files: zero findings for tested patterns.
- Git history: 719 reachable blobs scanned from all refs; zero findings for
  known local credentials/passwords, Google keys, JWTs, private keys, GitHub/AWS
  tokens and non-placeholder/nonlocal credentialed PostgreSQL URLs.
- Dedicated scanner unavailable. This is a **bounded known-pattern/value scan**,
  NOT a full entropy-based secret-history audit; no full-scan PASS claim.
- Local env values stayed in memory. Diagnostics used a temporary redacting
  wrapper where existing scripts could print raw errors; no secret values reported.
- Audit does not prove absence of every unknown provider-specific secret format.

## J. External integrations inventory

| Configuration | Status |
| --- | --- |
| DATABASE_URL / DIRECT_URL | configured |
| GEMINI_API_KEY / GEMINI_API_KEY2 / GEMINI_API_KEY3 | configured |
| GEMINI_MODEL | configured |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | configured |
| NEXT_PUBLIC_API_MODE | configured for command-only HTTP baseline |
| NEXT_PUBLIC_API_BASE_URL / API_BASE_URL | configured for command-only HTTP baseline |
| NEXT_PUBLIC_SITE_URL | configured for command-only local baseline |
| Cloudflare | NOT CONFIGURED in this Part; no configuration created |
| Production hosting/deploy configuration | not applicable to this local Part |

Configured does not imply all Gemini keys healthy or production infrastructure ready.

## K. Confirmed production debts — not fixed here

- NestJS unrestricted `app.enableCors()`; application logger disabled.
- Missing Upstash config falls back to memory voice sessions.
- Product limit has no maximum; voice text lacks production length bound.
- Catalog filtering/sorting partly in application memory; dashboard recomputed
  from product set; fixture paths remain opt-in for tests.
- Next mocks and default URLs remain available; HTTP build currently depends on
  API availability for catalog/dashboard/sitemap; Part 01 must harden these.
- Physical-device Siri still pending. /mnt/d unit-worker startup issue remains
  environment-specific; unchanged-source native WSL full suite now PASS.

## L. Rotation required before production cutover

- [ ] Supabase database/runtime credentials
- [ ] Supabase migration/admin credentials
- [ ] Gemini key 1
- [ ] Gemini key 2
- [ ] Gemini key 3
- [ ] Upstash Redis credentials
- [ ] hosting/deploy tokens
- [ ] Cloudflare API/Tunnel credentials

No external credentials rotated by this run.

## M. Changed files and integration impact

Pending merge: `frontend-next/**`, frontend worklog, Next migration plan and
frontend design docs (151 staged files). Local changes: `.gitignore`, new
`.gitattributes`, existing production roadmap/report, `scripts/create-clean-archive.mjs`.
Archive script now has permanent `production-part-00` target and excludes
Presentation, backup directories, `.dump` files and generated ignored
`next-env.d.ts` alongside existing exclusions.
No API/DTO/backend/data/old-frontend changes. Separate pnpm packages retained.
No commit/push; branch ahead of origin by the two existing main commits only.

## N. Remaining blockers and archive status

Historical blockers resolved by the owner-authorized continuation:
portable public backup/restore/count/semantic gate PASS; native WSL full Next
unit suite PASS; existing mock E2E PASS; key3 new live HTTP 200 PASS.
Raw all-schema restore remains unverified and is NOT the application PASS artifact.

Earlier Backend build/tests/matching/audit, Supabase db:verify, real GET API,
voice direct/clarification/Upstash, Next HTTP build/real SSR and bounded secret
scan PASS are retained: backend/data/old frontend/Next functional source unchanged.
No repeats of unchanged PASS gates or production DB mutations.

Archive rebuilt: `artifacts/production-part-00-review.tar.gz` via the permanent
`production-part-00` collector. Verification PASS: 333 files; both frontend
packages, backend, roadmap, archive script and current report included. Zero
forbidden paths or known local credential hits; zero tested Google-key/JWT/
private-key patterns. Real .env, DB dumps/backup directories, dependencies,
builds/caches/Playwright outputs and generated ignored next-env.d.ts excluded.
Only the three package .env.example files included. Archived report byte-matches
the working report. Disposable container/Next server cleaned up; :3000/:3100 free.
Physical Siri and pre-production secret rotation remain owner/future production
gates, not claimed PASS. No move to Part 01, commit or push.

## O. Status

**READY_FOR_EXTERNAL_REVIEW** — corrected portable application backup restore,
seven count comparisons, semantic join, full native WSL Next unit suite, existing
mock E2E, all three live Gemini keys and clean archive PASS. Previously verified
real HTTP/voice/SSR and Backend gates preserved. Production DB read-only; no
runtime/schema/data changes, commit, push, deploy or transition to Part 01.
Frontend merge remains intentionally pending for owner/external review.
