# Production Part 10 — security baseline review

Status: **READY_FOR_EXTERNAL_REVIEW**.
Date: 2026-10-05. Review candidate only; no deploy/cutover approval.

## Provenance and boundaries

Initial fetch/prune, branch/status/SHA/parent checks PASS. Starting tree clean.
Branch `integrate/full-stack`; HEAD = origin =
`bd98670f5d617b4c4324037930c8643d70e9710a`; parent
`eb3fe34475d153803e0a81e550d3fce34ba0af01`.
No reset/rebase/merge/commit/push/tag. Root instructions and Part10 scope used.
Railway is retired and **no Railway command/action was performed**. No VPS,
Cloudflare, DNS, deploy, production traffic request or N+1 publication.
Production PostgreSQL used only for explicit read-only security/count metadata
audit; no production dump, DML/DDL/role/grant/migration/ingest action or write probe.
Existing env/production secrets unchanged. Destructive tests used only this
task's labelled disposable loopback PostgreSQL17; no inherited production URLs.

## Audit-first matrix and targeted changes

A private before-edit matrix recorded control, existing implementation/tests,
gap, severity and minimal affected files. The review is source-backed targeted
hardening, not an exhaustive/no-vulnerabilities certification.

| Control | Existing protection / evidence | Gap and action |
| --- | --- | --- |
| Config | Explicit environment, sanitized DB URL checks, strict production CORS/proxy/rate/model/provider validation | Retained; unit/race PASS |
| SQL | Parameterized values and JSON keys; category-schema filter allowlist; static sort switch | No SQL interpolation gap found; local quote/comment/encoded-semicolon attacks PASS |
| DB sessions | Lazy bounded pool4, connect2s, physical SET/SHOW read-only + statement5s | Added production-only physical identity gate, including reconnects |
| HTTP limits | Body1MiB/URI16KiB/header64KiB, bounded server/context timeouts, panic/safe errors | Retained; unit/race PASS |
| CORS/proxy | Exact origins, trusted-peer forwarding only, right-to-left XFF parsing | Retained; negative/spoofing tests PASS |
| Abuse | Bounded limiter maps/idle eviction, bounded voice semaphore, health exemption | Retained; outage/abuse/race tests PASS |
| Privacy | No body/query/header/provider payload logging | Removed exact client_ip; raw paths replaced by router templates/unmatched |
| Redis | REST command arrays, bounded timeout/body, TTL600, no memory runtime fallback | Raw session IDs were key material; now SHA256 namespaced fixed-size keys |
| Gemini | Fixed HTTPS endpoint, escaped/validated model, shared8s deadline, response1MiB, no redirects | Added explicit fake-provider redirect/body-bound/privacy proof; runtime unchanged |
| API headers | No security header middleware | Added nosniff/no-referrer outer middleware; no HSTS |
| Content-Type | Go previously decoded JSON regardless of media type | Reference-proven compatible parsing; JSON/charset + existing Nest forms; unsupported types400, not415 |
| Next browser | Explicit HTTP/site config, no poweredBy, self-hosted fonts | Added tested production CSP/headers; browser compatibility proof PASS |
| Container | Multistage/non-root10001/CA/healthcheck | Final-image Part10 local security smoke PASS |
| Supply chain | Pinned Go tools and existing pnpm lockfiles | govulncheck0; both production Node audits0; no dependency upgrade |
| Secrets | Existing exclusions/private env storage | Redacted tracked-tree scan PASS; archive scan described below |

The security-scan workflow's managed progress update was rejected as owned by
another continuation; no completed managed scan/report or independent-worker
result is claimed. Source review and verification evidence here are from this
session. Next guidance informed preservation of App Router hydration/inline CSS;
Prisma CLI guidance was used only for client generation, retaining Prisma5.22.0.

## Production DB fail-closed guard

`OpenProductionReadOnly` is selected only for APP_ENV=production. Each new physical
connection first establishes/validates the existing session policy, then validates
current_user=session_user=aktau_api_runtime, safe LOGIN/INHERIT/flags, safe reader
NOLOGIN group, reader USAGE, sole runtime parent, ADMIN=false/INHERIT=true/SET=false,
no reader parent, no SET-role escalation and no relation/schema/database ownership.
Driver/catalog details are not exposed. Failed identity connections are not
admitted. Pool creation remains lazy so a temporary outage does not kill liveness;
this is not a claim that every bad credential causes immediate process termination.
Development/test explicit local roles retain their existing behavior.

