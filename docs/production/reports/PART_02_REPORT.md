# Production Part 02 — API Contract Freeze + OpenAPI

Status: **READY_FOR_EXTERNAL_REVIEW**. Updated: 2026-10-03.

## A. Goal

Freeze API v1 before Go rewrite, preserving NestJS/Next/Siri behavior except the
two explicitly approved pagination/baskets clarifications. Exactly seven existing
endpoints; no /api/v1, Go, deploy, brand rename or database change.

## B. Baseline

Branch: `integrate/full-stack`; initial working tree clean; fetch PASS.

| Ref | Rechecked SHA |
| --- | --- |
| Local HEAD, unchanged throughout | 06c08ebb6ecc541daf158ea1c55b6d2089815bc7 |
| origin/integrate/full-stack | e8342da7184b7dd0e1be821ce742c56a3d0977f7 |

Divergence 1/0. Owner explicitly authorized continuation from this clean local
HEAD despite the Part's normal HEAD=origin gate. No synchronization/merge/reset/
rebase was performed. Root ignored AGENTS.md is the current production version
(correct branch, production roadmap, DB safety, Part 02 freeze, Go after review);
not modified/staged. The stale hackathon AGENTS blocker is resolved by the owner.

Read roadmap, Parts 00/01 reports and TODO/PRODUCTION_PART_02.md; inspected actual
catalog/voice contracts, HTTP parser/controllers/DTOs/create-app, fixture and Prisma
repositories/mappers, dashboard calculator, voice/NLP/session implementation,
frontend types/http adapter/consumers/SEO and real HTTP E2E before drafting.
Skills: NestJS best practices for minimal existing parser validation; Prisma CLI
for client generation only, preserving Prisma 5 (no migration/upgrade).

## C. Contract decisions

- Public products default limit 24, minimum 1, maximum 100; 101 returns 400.
  Offset default 0. Existing frontend uses 24; sitemap 100; detail has no list
  pagination. No current consumer requiring >100 or unbounded HTTP was found.
- Dashboard baskets required in OpenAPI and backend/frontend TS; runtime already
  returns them, including real Supabase. Internal dashboard/voice repositories
  remain unrestricted by the public HTTP parser.
- No other observable tightening or new fields/bounds. Request coordinate strings
  remain compatible; IDs/sessionId remain opaque. No DB/repository/NLP rewrite.

## D. OpenAPI

`contracts/openapi.yaml`: OpenAPI 3.1.0, Aktau Market API 1.0.0.
Exactly GET categories/filters/products/detail/dashboard, POST voice start/continue.
DTO fields/nullability, store enum, sorting/ties, usable offers/minPrice/snapshotAt,
dynamic repeated filters (OR same key / AND across keys), required baskets,
voice 201 discriminated union and cardinality are documented.
400/404/500/503 compatible envelope; 429 explicitly reserved, not implemented.
No speculative fields, mandatory code/requestId, new path prefix or cache policy.
Existing implicit framework ETag is not frozen as a new application cache contract.

Pinned Redocly CLI 2.57.0, standalone pnpm package/lockfile; recommended rules and
invalid schema/media examples enabled. No invented API license. Lint: PASS,
zero errors/warnings. AJV 2020/formats validate external JSON examples separately.

## E. Examples

Seven stable files: categories, filters, products, product, dashboard,
voice-start-result, voice-clarification. Captured from explicit existing fixtures,
NOT production dumps. Synthetic coordinates; clearly marked fixture addresses;
illustrative opaque session replaces the generated token. All schema checks PASS.
Examples are linked from OpenAPI; no real credentials or personal coordinates.

## F. Reference backend changes

Only HTTP parser default/max limit, required DashboardDto.baskets and minimal
pagination tests. No controller, repository, provider, schema or dataset changes.
External review also synchronizes FilterDefinitionDto/FilterDto as discriminated
TS unions with required multi-select options; no emitted runtime logic change.
Frontend baskets required; unused speculative PriceSpread fields/StoreLocation.id
removed. Offer.inStock? retained as an explicitly non-wire mock/SEO extension:
existing structured-data logic/tests use it; API v1 does not expose/guarantee it.

