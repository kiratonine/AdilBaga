# Post-SCRUM-7 integration audit + local rebaseline

Status: **READY_FOR_EXTERNAL_REVIEW**.

## Baseline and scope

- Accepted base / local HEAD / fetched `origin/integrate/full-stack`: `d3f3d409a81e706d23bb57978cd5b08dec7d6d3d`.
- Branch: `integrate/full-stack`; working tree was clean after the authorized fast-forward. No reset, rebase, commit or push.
- Public GitHub Actions run `37473383928` independently checked for this exact SHA: completed/success. Security, Go Quality, Frontend, Nest Reference, Contracts, Pipeline Quality, PostgreSQL Integration, Ephemeral Staging and CI Gate all completed/success. This evidence covers the committed baseline, not the new uncommitted tests.
- PR #5 merge: `8383f3369f5d702ab984d46737d23354b3210607`. PR #6 merge: accepted base above.
- This task audits already merged behavior; it does not implement categories/sugar again or optimize ingestion further.
- Owner explicitly authorized transient local-only roles/grants for the existing disposable loopback PostgreSQL 17 harness. All migration/setup/test writes were confined to newly owned disposable databases. No production credentials, database, API, Redis or Gemini were accessed.

## PR #5 audit

`backend-go/internal/postgres/categories.go` uses the existing `snapshotReader` helper, which pins the latest published snapshot (`publishedAt DESC, id DESC`) in a read-only repeatable-read transaction. Category visibility uses `EXISTS` over canonical products and offers with that snapshot ID, `inStock=true` and `price>0`; result order is `slug ASC`.

`backend/src/database/prisma-category.repository.ts` uses the existing `withPublishedSnapshot` and `usableOffer` helpers. Its category predicate is `canonicalProducts.some.offers.some` with the same usable/current snapshot conditions; ordering and the `id/slug/name` DTO projection match Go. Neither implementation deletes legacy categories or falls back to old offers.

Dashboard slot configuration in Go and Nest already agrees: `categorySlug=sugar`, `categoryName=Сахар`, exact `weightGrams=1000`. Existing frontend mock data already uses the new label, so no frontend fixture changes were needed.

Frozen OpenAPI and `API_V1_CONTRACT.md` describe category DTO/order, not an unconditional list of every database row. No contradictory all-rows wording was found. Paths, statuses, DTOs, examples and frozen contract sources remain unchanged.

### Missing explicit coverage added

- Nest repository query-shape tests assert published snapshot selection/tie-break, repeatable-read isolation, current usable offer predicate, slug order, DTO projection and fail-closed behavior without a published snapshot.
- A test-only INSERT overlay adds current usable categories, previous-snapshot-only, unpublished-only, out-of-stock, zero-price, negative-price and empty legacy `other` cases. The previous snapshot has a deliberately newer `startedAt` and offer timestamp, but older `publishedAt`.
- `TestLocalCategoryVisibilityParity` checks actual local Go and Nest HTTP responses against the same exact ordered list; verifies hidden cases, retained legacy row, and all three store basket sugar labels. Its explicit loopback/fixture guard and exact-ID cleanup prevent runtime/production fallback.
- Existing Go catalog and Nest dashboard HTTP tests now explicitly assert the sugar slug/label.

## PR #6 batching audit

The commit range `8383f3369f5d702ab984d46737d23354b3210607..d3f3d409a81e706d23bb57978cd5b08dec7d6d3d` changes only `backend-go/internal/ingestion/ingestor.go` (+53/-6).

- SQL statements and argument order are unchanged; `pgx.Batch` groups ordered statements in batches of 500 with an explicit final tail flush.
- Every result must affect exactly one row; statement, affected-row and batch-close errors propagate. Results are drained/closed and the batch is reset.
- Batches use the existing transaction, not pool-level writes. Stage and Publish remain separate transactions as before. Stage flushes before its commit; Publish flushes before the publication status flip/commit. Existing rollback/error/unlock handling is retained.
- No schema, role, HTTP contract or ingestion matching/dictionary behavior changes were introduced by the optimization.