`TestLocalProductionIdentity` final PASS: four distinct physical connections,
read-only on/timeout5s, fresh connection after release, expected role accepted,
owner rejected, unsafe BYPASSRLS/CREATEROLE/NOINHERIT/SET/extra-parent/reader-parent/
ownership rejected, restored role accepted, local development role accepted.
The new test initially had a deferred cleanup panic from revisiting released pgx
handles; fixed by clearing released handles. Final selected test PASS0.28s;
assertions were not weakened. Earlier physical pool intact/omitted-startup profile
also PASS, independently proving SET/SHOW on four connections.

## Fresh production READ-ONLY audit — PASS

Audit sessions explicitly SET default_transaction_read_only=on, statement_timeout
5000, BEGIN READ ONLY. Accepted Part08R security metadata exact-match: RLS9/FORCE0,
23 policies = reader6 + writer17, safe reader/writer NOLOGIN flags, runtime safe
LOGIN and exact membership/anchors, no target ownership/direct runtime grants,
no write privileges. Restricted actual identity confirmed; reader USAGE=true,
SET=false, private3 SELECT privileges=false. Negative production writes not tried.
`aktau_ingest_runtime` absent. Prisma3 successful reviewed history/checksums verified
by SELECT only; no Prisma migration/status/deploy/resolve action.

| Table | Fresh count |
| --- | ---: |
| stores | 3 |
| store_locations | 15 |
| categories | 6 |
| raw_products | 863 |
| canonical_products | 849 |
| product_mappings | 863 |
| offers | 863 |
| snapshots | 1 |
| source_runs | 3 |
| _prisma_migrations | 3 |

No data/schema/security changes. No modified Go pool ran against production.

## LOCAL database and reference parity

Owned postgres:17-alpine, localhost-only bind, private disposable credentials.
Existing private backup restored locally with --no-owner/--no-acl/--exit-on-error;
exact checked-in migrations/security bootstrap executed LOCAL only, files unchanged.
Clone counts: stores3/locations15/categories6/raw863/canonical849/offers863.
One local unpublished synthetic snapshot supports composite-FK denial tests;
it is not a production publication. No parser/store-site fetch or production seed.

Full tagged fixture profile PASS. Local reader private3/DML/DDL denial, writer17/
reader6/RLS9 matrix and snapshot constraint profile PASS. Clone restricted-role
security, read-only session, repository smoke, query-plan profiles PASS.
Local reference uses byte-identical compiled NestJS, explicit restricted local DB
and disabled production provider credentials; no real env copied.

`TestHTTPParity` PASS: all849 products in price_asc/price_desc/name_asc, six category
filters, typed dynamic filters/detail, all ten existing search cases, dashboard
and error cases. `TestLocalVoiceParity` and high-entropy privacy proof PASS, with
test-only session state. Frozen GET black-box profile PASS against both local Go
and local NestJS. This successful matrix does **not** hide the additional failed
adversarial wire case below.

### Content-Type reference proof — PASS

Both local servers: no Content-Type400, text/plain400, JSON body labelled form400,
malformed JSON400, application/json;charset=utf-8 direct Voice201, valid encoded
form201. Successful Voice response parity exact. Go keeps the established envelope;
no415/new DTO bounds/UUID condition. Query values are not merged into form bodies.
Existing tests now explicitly label their JSON fixtures, preserving their original
outage/abuse/error assertions. Initial missing-header test failures were corrected
at the test-request construction, not by relaxing decoder validation.

## Previous BLOCKED history: expanded adversarial wire proof

`TestLocalSecurityQueryParity` fails only at `raw_semicolon_reference_wire`:

```text
GET /api/products?search=a;b
NestJS: 200, []
Go:     400, compatible ApiError
```

Encoded semicolon injection, quoted injection, SQL comment, unknown filter and
repeated pagination cases PASS. Encoding the same literal `a;b` as `a%3Bb` yields
200/[] in both servers. No SQL injection/execution was demonstrated.
The unchanged Go products handler calls url.ParseQuery and returns400 on its
unescaped-semicolon error. The reference accepts that representation. Products
handler/query parser and NestJS are byte-identical to the immutable baseline:
this is a **pre-existing edge mismatch, not caused by Part10 hardening**.

Frozen query serialization is form-encoded (reserved characters normally escaped),
but full reference-wire equivalence for the broader accepted representation cannot
be claimed. Per parity/contract STOP boundary, no ad-hoc business query parser or
OpenAPI modification was made. External review must decide whether to authorize
a narrow Nest-compatible query-decoding fix or explicitly accept this transport
edge outside the frozen encoded protocol. The failed test is retained, not hidden,
skipped or weakened. That run stopped BLOCKED pending that decision.

### External review decision and resume — RESOLVED