## G. Contract tests

Initial-submission results below are retained; external-review rerun results are
recorded in the correction section before the final status.

Node built-in black-box tests with CONTRACT_API_BASE_URL; schema validation via
pinned AJV, not a custom OpenAPI validator. Same suite reusable against Go.

| contracts/ command | Actual result |
| --- | --- |
| `rtk pnpm install --frozen-lockfile` | PASS after initial pinned install generated lockfile |
| `rtk pnpm lint` | PASS |
| `rtk pnpm test` | 11 PASS, 10 HTTP checks skipped without base URL, 0 failures |
| `CONTRACT_API_BASE_URL=http://127.0.0.1:3001 rtk pnpm test:fixture` | 21/21 PASS, 0 skips/failures |
| `CONTRACT_API_BASE_URL=http://127.0.0.1:3000 rtk pnpm test:live` | 17 PASS, 4 fixture-only voice checks skipped, 0 failures |

Fixture: exact GET examples, pagination, sorting, OR/AND filters, invalid queries,
detail/errors, baskets/null totals; voice direct/list/empty/clarification/continue,
deleted and unknown opaque sessions, coordinate strings and invalid DTOs.
Live: all discovered schemas/options (including brand outside attributes), known
matching products not silently dropped, default page 24, accepted 100, rejected
101, all sorts, search/detail, required baskets and 400/404 envelope.

During development, one NEW test mistakenly assumed fallback NLP understood
“2 литра”; it correctly returned clarification. Corrected the test to the existing
supported no-match query “500 мл 3.2%”. No NLP/backend behavior change or regression;
final fixture run 21/21. First draft lint found an unquoted YAML comma; corrected,
final lint PASS. Failed draft checks are not represented as initial PASS.

Live safe counts: 6 categories, 849 usable canonical products, 3 stores,
14 matched across stores, 15 locations, 3 baskets. SnapshotAt
`2026-09-26T11:36:05.102Z`. Basket totals KZT: DINA 2230, DANA 1963,
FIX_PRICE 2050; no missing positions. These are observations, not hardcoded suite
assumptions. SnapshotAt format checked; max-offer semantics preserved in unchanged
mapper (offer timestamps are not exposed in the wire DTO).

## H. Backend regression

Executed in backend/, Node v24.10.0, existing pnpm lockfile:

| Command | Result |
| --- | --- |
| `rtk pnpm install --frozen-lockfile` | PASS |
| `rtk pnpm db:generate` | PASS, Prisma Client 5.22.0; no DB write |
| `rtk pnpm build` | PASS |
| `rtk pnpm test` | 25/25 PASS |
| `rtk pnpm test:matching` | 34/34 PASS |
| `rtk pnpm test:audit` | 52/52 PASS |

Audit uses historical 12-location fixture; live dashboard confirms 15. Its printed
“production-ready” verdict is not a launch approval from this Part.

## I. Frontend regression

Initial-submission results below are retained; the review-fix rerun used native
WSL for unit tests after a mounted-filesystem worker-start timeout (see below).

Executed in frontend/ on /mnt/d, Node v24.10.0:

| Command | Result |
| --- | --- |
| `rtk proxy pnpm typecheck` with explicit HTTP/site config | PASS |
| `rtk proxy pnpm lint` | PASS, oxlint |
| `NEXT_PUBLIC_API_MODE=mock rtk pnpm test --pool=forks --maxWorkers=1 --no-isolate` | 179 tests / 34 files PASS, 0 failures/timeouts |
| `PW_CHANNEL=chrome rtk proxy pnpm test:e2e` | Mock E2E 47 PASS, 3 platform skips, 0 failures |
| `E2E_API=http ... PW_CHANNEL=chrome rtk proxy pnpm test:e2e` | Real HTTP E2E 12/12 PASS, 0 skips/failures |