New unit tests prove empty batch handling, 500+1 boundaries, exact SQL/argument order, tail drain/close/reset and fail-closed statement/close/affected-row errors. `TestLocalTxBatchAtomicity` executes 500+tail real statements on disposable PG17, proves a dependent write sees preceding statements, then proves a tail uniqueness failure and rollback leave zero rows from earlier flushed batches. Both successful and failing test transactions are rolled back.

**External production-history claim:** PR #6's description says a previous production `-recluster -apply` attempt timed out and rolled back. This report records that claim only as externally supplied history; no production access was used to verify it.

production mutation history from PR #6 was NOT independently verified.

## Changed files in this task

- `backend-go/internal/ingestion/ingestor_batch_test.go`
- `backend-go/internal/ingestion/ingestor_batch_integration_test.go`
- `backend-go/tests/fixtures/category-visibility.sql`
- `backend-go/tests/integration/category_visibility_parity_test.go`
- `backend-go/tests/integration/catalog_test.go`
- `backend/test/prisma-category.test.ts`
- `backend/test/catalog.test.ts`
- `scripts/ci/run-db-integration.mjs`: invoke the guarded local batching integration test.
- `scripts/ci/run-ephemeral-staging.mjs`: invoke category visibility and existing Voice parity tests with explicit local fixture targets.
- `scripts/create-clean-archive.mjs`: permanent `post-scrum-7` review archive target; existing exclusions unchanged.
- This report.

Runtime Go/Nest sources, frontend, Pipeline, Prisma/schema/migrations/security artifacts, snapshots/dictionary, ingestion runtime and frozen contracts were not modified. The NestJS review followed the repository-boundary/transaction/testing guidance of `nestjs-best-practices`; it required tests, not an architecture rewrite.

## Executed local gates

Commands used Node 24.10.0, Go 1.27.1, frozen pnpm installs and the existing sanitized CI helpers; supported operator commands used RTK. No private application/operator env was loaded.

| Gate | Actual result |
| --- | --- |
| `node scripts/ci/run-checks.mjs go` after test additions | PASS: gofmt, tidy/no module drift, mod verify, full unit and race suites, vet, staticcheck normal + integration, govulncheck, API/ingest builds |
| Nest frozen install/generate/build/test/audit | PASS; after additions build + test rerun: 27/27, 0 failed; production dependency audit no known vulnerabilities |
| `node scripts/ci/run-checks.mjs pipeline` | PASS: frozen install, 19 files / 96 tests, typecheck |
| `node scripts/ci/run-checks.mjs contracts` | PASS: lint + offline tests, 12 passed / 10 HTTP tests skipped as intended without a server |
| Frontend frozen install/typecheck/lint | PASS |
| Frontend full mock unit suite on native WSL copy | PASS: 35 files / 182 tests, 0 failed; byte-identical source proof for 146 copied source/config files |
| Frontend production dependency audit + HTTP production build | PASS; no known vulnerabilities |
| Frontend existing mock Playwright E2E, Chrome desktop + iPhone viewport | PASS (exit 0); mock mode, not live production evidence |
| `node scripts/ci/run-db-integration.mjs` | PASS: fresh PG17, final TCP readiness, all four checked-in migrations, deterministic catalog, bootstrap/security guards, reader/writer least privilege + guarded rollback, batch atomicity under race, physical read-only pool policy, query plans and observability regressions |
| `node scripts/ci/run-ephemeral-staging.mjs` on native WSL copy | PASS; byte-identical proof for 349 copied source/config files across backend/backend-go/frontend/contracts/scripts |
| Local Go/Nest `TestLocalCategoryVisibilityParity` | PASS: current usable visible; old-only/unpublished/out-of-stock/zero/negative/empty-other hidden; slug ASC; legacy row retained; sugar label parity |
| Local `TestHTTPParity` | PASS: exact categories, all 4 usable fixture products in all 3 sorts, pagination/detail, discovery/dynamic filters, 10 search/wildcard/injection cases and dashboard |
| Local security-query + Content-Type parity | PASS, including encoded semicolon and Go-only noncanonical raw-semicolon rejection; malformed inputs 400, JSON charset/legacy form 201 |
| Local `TestLocalVoiceParity` | PASS: direct cheapest/search, numeric strings, clarification/continue, category/intent/incomplete input, empty result, errors and privacy proof; deterministic fallback/test sessions, no real providers |
| Frozen GET contract profile against Go and Nest | PASS independently: 18 passed / 4 Voice-profile tests intentionally skipped per server; separate Voice parity above executed |
| Next real HTTP E2E against local Go + fixture PG17 | PASS: 12/12; desktop + iPhone viewport; catalog/search/filter/sort/product detail/SSR metadata/JSON-LD/dashboard/map/404/sitemap/robots |
| Docker build/runtime regression | PASS: healthy, UID10001, compiler absent, CA present, read-only rootfs, GET smoke, private metrics 404; DB outage live200/ready503, recovery ready200 without API restart |
| Security helper + synthetic backup guards | PASS; no real backup/production interaction |
| Modified harness syntax checks + `git diff --check` | PASS |