Owner explicitly rejected weakening the Go query parser. Canonical v1 query
serialization percent-encodes reserved characters: literal `a;b` is sent as
`search=a%3Bb`. Raw `search=a;b` is outside canonical transport and Go may reject
it with 400. This adds no search bound or DTO semantics. API_V1_CONTRACT now
states that rule; OpenAPI explicitly sets the existing default `allowReserved:
false` for search. `backend-go/internal/httpapi/product_query.go` is unchanged.

The test now asserts six canonical/error NestJS↔Go cases, including literal
`a%3Bb` and encoded semicolon injection; all PASS. A separate Go-only subtest
requires raw `a;b` to return compatible JSON 400 and PASSes; no NestJS parity
claim is made for that noncanonical transport. Prior failed evidence above is
retained rather than relabelled PASS. Fresh fetch again confirmed HEAD=origin=
`bd98670f5d617b4c4324037930c8643d70e9710a`; only understood Part10 changes present.

## Next/browser proof

Production policy: default self; object none; base self; frame-ancestors none;
form-action self; connect self + configured public API origin; fonts self; images
only committed dataset origins and a/b/c OSM tile origins plus self/data. Broken
example.invalid image origin is allowed only under explicit test-mock opt-in.
No unsafe-eval, no generic HTTPS/script wildcard. Inline script exception is needed
for App Router flight/bootstrap; inline styles for existing inlineCss and Leaflet
positioning. Nonce/render-cache redesign is deferred, not claimed implemented.
nosniff/no-referrer/DENY/Permissions-Policy deny camera/microphone/geolocation/
payment/usb. **HSTS = DEFERRED TO PART14/15 AFTER HTTPS PASS**.

Byte-identical native WSL copy proof PASS145 source files; frozen install PASS.
/mnt/d unit attempt failed worker-startup timeout, not an assertion; native WSL
full suite PASS35 files/182 tests. No dependency/timeout hack.
Native typecheck/lint PASS. An initial typegen command wrongly supplied mock without
test opt-in; corrected command uses explicit HTTP config, without source changes.
Native HTTP production build against local NestJS PASS. Chrome HTTP smoke PASS
ru/kk/catalog/dashboard/detail: headers, no poweredBy/HSTS, hydration, loaded
self-hosted fonts, 15 Leaflet markers/loaded OSM tiles, product image/null fallback,
zero CSP violations and zero console errors. Image/tile bytes were intercepted at
the actual committed origins: proves CSP compatibility, **not live provider uptime**.
Planned real-domain production build = **N/A**, as explicitly decided by owner:
VPS/domain are not provisioned. Local HTTP production build was rerun and PASS;
it is not mislabelled as a real-domain deployment/build. No frontend deployment.

## Commands and actual gates

Commands use RTK/proxy, Go1.27.1/GOTOOLCHAIN=local and Node24.10.0; pnpm auto-pin
disabled. No dependency graph drift; transient Corepack-added packageManager was
reverted to the original frontend package bytes, not retained as an unrelated edit.

| Gate | Actual result |
| --- | --- |
| gofmt / go mod tidy / verify | PASS, no module/sum change |
| go test -count=1 ./... | PASS |
| go test -race ./... | PASS |
| go vet ./... | PASS |
| pinned staticcheck normal + integration-tagged | PASS, final candidate rerun |
| pinned govulncheck ./... | PASS0, No vulnerabilities found |
| go build cmd/api + cmd/ingest | PASS, outputs outside repo; ingest never executed |
| explicit tagged fixture/local clone/security/pool/plans profiles | PASS |
| LOCAL 849×3 GET/dashboard/Voice parity | PASS existing matrix |
| LOCAL Content-Type parity | PASS6 cases |
| LOCAL canonical security-query parity + Go-only raw rejection | PASS6 NestJS↔Go cases + Go-only compatible JSON400 |
| NestJS db:generate/build/test | PASS;25 tests,25 passed,0 failed |
| contracts lint/test | PASS; offline12 pass; HTTP10 honestly skipped in offline command |
| frozen GET black-box on local Go and NestJS | PASS separately |
| fixture Voice black-box profile | NOT RUN; Voice covered by separate local parity, not relabelled fixture black-box PASS |
| backend pnpm audit --prod | PASS,0 advisories |
| frontend pnpm audit --prod | PASS,0 advisories |
| frontend native typecheck/lint/unit/local HTTP build | PASS;35 files/182 tests |
| browser/security-header smoke | PASS; limitations above |
| planned real-domain production build | N/A; no VPS/domain provisioned, per owner decision |
| tracked-tree redacted secret scan | PASS353 tracked files |

