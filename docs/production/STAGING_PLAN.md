# Staging and CD boundary

**Persistent staging NOT PROVISIONED.** Local development only; Railway retired;
VPS/domain/Cloudflare not provisioned. No provider/host/domain is selected here.

Part12 candidate rehearses only disposable local services: fresh PostgreSQL17,
reviewed reader bootstrap, Prisma `migrate deploy` for all checked-in migrations,
existing small catalog SQL fixture, restricted job-local API login, local Go GET
API and local Next HTTP Playwright suite. Each DB helper owns its container and
derives a literal loopback port; no caller-supplied production target or URL fallback.
Readiness polls the final TCP server and verifies TCP SELECT 1 before bootstrap;
resources are namespaced. Local Phase A rehearsal is PASS: HTTP/security/Content-Type
parity, frozen GET contracts on Go/Nest, HTTP Playwright and Docker outage/recovery.
This is not a persistent staging deployment or GitHub Actions PASS claim.

Only ephemeral staging applies `scripts/ci/fixtures/voice-parity-overlay.sql` through
the owned local admin SQL helper after loading the shared fixture. It adds milk
fatPercent discovery option3.2 and p1 numeric fatPercent3.2; SQL fail-closed checks
also require unchanged numeric volumeMl1000. IDs/prices/offers are untouched.
`run-db-integration.mjs` retains the original shared fixture without the overlay.
The explicit test-only Voice1000/1000 rate profile prevents Content-Type test traffic
from exhausting the production2/4 defaults; runtime/limiter/assertions are unchanged.
All earlier blockers and actual rerun results remain in the Part12 report.

Go runs a test profile for staging GET flows with real local SQL and no configured
external Gemini/Upstash. Production validation is not weakened. Existing Go unit
fakes cover Voice/provider/session/privacy/outage/abuse; real provider calls never
belong in PR CI. The small SQL fixture is not the Nest contract example fixture
or the 849-product production dataset. Local GET contract profile uses the existing
`test:live` name but connects **only to loopback CI APIs**.

Full production-shaped local 849×3 parity, complete Voice parity, dashboard clone
plan and ingestion publication/lifecycle profiles remain manual release gates:
their explicit dataset/role preconditions are not replaced by claimed small-fixture
PASS. They must use an independently approved representative local clone, not
production in Actions. No parser/store scrape, prepared real dataset seed, N+1,
ingest apply, production credentials, Redis memory runtime fallback or deploy.

Future persistent staging requires separate DB, Redis, API, frontend and credentials;
no production provider secret reuse or production data mutation. Any future schema/
data change: representative approved backup/fixture → disposable/staging migration
→ integration/parity → external review → explicitly authorized production rollout.
Normal migration strategy is forward-only: backup, tested forward migration,
compatible app, reviewed forward-fix. Destructive recovery uses reviewed restore
or migration-specific recovery, not invented generic down migrations/history edits.

Existing migration bytes are immutable. CI must prove the complete fresh chain and
no post-test checksum/source drift. Review changes to an accepted migration as a
STOP condition; new migrations need representative-clone proof in addition to fresh
CI. Security selects `CI_BASE_SHA` from the trusted GitHub event JSON: PR base.sha,
push before; workflow_dispatch uses no fabricated base and retains local drift
checks. Values are validated hex and passed through GITHUB_ENV/environment, never
interpolated as shell text. Security checkout keeps fetch-depth=0.

CD is deferred: reviewed immutable green SHA + built image is an input to future
VPS deployment procedures, **not auto-deploy main**. Phase B activation needs the
owner's separate commit/push and actual CI Gate PASS before branch protections.