### Environment attempts retained

The first frontend unit run on `/mnt/d` passed 10 tests before worker-startup timeout; there were no assertion failures. The unchanged full suite then passed on a native-WSL copy. No dependencies, timeout or production config were changed to hide the environment issue.

The first mounted-path ephemeral run stopped at the existing 60s Nest readiness gate, before HTTP parity, and cleaned its owned resources. An isolated fresh local Nest startup subsequently passed without source changes; the full unchanged-budget staging flow then passed in native WSL. The initial startup failure is not presented as a semantic/API defect.

The passing mock E2E process emitted nonfatal Next destination-stream-closed warnings during navigation. This is not a claim of warning-free server logs; no functional assertion failed.

## Evidence boundary and remaining production blockers

- The full SCRUM-7 prepared bundle `data/sync/bundle.json` is not present locally. No scraper, external store pipeline or production mutation was used to recreate it. Rebaseline proves deterministic fixtures on the current merged migration chain/tooling: 7 canonical fixture rows, 4 usable products, 2 visible categories, 3 stores and 2 locations before the acceptance overlay.
- A complete representative SCRUM-7 dataset ingestion/reclustering/publication and production rollout are **NOT RUN** by this task. The new batch test proves actual SQL order/rollback across the batch boundary, not a claim of full representative ingestion throughput or all-data publication.
- Production rollout/remediation requires separately authorized reviewed DB/snapshot/security gates. Backend2 subsequently reports that rollout already occurred (see handoff below); this report neither authorizes nor independently confirms those production mutations.
- Physical Siri/iPhone, real Gemini/Upstash, public domain/VPS/Cloudflare and traffic cutover are outside this local audit scope.
- All owned disposable containers/networks/processes were cleaned after the successful flow. No production DB access, migrations, ingest, roles/grants, HTTP requests or infrastructure changes were performed by **THIS task**. No commit/push.

## Subsequent external production handoff

After this local audit, Backend2 separately provided `SCRUM-7_PROD_ROLLOUT_REPORT_FOR_DENIS.md`. According to that external handoff, production rollout **already occurred**: an ingest LOGIN was created, the taxonomy migration was applied, the first `-recluster -apply` attempt timed out/rolled back, and a second attempt after PR #6 succeeded and published a new snapshot. Backend2 also reports a subsequent strict dry-run with `newCanonicalCount=0`.

These are attributed external reports, **not independently verified evidence**. **THIS task did not access or verify production**, and its local audit/rebaseline remains fixture-based. The owner reports external review PASS for the regression tests/harness; that does not establish production state or security.

Production remediation now required under separate authorization/review:

- Credential rotation.
- A fresh encrypted backup of the current production state, with disposable restore proof.
- Restricted runtime identity and API read-only verification.
- Investigation of the reported RLS state on `_prisma_migrations`.

No automatic rollback is recommended. **No further production writes are authorized** by this task or this handoff documentation correction. No remediation was executed here; the previous local evidence and production-history verification limitations are retained.

## Review archive

`artifacts/post-scrum-7-integration-review.tar.gz` is built from the current candidate through the permanent `post-scrum-7` target. It includes the report and new regression tests; production credentials, private env, backups, dependencies, build/test outputs and temporary workspaces are excluded.

Stop for external review.