Earlier Part10 Docker smoke PASS: image9eed45cd4436, production profile with **local**
restricted API identity, UID/GID10001/CA/no compiler, healthy/read-only rootfs,
tmpfs rw,noexec,nosuid, cap-dropALL/no-new-privileges, GET/headers, DB down live200/
ready503 and recovery same PID; SIGTERM exit0 in373ms; no image credentials.
After adding reader-parent/ownership guard, final image e8c3f860a20a build PASS.
Final-image smoke was initially NOT RUN after parity STOP; the earlier smoke was
not substituted for complete acceptance. After the external decision, Docker
build and full smoke were rerun on final image
`sha256:e8c3f860a20acbb3a0610d8419fddd9149781c9481b987a88c9728d7483ee50f`:
**PASS**. Production config uses only LOCAL restricted identity/PG17, UID/GID10001,
no compiler, CA present, healthy, read-only rootfs, tmpfs rw/noexec/nosuid,
cap-drop ALL/no-new-privileges, successful health/catalog/products/dashboard and
security headers. DB down live200/ready503, recovery ready200 with same API PID.
SIGTERM exit0 in427ms. No credentials in image history/config; no provider calls.

### Final rerun evidence

All final commands actually rerun after the reviewed clarification: tidy/verify,
unit `-count=1`, race `-count=1`, vet, normal+integration staticcheck, govulncheck0,
gofmt and api/ingest builds outside repo. Full tagged fixture suite and split
clone/security/physical-pool/query-plan profiles PASS. Identity guard PASS0.34s
including four connections, reconnect and seven unsafe-role cases. HTTP parity
again covered849×3, six filters, details, ten searches and dashboard; deterministic
Voice/privacy parity PASS. Content-Type parity PASS6 cases. Contracts lint/offline
12 tests PASS (10 HTTP cases intentionally skipped offline); separate GET profile
PASS against each LOCAL server. Nest build/test PASS25/25; db:generate PASS5.22.0,
using nonconnecting placeholder env, no schema change. Both pnpm production audits
rerun:0 advisories. Native byte-identical frontend typecheck/lint/unit PASS35 files,
182 tests; explicit local HTTP production build and browser smoke rerun PASS.
No real Gemini/Redis call required for this fake-provider security review.

## Source protection, cleanup and follow-ups

No changes to backend/, Prisma schema/migrations/security SQL, prepared dataset,
Go repositories, frontend package/lock or Go modules. The only approved contract
edits clarify canonical reserved-character percent-encoding (documentation plus
explicit existing `allowReserved: false`); no DTO/schema fields/bounds changed.
Changed groups: Go API pool selection, pool identity guard/tests, middleware
privacy/headers/tests, Redis digest/tests, Gemini security tests, Voice media decoder
and HTTP tests, two integration parity probes; Next config/header helper/tests;
root/Go README; permanent archive target; this report. No auth/business DTO fields.
README now accurately records backend local-only, future VPS/immutable Go container,
VPS/domain not provisioned, Railway retired, Go frozen-v1 business parity already
implemented and NestJS reference until reviewed cutover. No traffic ownership,
vendor/IP/live-domain claim.

Final docs-only review correction: removed the two remaining outdated public
frontend/backend claims in root README (working features and completed roadmap).
They now describe the local end-to-end flow. Planned future domains remain planned,
not provisioned. Runtime/security code, contracts and tests unchanged in this
correction; completed final test gates above were preserved, not rerun. Clean
archive rebuilt and safe-members/byte-match/redacted secret checks repeated.

Only task-owned local processes, container/network and anonymous volumes removed;
unrelated Docker resources untouched. Private source copies/evidence/old backup stay
outside repo, never archived. No production cleanup/password rotation or secret write.
Part12: automate proven checks/secret scan and dependency/image security maintenance;
no CI system implemented here. Part14/15: actual domain/proxy/TLS deployment, HSTS
after HTTPS verification, credential lifecycle and optional reviewed CSP nonce plan.
No next Part started.

## Review archive

Permanent target `production-part-10`:
`artifacts/production-part-10-review.tar.gz`.
Review candidate only, not a deploy artifact or external security acceptance.
Excludes real env/credentials/DB backups/dependencies/build/test output/generated
files/Go binaries/private workspaces/Railway config. Verification recorded after
rebuild: safe regular members, current report/source byte-match, redacted known-value
and private-key/Gemini/JWT scan. No unreviewed business parser fix included.

Actual archive verification **PASS363 files**: all regular safe members and every
archived source/report byte matched; no real env, known credentials, private keys,
DB backup, compiled ELF/dependency/build/test output. Final diff --check PASS;
HEAD/origin still exact immutable baseline. Owned listening ports free and only
the pre-existing unrelated Docker containers remain. This does not resolve the
historical wire-parity finding: that finding was resolved by explicit external
review of canonical transport, not by parser relaxation.

**READY_FOR_EXTERNAL_REVIEW — stopped; no commit/push/deploy/cutover/N+1.**