HTTP environment explicitly set public/server API origin http://127.0.0.1:3000,
mode=http and site=http://localhost:3100; no frontend env file. Both Playwright
runs independently built/started Next in their respective modes: build PASS.
Real suite covered desktop+iPhone viewport, actual categories/products/search/
dynamic filters/sort/detail/dashboard/baskets/map, ru/kk SSR metadata/JSON-LD,
sitemap/robots and real 404s, with no collected browser console/page errors.
No native WSL copy or timeout/dependency hack was needed this run. Unit output
contained known jsdom navigation diagnostics; mock server observed known
“destination stream closed early” diagnostics with all assertions green.

## J. Database safety

**Supabase READ ONLY.** Live profile is GET-only and rejects POST internally.
Next real HTTP E2E also performs GET only. No migration, db push, seed, import,
parser, pipeline, INSERT/UPDATE/DELETE/DDL; no `.env` edits or printed credentials.
Voice contract POST checks used isolated fixture runtime without Gemini keys,
Upstash credentials or Prisma. Live provider/physical Siri calls were not repeated.
Owner-started/pre-existing services untouched; only this run's :3000/:3001 API
processes stopped after checks; Playwright cleaned up its :3100 server.

## K. Changed files and archive

- `contracts/`: spec, README, package/lock, Redocly config, seven examples, tests.
- `backend/src/catalog/product-query.ts`, `backend/src/contracts/catalog.ts`,
  `backend/test/catalog.test.ts`.
- `frontend/src/api/types.ts`; no functional UI/config/dependency change.
- External-review correction additionally annotates malformed fixtures in
  `frontend/src/lib/filterParams.test.ts` and
  `frontend/src/components/catalog/DynamicFilters.test.tsx`; assertions retained.
- `README.md` links and pagination documentation.
- `docs/production/API_V1_CONTRACT.md`, this report.
- `scripts/create-clean-archive.mjs`: permanent `production-part-02` target;
  ignored AGENTS_backup.md additionally excluded, existing hygiene retained.

Archive: `artifacts/production-part-02-review.tar.gz`.
Initial-submission archive verification PASS: 269 files, required backend,
frontend, contracts and this report present; archived report byte-matches working
copy. Zero forbidden paths, zero known local credential hits, zero tested Google
key/JWT/private-key patterns. Only backend/frontend .env.example included; no real
.env, DB dumps/backups, AGENTS_backup.md, dependencies, generated next-env.d.ts,
.next/dist/build, caches, Playwright outputs, TODO, .git or artifacts themselves.
Final `rtk git diff --check`: PASS; HEAD unchanged, no staged files/commit/push.

## L. Remaining limitations

No live dependency fault injection; 429/500/503 envelopes checked offline, with
503 existing voice paths documented. No claim of implemented rate limiting or
complete security hardening. Numeric-string coordinate bounds need runtime
conversion/range validation; JSON Schema cannot bound the numeric value of strings.
Physical Siri remains PENDING OWNER; live Gemini/Upstash baseline remains Part 00.
No launch/deploy readiness claim; future Go/security/credential rotation work is
outside Part 02. Archive scan is bounded known-value/pattern scanning, not a full
entropy/history security audit.

## M. Integration impact

Next catalog limit 24 and sitemap limit 100 remain compatible; required baskets
reflect existing responses. Siri path/status/coordinate/session semantics unchanged.
Future Go must pass the same wire/semantic suite, with no language-driven consumer
changes. Prisma schema/dataset/migration history/providers untouched. NestJS remains
reference. No commit, push, deploy, merge or transition to Part 03.

## External-review fixes — same Part 02

**Git provenance resolved.** Before any correction, ran the requested status,
show --stat, name-status diff and full diff for
`e8342da7184b7dd0e1be821ce742c56a3d0977f7..06c08ebb6ecc541daf158ea1c55b6d2089815bc7`.
Exact local-only commit message: **`feat(fix): Fix gitignore file`**.
Complete change: **`.gitignore` only, one insertion `AGENTS_backup.md`**, appended
after `Presentation/`; no deletion or other source/config/data changes.
Classified as intentional pre-Part02 local hygiene commit; retained unchanged.
Fetch/recheck again confirmed the same SHAs and divergence 1/0. Continuation
working tree contained the existing intentional uncommitted Part 02 work.
No reset/rebase/drop/merge/staging/commit/push was used.

First external review correctly found two overly broad schemas; this correction
does not erase that finding. Offset now has exact schema
`{type: integer, minimum: 0, maximum: 9007199254740991, default: 0}`. Offline exact
assertion and boundary validation PASS; `offset=9007199254740992` returns 400 in
fixture AND live GET profiles. Runtime parser was already correct and unchanged.
FilterDefinition is now oneOf MultiSelectFilterDefinition/BooleanFilterDefinition,
discriminated by type const. Multi-select requires options/minItems=1 with
string/number/boolean items; boolean does not require options. Current examples
PASS; missing or empty multi-select options FAIL validation as expected. Backend
and frontend TS require multi-select options. Two malformed frontend test inputs
use explicit casts, retaining their original defensive assertions. No new keys,
options, input bounds, response fields, paths or business/runtime behavior.

| Mandatory review-fix rerun | Result |
| --- | --- |
| contracts `rtk pnpm install --frozen-lockfile` | PASS |
| contracts `rtk pnpm lint` | PASS |
| contracts `rtk pnpm test` | 12 PASS, 10 HTTP skips, 0 failed |
| CONTRACT_API_BASE_URL=:3001 `rtk pnpm test:fixture` | 22/22 PASS |
| CONTRACT_API_BASE_URL=:3000 `rtk pnpm test:live` | 18 PASS, 4 fixture-only skips, 0 failed; GET-only |
| backend `rtk pnpm build` / `rtk pnpm test` | PASS / 25/25 PASS |
| backend `rtk pnpm test:matching` / `rtk pnpm test:audit` | 34/34 PASS / 52/52 PASS |
| frontend `rtk proxy pnpm typecheck` / `rtk proxy pnpm lint` | PASS / PASS |
| frontend mock unit suite on /mnt/d, forks/1 worker/no-isolate | 10 tests PASS, 1 worker-start timeout, exit 1; NOT full-suite PASS |
| byte-identical native-WSL mock unit suite, same command | 179 tests / 34 files PASS, 0 failures/timeouts, 20.42s |
| mock E2E, existing command/config | 47 PASS, 3 platform skips, 0 failed; Next build PASS |
| real HTTP E2E, existing explicit HTTP config | 12/12 PASS, no skips/errors; HTTP Next build PASS |

Native test workspace:
`/home/denis/tmp/aktau-market-part02-review-EVZOTS/frontend`.
Compared all 144 copied source files byte-for-byte: zero mismatches, including
package/lock/config. Frozen-lock install PASS; no secrets/generated outputs copied,
no dependency/config/timeout changes. Existing /mnt/d worker issue is recorded,
not hidden. E2E runs remained on /mnt/d, desktop+iPhone viewport; real SSR/SEO,
filters/dashboard/baskets/map and console assertions PASS. Live counts still
6 categories/849 canonical/3 stores/15 locations/3 baskets. Supabase remained
READ ONLY; no DB writes/migrations/seed/parser, provider or schema change.
Prisma repositories, voice/Gemini/Redis and dataset diff vs HEAD remain empty.
Owned API servers were stopped; Playwright stopped its server. HEAD unchanged.
Clean review-fix archive rebuilt via the permanent production-part-02 target:
269 files, required source/contracts/current report present, report byte-match
PASS. Zero excluded paths, known credential hits or tested secret-pattern hits.
Only safe backend/frontend .env.example included; no actual .env, credentials,
DB dumps/backups, node_modules, build/test artifacts or temporary workspaces.
Final diff --check PASS; no staging/commit/push, HEAD remains 06c08ebb6ecc541daf158ea1c55b6d2089815bc7.

## N. Status

**READY_FOR_EXTERNAL_REVIEW** — Git provenance fully understood; offset and
FilterDefinition corrections, all mandatory reruns and rebuilt clean archive
PASS. Supabase read-only; no commit/push/Go or transition to Part 03.
No Part 02 blockers remain. Physical Siri/production hardening remain future
owner/roadmap gates. Stopped for external review.
