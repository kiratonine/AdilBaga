# Production Part15 — Go API deployment

Status: **READY_FOR_EXTERNAL_REVIEW**.

Current source-review outcome: approved minimal x/text v0.39.0 → v0.41.0
remediation PASS. Pinned govulncheck exits0, no vulnerabilities found; full Go
unit/race/vet/staticcheck and Part15 verifier PASS. No unrelated dependency drift.
Accepted compact/targeted Gemini, model candidate and graceful Voice degradation
remain unchanged. This is NOT deployment/public cutover acceptance: new immutable
image and hosted CI still follow external review and owner commit/push.
VPS zero-application state left untouched; Part16+ NOT STARTED.

## Preserved finalization security BLOCKED checkpoint

Previous blocker: **PART15_FINAL_GOVULNCHECK_GO_2026_6629**. Application-level
graceful degradation tests PASS; the owner has superseded provider-perfect
availability as a launch gate. Mandatory govulncheck exits3: reachable
GO-2026-6629 in selected golang.org/x/text v0.39.0, fixed v0.41.0 according to
the scanner. No dependency upgrade/suppression attempted in this scoped run.
Compact/targeted NLP is preserved; Go model candidate is gemini-3.5-flash-lite.
This is source review only: no new image/build/deploy/cutover; VPS zero-application
state left untouched, Part16+ NOT STARTED. See finalization evidence at the end.

## Preserved previous source-review BLOCKED checkpoint

Previous blocker: **PART15_GEMINI35_COMPLETE_INPUT_TIMEOUT8S**. Targeted
clarification source remediation and local tests PASS, with strict validation
unchanged. Required new complete-input3.5 live prerequisite: genuine success2/10,
timeout8, invalid_output0, fallback8. Targeted filter/intent/category live gates
NOT RUN after this prerequisite FAIL. Model default/production configuration
unchanged. No tuning/retry. The earlier accepted complete-input10/10 and all
historical clarification/image/readiness failures remain preserved below;
they are not substituted for this current gate result. No cause/model-defect claim.
Portable artifact identity and restricted VPS readiness retain external PASS for
the previous immutable image. The changed runtime is NOT built/deployed/accepted.
Public cutover was not performed; cloudflared remains stopped with no API container.
Part16+ NOT STARTED. See the same-report remediation evidence at the end.

## Preserved initial BLOCKED checkpoint

Initial primary blocker: **PART15_IMAGE_ID_COMPARISON_FAILED**. Exact-image-ID equality
required by Gate L was not met across the local legacy store and VPS OCI store.
Secondary failed gate: initial VPS `/health/ready` returned503; cause unverified.
No public traffic activation. Application rolled back to zero-application state;
cloudflared intentionally inactive. Part16+ NOT STARTED.

## Immutable release / hosted CI

- Branch integrate/full-stack; fetch/prune PASS, initial tree clean.
- `PART15_RELEASE_SHA=695f7e34871879d32edff24c1775f9eb2d2f4e92`.
- HEAD=origin at preflight; commit `feat(prod): activate Cloudflare network perimeter`.
- GitHub [CI run37626094525](https://github.com/kiratonine/AdilBaga/actions/runs/37626094525)
  independently queried through public GitHub API: exact SHA, completed/success.
- All9 jobs completed/success: Contracts112808104866; Frontend112808105334;
  Go Quality112808105311; Security112808105326; Nest Reference112808105519;
  Pipeline Quality112808105343; PostgreSQL Integration112808458390;
  Ephemeral Staging112808911272; CI Gate112809953618.
- Git diff from accepted pre-infrastructure b5ef421... to release SHA: no delta
  in Prisma schema/migrations or Go PostgreSQL layer. Migration action: NONE.
  Accepted Part11 and post-SCRUM-7 encrypted backup/restore reports present.
  No owner connection/new backup was used for this read-only API rollout.

## Perimeter PRE / release artifact

Fresh VPS deploy SSH PASS; Docker/cloudflared active/enabled; UFW incoming/routed
deny with SSH only. No8080 listener or application containers. Public health
before deployment returned502 with cf-ray, expected absent origin.

No approved private registry was found in repository deployment/CI configuration;
used explicitly authorized single-VPS docker save → encrypted SSH → docker load,
not a new registry/token. Source built only on WSL, not VPS. Export via git archive
of exact SHA; all93 backend-go files verified against committed Git blob hashes.
Docker build --pull completed; base manifests recorded by build:
Go1.27.1-alpine sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414;
Alpine3.24 sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6.
No secrets/build arguments; SHA tag and OCI revision label exact release SHA.
User10001:10001, entrypoint /usr/local/bin/api. No latest tag.

Local image ID:
`sha256:6dd0ba30cf7948e1029b635d102e00e4891b3a00938a981fa2f0d5e7c692c04a`.
VPS inspect image ID:
`sha256:4012c19f2d0a41bbe3d66e2b6bdb77cc76d59246a6d97feb2fdc326e3b93811c`.

## Private configuration / local exact-image smoke

Existing API-only credential and existing Gemini/Upstash configuration loaded
privately, not owner/ingest credentials. API username validated; transaction
pooler6543 rejected; Upstash HTTPS validated; Gemini model remains
gemini-3.1-flash-lite. Runtime keys/providers/timeouts/business source unchanged.
Private local env outside repo0700 directory/file0600. No DIRECT_URL,
BACKUP_DATABASE_URL, owner/ingest URL, perimeter or SSH secret in runtime env.

Exact image local production profile: loopback18080, non-root/read-only root,
tmpfs16MiB/noexec/nosuid, drop ALL/no-new-privileges. live200/ready200; readiness
exercised committed production DB identity/session guard. Categories9, products
limit3 returned3; dashboard summary canonicalProducts3083/stores3/matched268.
All data reads used restricted aktau_api_runtime; no fixture fallback.

Voice direct201/result/single/one item with real price/address/distance PASS.
Incomplete start201/clarification then continue201/result/single PASS.
Actual Upstash safe logs show set/get/delete success. Session token held only
in helper memory, not report/files/logs. Bounded privacy log check PASS.

All3 full-production-context NLP calls timed out at the unchanged8s budget and
used approved deterministic fallback. This is NOT Gemini success evidence.
The temporary smoke helper initially demanded a provider-success class from
these particular calls and exited1 after otherwise successful Voice/session
checks. That assertion was stricter than the TODO's allowed timeout/fallback
behavior; it was not interpreted as a runtime business defect.
Separate committed `TestLiveGeminiStructuredParse` against real Gemini from WSL:
**PASS,6.48s,outcomes=[success]**, independently validated structure/no fallback,
same8s production budget/model/keys. No timeout/model/schema/credential change.
Local preflight container stopped/removed; exact release image retained.

## VPS assembly / mandatory STOP and rollback

Installed reviewed secret-free compose; /opt/adilbaga root0755, compose0644;
/etc/adilbaga root0700, api.env root0600 via stdin, release.env root0600 SHA image
reference only. Production defaults20/40, Voice2/4/concurrency4; CORS exact
https://aktau.market; trust initially empty. No env/DSN/provider value printed.
Cloudflared stopped BEFORE first container start; public origin never opened.

**Execution sequencing error disclosed:** the combined SSH command printed the
loaded image ID and started compose without first enforcing local/VPS equality
as an aborting assertion. On reading the unequal ID, further cutover stopped.
The temporary container reached healthy/live200, UID10001 and rootfs write
denial PASS, restart0. Initial ready GET returned503, stopping that probe command;
catalog/dashboard on VPS after that were NOT RUN. No readiness repair attempted.
This is not an accepted deployment or a completed Gate L/N.

Immediate first-deploy rollback: cloudflared kept inactive; compose down removed
application container/network;8080 listener absent, Docker active. Verified
image/private env retained for external review; no secrets removed/rotated.
Public API intentionally unavailable while Tunnel is stopped. No public smoke,
measured peer, proxy setting, Go traffic activation or10-minute observation PASS.

Read-only artifact diagnostics: revision label and all3 rootfs diff IDs match;
VPS ID equals OCI descriptor digest/mediaType application/vnd.oci.image.manifest.v1+json.
The VPS docker-save manifest's config digest equals the local image ID
(**PASS**, saved config digest exactly6dd0ba30... as above). These support a config-digest versus OCI
manifest-digest representation difference, not established source corruption.
However the literal Gate L `.Id` equality requirement was not waived or marked
PASS. Local Docker29.1.3 uses legacy builder; VPS Docker29.8.2 uses OCI descriptor.
Required next scope: external review of artifact identity verification semantics,
then independently diagnose VPS readiness with the restricted credential only.
No daemon/storage change, image rewriting or runtime hot-fix was performed.

## Repository deliverables / safety

Compose/operator runbook and focused static verifier/negative tests describe
approved private deployment, not proof of a healthy live application. Runbooks
record installed paths, first-release zero-state rollback and future image model.
Part14 history remains preserved. Full Go quality matrix not rerun: runtime
unchanged and exact release hosted CI already PASS. Final offline/archive checks
are recorded below; they do not override failed live gates.

DB mutation: NONE. Migration: NONE. Ingestion/snapshot: NONE.
Production PostgreSQL: Supabase, restricted reads only. Upstash writes limited
to own transient synthetic clarification session, deleted on completion.
No owner/ingest fallback, DB role/grant/security change, frontend deployment,
scheduler, HSTS activation, Part16+, commit or push. No physical Siri claim.
STOP for external review; status remains BLOCKED.

## Final local checks / acceptance boundary

Part15 static verifier **PASS**, tests **20/20 PASS**; syntax checks and
`git diff --check` PASS. Runtime/source/contracts/data/Prisma diff empty. No
new full Go matrix claimed: current immutable hosted CI covers unchanged source.
Permanent production-part-15 target and bounded safe-member/source/report
byte-match/secret checks are used for this BLOCKED review artifact. It contains
source/docs only, never the operational image/private env/keys/provider credentials.
Initial archive verification **PASS507 safe regular unique members**, source/report
byte-match and bounded secret scan PASS. Actual current private credential/endpoint
scan of all12 candidate files PASS (no values printed). Owned immutable source
export removed; both exact operational images/private runtime config retained
outside Git. Final evidence included by rebuilding/verifying again. Protected runtime stays
unchanged; no further live tests after rollback.

Gates O–W (measured peer, trust/recreate, VPS Voice, traffic activation, edge
catalog/CORS/Voice, running-API isolation and stability observation): **NOT RUN**.
No frontend or physical Siri verification; no claim that Part15 acceptance passed.
Recovery scope requires external review first; do not automatically resume deploy.

## External-review resume — portable Gate L correction

Same candidate, no restart/rebuild. Fetch/prune reconfirmed
HEAD=origin=`695f7e34871879d32edff24c1775f9eb2d2f4e92`; only known Part15 candidate
files changed. Hosted run37626094525 independently re-queried: exact SHA,
completed/success. Runtime, frozen contracts, data and Prisma source unchanged.

External review supersedes future literal local/VPS `.Id` equality. Different
config/OCI manifest identifiers above remain historical facts, not a current
artifact-corruption finding. New acceptance requires one save file, exact
transport checksum BEFORE load, revision/OS/arch/User/entrypoint, RootFS diff IDs
and API binary checksum. The original sequencing error remains disclosed above.

ONE `docker save` archive was produced from the existing exact image, not a new
build. Local and VPS file SHA-256, enforced equal BEFORE `docker load`:
`fd3e0689bd9d6ad441f43096dfcc2a16e7fd26586f2493e18d649cb937e66185`.
Loaded revision equals release SHA; linux/amd64; User10001:10001;
entrypoint `/usr/local/bin/api`; all3 RootFS diff IDs equal:

- `sha256:74d97c428c51a828f9051a7a40a53ff1fc99e54fc30323ce36760701b0b7f711`
- `sha256:176fc170553f5111a7b3a7065f859a30f04dd613dad5c9aa5f6b9b1e43c935c4`
- `sha256:fdc3da5835f561fd9beb07c3f0492154a2dbcf8e5aaf3986e7c5ae5799c3d696`

Local/VPS `/usr/local/bin/api` SHA-256 equal:
`68049fa90ba510d6bae50c4a7170f5938329d5a40173523d7a1923578d8236c9`.
**Portable Gate L PASS; former identity blocker RESOLVED.** Operational tar
outside repository, never in review archive. No daemon/storage conversion.

## External-review resume — restricted readiness diagnosis

Before runtime changes, private byte comparison proved the local production
env used for ready200 and VPS runtime env exactly identical. Contents and
secret-material hashes withheld. Cloudflared stayed stopped throughout.

Diagnostic PostgreSQL17 client ran on VPS Docker using ONLY the existing
aktau_api_runtime credential: DNS PASS, TCP PASS, fresh PostgreSQL authentication
PASS; current_user/session_user both expected restricted identity PASS;
explicit session read-only and5s statement policy PASS; exact committed Go
production-identity metadata predicate PASS. No owner/ingest URL, grants/schema
changes or DML probe. Private diagnostic env removed after the test.

Verified exact image started with the approved compose. Bounded readiness
polling budget30s: attempt1 returned **200 ready**, elapsed1.97s/request1972ms.
No subsequent polling necessary. live200, Docker healthy/running/restart0,
UID/GID10001, root filesystem write denial PASS.
**Current readiness gate PASS; prior isolated cold503 blocker RESOLVED.**
Cause of the old single cold503 was not independently established; no timeout,
runtime configuration or security hot-fix was made to obtain this PASS.

## External-review resume — genuine application Gemini launch gate

Small-schema `TestLiveGeminiStructuredParse` above remains compatibility evidence
only. It does NOT satisfy the stricter full-production-context launch gate.
The earlier interpretation allowing primary fallback is superseded by external
review; the previous three timeout calls remain historical evidence.

Three bounded, sequential synthetic direct Voice requests were sent to the
actual VPS application while cloudflared was stopped. Each used the unchanged
application-loaded production categories/filter context, existing model/keys,
prompt/schema and8s NLP timeout. No isolated parser substitute or fixture context.
Only sanitized provider class/duration inspected; no provider body, prompt,
voice text, coordinates or credentials printed.

| Attempt | HTTP / result | provider_outcome_class | NLP duration_ms | Total request + safe log collection_ms |
| --- | --- | --- | --- | --- |
| 1 | 201 / valid single result | invalid_output | 1947 | 9970 |
| 2 | 201 / valid single result | invalid_output | 1493 | 8150 |
| 3 | 201 / valid single result | invalid_output | 3072 | 9746 |

Genuine application Gemini success **0/3**. Safe log inspection confirmed all
three `invalid_output` provider events and matching `nlp_request` failure /
gemini_unavailable durations. This run is NOT classified as timeout/auth/network.
The class denotes rejected provider output; finer decode/envelope/structured
validation cause was not inferred from undisclosed payloads. Deterministic
fallback made the201 responses; it is not accepted as primary production NLP.
**STOP: PART15_FULL_CONTEXT_GEMINI_INVALID_OUTPUT.** No model/schema/prompt/
timeout/credential/runtime fix attempted; any remediation needs reviewed scope.

## Resume rollback / remaining acceptance / offline checks

After the failed launch gate, first-release zero-application rollback executed:
cloudflared inactive, compose down removed API container/network, no8080 listener.
Exact release image and private runtime configuration retained for reviewed
recovery. No public traffic, immediate peer measurement or proxy env change.
Gates O–W remain incomplete; only the bounded VPS direct Voice application
probe above ran in this resume. Peer/trust, VPS clarification/continue, public health/
catalog/CORS/Voice, running-API direct-origin proof and stability observation
remain NOT RUN.
Existing Part14B perimeter evidence is preserved, not re-labelled Go acceptance.

Deploy docs and verifier now enforce portable artifact proof and genuine
full-context Gemini success. Synthetic identity regressions reject file/binary/
layer/revision/User/entrypoint/arch mismatch and checksum verified only after
load; different store identifiers alone are accepted. Focused Part15 tests,
static/syntax/diff checks and rebuilt archive verification recorded below.

DB mutation: NONE. Migration: NONE. Ingestion/snapshot: NONE.
Only restricted Supabase reads and bounded genuine Gemini calls in this resume;
no new clarification session created. No frontend, HSTS, scheduler, Part16+,
commit/push. No physical Siri claim. Current status remains **BLOCKED**.

Resume offline checks: Part15 tests **29/29 PASS**, static verifier PASS,
archive-script syntax PASS, `git diff --check` PASS. Protected Go/Nest/frontend/
contracts/data diff empty. The full Go matrix was not rerun because runtime
source/image are unchanged and exact-release hosted CI success was reconfirmed.
Rebuilt archive verification **PASS507 safe regular unique members**, exact
source/report byte-match and bounded secret scan PASS. Current private credential/
endpoint scan **PASS12 candidate files**, values withheld. No real env, credentials,
DB dump/backup, image tar, compiled binary, node_modules or build/test output in
review archive. Final report is included by rebuilding and verifying
after this evidence update. None of these offline checks overrides the live NLP STOP.

## Source remediation — category-specific Gemini schema

Owner separately authorized only this Part15 source remediation, not deployment.
Fetch/prune reconfirmed branch integrate/full-stack,
HEAD=origin=`695f7e34871879d32edff24c1775f9eb2d2f4e92`; existing candidate preserved.
Portable identity and VPS readiness external PASS retained for the old release.
No image rebuild, VPS command/start, Tunnel activation or public cutover in this
source-remediation run. Any future changed runtime requires external review →
owner commit/push → hosted CI for new SHA → new immutable image before deployment.

### Confirmed internal mismatch / minimal fix

Previous `gemini.schema` merged filters across all categories and allowed null
for every property. `voice.Validate` independently checks selected category (or
CurrentCategory) and rejects unknown-category keys even if their value is null.
Synthetic milk response with eggs packageCount=null is rejected by the unchanged
validator/client. The regression for category-discriminated schema failed on the
old source before the runtime patch (all4 current-category subcases).
This proves an internal allowed-output mismatch, not the exact undisclosed raw
payload cause of the historical VPS invalid_output3/3.

Only `gemini.schema` runtime changed:

- Top-level anyOf, one closed object per actual input category, category enum
  containing only that slug. Its filters admit only that category's real keys.
- Filter values are non-null primitive types; filters are optional properties
  with no required key list, so missing values are omitted, not null-filled.
- Null-category branch uses CurrentCategory's own keys for clarification, or
  empty closed filters when no CurrentCategory. Intent remains nullable.
- additionalProperties=false on every response branch and filters object.
- `voice.Validate`, request prompt, model, keys,8s timeout, key-failover/fallback,
  public API/DTO, PostgreSQL repositories/pool and DB remain unchanged.

Provider JSON Schema unions are documented in the official
[Gemini structured-output reference](https://ai.google.dev/gemini-api/docs/structured-output).
Independent response validation is still enforced; schema does not replace it.

Incremental source files in this remediation:
`backend-go/internal/gemini/client.go`, `client_test.go` in the same directory,
`backend-go/internal/voice/service_test.go`,
`backend-go/tests/integration/voice_live_test.go`, and this report.
No Go module/lockfile or Nest/frontend/contracts/Prisma/data change.

### Regression and Go checks

New milk/eggs/bread schema regression covers exact branch keys and primitive
types (number/string/boolean), nullable intent, non-null optional filters,
no foreign key/null filler, closed objects, and null-category behavior with
no current category or each of milk/eggs/bread. Provider-client regression and
voice validation regression still reject foreign null filler.

- gofmt affected files: PASS (list empty).
- go mod verify: PASS.
- go test ./...: PASS.
- go test -race ./...: PASS.
- go vet ./...: PASS.
- pinned staticcheck ./...: PASS.
- pinned staticcheck -tags integration ./...: PASS.
- pinned govulncheck ./...: PASS, no vulnerabilities found.
- Integration-tagged TestVoiceDiagnosticPrivacy: PASS.
- Existing Part15 verifier/tests: PASS29/29; git diff --check PASS.

These are full normal Go suites and integration-tag static/privacy checks;
no new full DB integration/Voice parity suite or deployment PASS is claimed.

### Direct live full-production-context gate — FAIL, bounded STOP

Added explicit opt-in `TestLiveGeminiFullProductionContext`. It builds exactly
the application's complete categories + GetFilterSchema context through
OpenProductionReadOnly using ONLY the existing aktau_api_runtime credential.
Physical production identity/session read-only validation PASS;9 categories and
9 schemas loaded from current Supabase runtime repositories. No fixture context,
owner/ingest credential, Redis, Voice HTTP wrapper or deterministic fallback.
Private configuration passed in process environment only, never argv/log/report.

Attempt1: unchanged production budget8s, elapsed8.01s,
**outcomes=[timeout,fallback]**, direct Parse returned failure.
Whole test15.18s includes the separate bounded DB-context-loading phase.
The fallback class here is the provider client's exhausted-attempt outcome,
NOT execution of voice.Fallback and NOT a successful application response.
Parsed result unavailable; genuine success0/1; invalid_output0 in this one
request. Attempts2/3 NOT RUN because the regression gate is fail-fast on any
failed genuine parse. Required3/3 success and zero fallback are NOT proved.

The source mismatch is fixed structurally, but live production NLP acceptance
remains BLOCKED. No repeat/model/schema/timeout/key tuning after the failed
gate, and no claim that the historical invalid_output cause is conclusively
resolved in production. Further action requires external review.

### Safety / final artifact

DB mutation: NONE. Migration: NONE. Ingestion/snapshot: NONE.
This run used restricted Supabase SELECT/session read-only initialization and
one real direct Gemini request only. No Upstash/session writes, Voice endpoints,
new snapshot, image build/transfer/deployment, VPS/Cloudflare/HSTS/frontend/
scheduler change, Part16+, commit or push. No physical Siri claim.
Same production-part-15 review artifact is rebuilt from this candidate; final
source/report byte-match, safe-member and bounded secret checks recorded after
execution. Historical failure and rollback sections above remain intact.

Remediation archive checks **PASS507 safe regular unique members**, exact
source/report byte-match and bounded secret scan PASS. Actual configured private
credential/endpoint scan **PASS16 candidate files**, values withheld. Final
archive is rebuilt after adding this executed evidence; no operational env,
credentials, DB backup, release image tar or compiled output is included.

## Diagnostic iteration — all three bounded full-context attempts

External review accepted category-specific schema as logically correct, but the
prior single timeout/fail-fast evidence above was incomplete. This continuation
changes ONLY the live integration test's attempt aggregation and this report.
Fetch/prune reconfirmed integrate/full-stack, HEAD=origin=
`695f7e34871879d32edff24c1775f9eb2d2f4e92`; known candidate preserved.
Byte comparison against the previous review archive confirmed accepted Gemini
runtime/schema, client regression tests, voice.Validate and voice service tests
unchanged during this diagnostic iteration.

`TestLiveGeminiFullProductionContext` now executes all3 sequential calls with
independent unchanged8s provider budgets. Provider/encoding/validation/extraction
failures accumulate without t.Fatal inside the loop; strict acceptance is decided
only after attempt3. Existing independent validation and exact expected extraction
checks are retained. Test logs retain only allowlisted provider classes, attempt
number, duration_ms and genuine_success; context diagnostics show numeric category/
schema counts only. No request/body/schema content, user text, coordinates or keys.
Optional request/schema bytecounts were not collected.

Fresh restricted production context: **PASS**, aktau_api_runtime identity and
physical read-only policy, categories9/schemas9. Same model/prompt/schema/keys/
failover/fallback and8s timeout; direct provider client, no voice.Fallback wrapper,
Voice HTTP endpoint, Redis or deployment.

| Attempt | provider_outcome_class | duration_ms | genuine_success |
| --- | --- | --- | --- |
| 1 | timeout,fallback | 8007 | no |
| 2 | timeout,fallback | 8007 | no |
| 3 | timeout,fallback | 8001 | no |

Final strict gate **FAIL**: genuine_success0/3, invalid_output0, fallback3,
timeout3. Test process exit1; full elapsed31.27s includes DB-context loading
separately from provider budgets. Fallback class denotes exhausted direct-provider
attempts, not a successful fallback-derived application response. There was no
parsed result to validate, so absence of invalid_output does not prove live schema
acceptance. Repeated full-context timeout is now demonstrated, not inferred from
one call. **PART15_FULL_CONTEXT_GEMINI_TIMEOUT8S remains BLOCKED**.
No additional request or provider tuning after this complete set.

Re-run gates:

- gofmt: PASS, affected-file list empty.
- go test ./... and go test -race ./...: PASS (normal full suites).
- go vet ./...: PASS.
- pinned staticcheck normal + integration tags: PASS.
- pinned govulncheck: PASS, no vulnerabilities found.
- Integration-tagged diagnostic-privacy race test: PASS; live test correctly
  SKIP without opt-in in that non-live check, not misreported as a live PASS.
- Part15 tests29/29 and static verifier: PASS; git diff --check PASS.
- Live full-context gate: FAIL with complete results above.

No runtime/business/DTO/contract/DB/schema/security change in this iteration.
DB mutation: NONE. Migration: NONE. Ingestion/snapshot: NONE.
VPS/Cloudflare not contacted or changed; zero-application rollback state left
untouched. No image rebuild/transfer/deploy/public cutover, Upstash write,
frontend/HSTS/scheduler, Part16+, commit or push. No physical Siri claim.
Changed runtime from the earlier schema remediation still requires external
review → owner commit/push → new-SHA hosted CI → new immutable image; this
diagnostic test cannot authorize deployment. STOP for external review.

Diagnostic archive checks: **PASS507 safe regular unique members**,
source/report exact byte-match and bounded secret scan PASS. Configured private
credential/endpoint scan PASS16 candidate files (values withheld). Same permanent
production-part-15 target rebuilt with the complete three-attempt results; no
real env, secrets, DB backup, image tar, binary or build/test outputs included.

## Gemini stateless NLP compaction remediation

Same Part15, approved incremental source remediation only. Fetch/prune PASS;
integrate/full-stack HEAD=origin=`695f7e34871879d32edff24c1775f9eb2d2f4e92`.
Known uncommitted Part15 candidate preserved; no reset/restore/restart.
Earlier category-specific anyOf schema is superseded, not retrospectively
represented as a live PASS. All initial image-ID/readiness, sequencing/rollback,
invalid_output and timeout evidence remains above.

Architecture: **Gemini stateless NLP / Redis session state / Go strict validation,
clarification, merge and business logic / PostgreSQL product-price-store truth**.

- Small static systemInstruction now contains only permanent extraction rules.
- Provider content contains current utterance, real category slug/name,
  deduplicated filter key/label/primitive type, CurrentCategory and ExpectedFields.
  Full FilterSchema serialization, Options/brand lists and category IDs removed.
- One closed response object replaces category-specific anyOf branches. Real
  category enum remains nullable; intent nullable; filter properties optional,
  non-null primitive types, without allowed-value enums; additionalProperties=false.
- Type inference checks every real option; ambiguous/invalid primitives, unknown
  definition types and conflicting duplicate keys fail closed. Same-type keys
  deduplicate in deterministic key order. Full options remain in internal Input
  for unchanged independent voice.Validate category/key/value authorization.
- Continue passes ExpectedFields=Missing(previous) and previous.Category;
  provider receives no previous conversation/session ID/coordinates. Existing
  Redis TTL600/session wire shape, Merge/Missing/Question/result logic unchanged.
- Model, keys/order, shared8s deadline, MaxResponseBytes, HTTP client, failover
  classification and deterministic fallback unchanged. No caching/Interactions API.

Incremental files: internal/gemini/client.go and client_test.go;
internal/voice/models.go, service.go and service_test.go;
tests/integration/voice_live_test.go; this same report. Paths are under backend-go
except the report. No module/dependency, API/DTO, contracts, Nest/frontend,
Prisma/repository/Redis/data/pipeline/deploy configuration change in this iteration.

### Local regression and request-size evidence

Production-like milk/eggs/bread fixture covers static instruction separation,
category names/slugs, dedup string/number/boolean primitives, closed optional
non-null filters, sentinel options/brand/category-ID exclusion, type conflicts,
malformed/null/nested/empty options rejection and unchanged semantic authority.
Existing tests reject foreign null fillers, invalid category/key/real option;
valid milk values remain accepted. Capture-parser regression proves start has no
prior context, continue receives backend missing fields and null intent/category
update preserves cheapest/milk while merging volume/fat, completing/deleting the
same session with unchanged TTL and deterministic SQL TOP1.

Synthetic size test: request_body_bytes=2073, response_schema_bytes=504,
filter_fields_count=6; legacy full-schema representation alone=12187 bytes.
Compact whole request is below8KiB and below half the legacy schemas-only payload.
These numbers are synthetic fixture evidence, not production payload contents.

- gofmt: PASS (affected-file list empty); go mod verify: PASS.
- Full go test ./... and go test -race ./...: PASS.
- go vet ./...: PASS.
- Pinned staticcheck normal and integration-tagged: PASS.
- Pinned govulncheck: PASS, no vulnerabilities found.
- Integration-tagged TestVoiceDiagnosticPrivacy with race: PASS.
- Part15 verifier tests29/29 PASS; static verifier PASS; git diff --check PASS.

No fresh full DB parity or deployment evidence is claimed by these local checks.

### Direct live production-context result — BLOCKED

Restricted aktau_api_runtime identity and physical read-only session policy PASS.
Current Supabase categories_count=9, schemas_count=9, filter_fields_count=5.
Exact compact request_body_bytes=2563; response_schema_bytes=522.
Same existing production model/keys and unchanged8s budget; three sequential
direct provider calls, no Voice HTTP/fallback wrapper/Redis. Each genuine result
is independently validated against the full actual category-specific schemas and
the expected complete-input extraction. Diagnostics only classes/counts/durations.

| Attempt | provider_outcome_class | duration_ms | genuine_success |
| --- | --- | --- | --- |
| 1 | timeout,fallback | 8008 | no |
| 2 | timeout,fallback | 8007 | no |
| 3 | success | 4704 | yes |

Strict gate FAIL: genuine_success1/3, invalid_output0, timeout2, fallback2.
Whole test28.00s includes separate bounded DB-context loading. The third call
proves one genuine full-context structured parse passes strict validation, NOT
reliable3/3 production readiness. Fallback classes in failed direct calls denote
provider exhaustion, not execution of voice.Fallback or successful Voice results.
Clarification direct live parse **NOT RUN**, as required after complete-input FAIL;
the conditional test is implemented but not represented as verified live evidence.
No further attempts or provider tuning. **PART15_FULL_CONTEXT_GEMINI_TIMEOUT8S**
remains BLOCKED; external review required.

### Safety and artifact

DB mutation=NONE; migration=NONE; ingestion/snapshot=NONE; Redis writes=NONE.
Only restricted production metadata SELECT/session-read-only initialization and
three approved direct Gemini calls. VPS/Cloudflare not contacted or changed;
zero-application rollback state untouched. No image build/transfer/deploy/public
cutover, frontend/HSTS/scheduler, Part16+, commit or push. No physical Siri claim.
Changed source requires external review → owner commit/push → hosted CI on new
SHA → new immutable image before any deployment. STOP for external review.

Permanent production-part-15 archive rebuild and verification **PASS507 safe
regular unique members**, exact report/source byte-match and bounded secret scan.
Actual configured private credential/endpoint scan PASS, values withheld. No real
env, credentials, backup/dump, image tar, compiled binary or build/test output.
Protected-source diff empty; git diff --check PASS. Archive is rebuilt and verified
again after this evidence update so it contains the final report bytes.

## Diagnostic model-selection evidence — unchanged stateless NLP candidate

Same Part15, diagnostic only, following external acceptance of compaction.
Fetch/prune PASS; integrate/full-stack HEAD=origin=
`695f7e34871879d32edff24c1775f9eb2d2f4e92`. Existing candidate preserved.
Only tests/integration/voice_live_test.go and this report changed in this iteration.
Byte comparison confirmed accepted Gemini runtime/client regressions, voice
models/service/state/validation/fallback and service tests unchanged. No request,
systemInstruction/schema, keys/order/failover, shared8s budget, public API/DTO,
Redis contract, DB or deployment configuration change. Production GEMINI_MODEL
is still unchanged; the alternative model is an explicit test-client parameter only.

Opt-in LIVE_GEMINI_MODEL_BENCHMARK_CONFIRM=1 extends the existing direct test:
one restricted production context load, then ten sequential3.1 calls followed by
ten sequential3.5 calls. Each uses a fresh client/shared8s call budget, identical
compact Input/request body and existing keys/order. Models never run concurrently;
this is bounded model-selection diagnostics, not load testing. Baseline-model
failure does not abort the candidate-model measurements. No raw prompt/schema/
provider body/user text/keys/DSN/session IDs logged.

Restricted aktau_api_runtime identity and physical read-only session policy PASS.
Same current production vocabulary for both models: categories_count=9,
schemas_count=9, filter_fields_count=5, request_body_bytes=2563,
response_schema_bytes=522. Each counted genuine success passes structured parsing,
independent voice.Validate against the full actual schemas, exact complete-input
extraction and elapsed<8s. Product/price/store selection remains outside Gemini.

### Twenty sequential complete-input attempts

| Model | Attempt | provider_outcome_class | duration_ms | genuine_success |
| --- | --- | --- | --- | --- |
| gemini-3.1-flash-lite | 1 | invalid_output | 1655 | no |
| gemini-3.1-flash-lite | 2 | invalid_output | 3293 | no |
| gemini-3.1-flash-lite | 3 | success | 4927 | yes |
| gemini-3.1-flash-lite | 4 | invalid_output | 1203 | no |
| gemini-3.1-flash-lite | 5 | timeout,fallback | 8007 | no |
| gemini-3.1-flash-lite | 6 | timeout,fallback | 8003 | no |
| gemini-3.1-flash-lite | 7 | invalid_output | 6680 | no |
| gemini-3.1-flash-lite | 8 | invalid_output | 2113 | no |
| gemini-3.1-flash-lite | 9 | server_error,timeout,fallback | 8001 | no |
| gemini-3.1-flash-lite | 10 | server_error,invalid_output | 2332 | no |
| gemini-3.5-flash-lite | 1 | success | 830 | yes |
| gemini-3.5-flash-lite | 2 | success | 909 | yes |
| gemini-3.5-flash-lite | 3 | success | 932 | yes |
| gemini-3.5-flash-lite | 4 | success | 885 | yes |
| gemini-3.5-flash-lite | 5 | success | 1084 | yes |
| gemini-3.5-flash-lite | 6 | success | 934 | yes |
| gemini-3.5-flash-lite | 7 | success | 1024 | yes |
| gemini-3.5-flash-lite | 8 | success | 956 | yes |
| gemini-3.5-flash-lite | 9 | success | 995 | yes |
| gemini-3.5-flash-lite | 10 | success | 1578 | yes |

| Model | Genuine success | Timeout | invalid_output | fallback | Genuine duration min / median / max_ms |
| --- | --- | --- | --- | --- | --- |
| gemini-3.1-flash-lite | 1/10 | 3 | 6 | 3 | 4927 / 4927 / 4927 |
| gemini-3.5-flash-lite | 10/10 | 0 | 0 | 0 | 830 / 945 / 1578 |

3.1 also emitted two server_error events before existing key failover; no change
to retry/key behavior. Counts describe provider outcome events, not successful
fallback-derived Voice responses. Median is the average of middle sorted genuine
elapsed durations for an even sample, reported in integer milliseconds.

### Conditional clarification — FAIL, bounded STOP

After3.5 complete-input10/10 PASS, exactly one direct clarification parse used
3.5 with CurrentCategory=milk, ExpectedFields=Missing(previous) for volume/fat,
full actual option validation and the unchanged8s budget. Expected null intent/
category with the requested volume/fat primitives. Actual safe evidence:
provider_outcome_class=[invalid_output], duration_ms=986, genuine_success=false.
No parsed result accepted; no Redis session, Voice HTTP endpoint or deterministic
fallback wrapper. invalid_output denotes provider-envelope/structure/strict
validation rejection; no raw body was inspected/logged and finer cause is NOT
inferred. Whole benchmark test65.06s includes separate DB-context loading.

Overall model-switch diagnostic gate **FAIL** despite complete-input10/10 PASS
for3.5. **PART15_MODEL_SELECTION_CLARIFICATION_INVALID_OUTPUT** requires external
review. No further attempt, model switch or timeout/schema/prompt tuning.
Current production model remains3.1. This is NOT a deployment acceptance.

### Re-run checks and safety

- gofmt check: PASS; go mod verify: PASS.
- Full go test ./... and go test -race ./...: PASS.
- go vet ./...: PASS.
- Pinned staticcheck normal + integration tags: PASS.
- Pinned govulncheck: PASS, no vulnerabilities found.
- Integration-tagged diagnostic-privacy test normal + race: PASS;
  non-opted-in live test SKIP is not reported as live PASS.
- Part15 tests29/29 and static verifier: PASS; git diff --check PASS.
- Live model-selection/clarification gate: FAIL, complete sanitized results above.

Production DB mutations=NONE; migrations=NONE; ingestion/snapshot=NONE;
Redis/Upstash writes=NONE. Restricted DB reads and21 bounded direct NLP calls
only (existing classified key failover unchanged). No image build/transfer/deploy, VPS/Cloudflare contact/change,
public cutover, frontend/HSTS/scheduler, Part16+, commit or push. Zero-application
VPS/cloudflared state left untouched. Historical deployment/source failures remain
intact. STOP for external review; no physical Siri claim.

Diagnostic archive verification PASS:507 safe regular unique members, exact
source/report byte-match, bounded secret scan and actual configured private
credential/endpoint scan (values withheld). No real env/credentials, DB backup,
image tar, binary or build/test output. Permanent production-part-15 target is
rebuilt and verified again after recording this executed evidence, including the
final report bytes. None of these checks overrides the clarification STOP.

## Clarification fixture validity and ten-attempt isolation

Same Part15, diagnostic only. Fetch/prune PASS; integrate/full-stack
HEAD=origin=`695f7e34871879d32edff24c1775f9eb2d2f4e92`. Existing candidate preserved.
Only the integration live test and this report changed during this continuation.
Runtime byte-preservation PASS: Gemini request/systemInstruction/schema/client
settings, voice.Input/service, voice.Validate/Missing/Merge and fallback unchanged.
No model/key/timeout/failover/Redis/API contract or DB change.

The test loads actual current GetFilterSchema results once through the restricted
aktau_api_runtime pool. Identity/session read-only policy PASS. Option inspection
emits only three booleans, without lists/provider payloads:

| Current milk option check | Result |
| --- | --- |
| volumeMl contains1000 | true |
| fatPercent contains1.5 | true |
| fatPercent contains3.2 | true |

Thus the current1.5 fixture is valid under current discovery. The proposed
unavailable-option explanation is not established by this read. Historical option
membership was not recorded in the prior run, so no retrospective reconstruction
or assertion that its fixture was invalid is made. The old invalid_output result
is NOT proof of a Gemini model defect. Likewise this continuation classifies the
failed gate, not a proven model/schema/validator root cause.

LIVE_GEMINI_CLARIFICATION_BENCHMARK_CONFIRM=1 runs only ten sequential3.5
clarification calls, skipping the already accepted complete-input benchmark.
CurrentCategory=milk, ExpectedFields=Missing(previous) for volumeMl/fatPercent;
fixture uses the independently confirmed1000ml/3.2 values. Expected intent/category
remain null. Every genuine result must pass voice.Validate against full actual
schemas and exact extraction, within an independent unchanged8s provider budget.
Provider options are still not transmitted. No Voice HTTP/Redis/fallback wrapper.

Production vocabulary categories9/schemas9/filter_fields5. Existing complete-input
request diagnostics remain2563 body bytes/522 schema bytes; clarification body
size was not separately measured and is not claimed identical to complete-input.
All per-attempt output is sanitized class/duration/genuine-success only.

| Model | Attempt | provider_outcome_class | duration_ms | genuine_success |
| --- | --- | --- | --- | --- |
| gemini-3.5-flash-lite | 1 | invalid_output | 1109 | no |
| gemini-3.5-flash-lite | 2 | invalid_output | 917 | no |
| gemini-3.5-flash-lite | 3 | timeout,fallback | 8008 | no |
| gemini-3.5-flash-lite | 4 | success | 863 | yes |
| gemini-3.5-flash-lite | 5 | invalid_output | 910 | no |
| gemini-3.5-flash-lite | 6 | success | 794 | yes |
| gemini-3.5-flash-lite | 7 | timeout,fallback | 8001 | no |
| gemini-3.5-flash-lite | 8 | invalid_output | 1052 | no |
| gemini-3.5-flash-lite | 9 | timeout,fallback | 8000 | no |
| gemini-3.5-flash-lite | 10 | success | 789 | yes |

Aggregate: genuine_success3/10, timeout3, invalid_output4, fallback3.
Genuine duration min/median/max=789/794/863ms. Full test38.13s includes separate
DB-context loading. All ten bounded attempts completed. Fallback class denotes
direct-provider exhaustion, not a successful deterministic Voice response.
No raw body/output/text/key/DSN/coordinates/session IDs inspected or logged.
invalid_output still denotes rejected provider envelope/structure/validation;
these safe classes do not distinguish which underlying condition caused rejection.

Clarification gate **FAIL**. Accepted complete-input3.5 benchmark10/10 remains
strong PASS evidence for that path only, not overall production acceptance.
Model candidate NOT accepted for production switch in this run; current production
GEMINI_MODEL remains unchanged. **PART15_CLARIFICATION_CURRENT_VALID_FIXTURE_FAILED**
requires external review. No further request or tuning after this complete set.

Re-run checks: gofmt/mod verify PASS; full Go unit/race suites PASS; vet PASS;
pinned staticcheck normal+integration PASS; govulncheck PASS, no vulnerabilities;
integration diagnostic-privacy race PASS; Part15 verifier29/29 and static check
PASS; git diff --check PASS. Normal suites may reuse valid Go test cache; the live
and privacy tests used count=1. No fresh deployment/full DB parity claim.

Production mutations/migration/ingestion/new snapshot=NONE; Upstash writes=NONE.
Restricted production reads and ten bounded direct Gemini calls only. No image
build/transfer/deploy, VPS/Cloudflare contact/change, cutover, frontend/HSTS/
scheduler, Part16+, commit or push. Zero-application state left untouched.
Permanent Part15 archive verification PASS:507 safe regular unique members,
source/report byte-match, bounded patterns and actual configured private credential/
endpoint scan (values withheld). No real env, credentials, DB dump/backup, image
tar, binaries or build/test outputs. Protected-source diff empty; diff check PASS.
Archive is rebuilt/verified after recording this evidence to include final report
bytes. None of these local/artifact checks overrides the clarification STOP.

## Deterministic question targeting and partial provider contracts

Same Part15 source remediation, not deployment/Part16. Fetch/prune PASS;
integrate/full-stack HEAD=origin=`695f7e34871879d32edff24c1775f9eb2d2f4e92`.
Known candidate preserved. New incremental files: gemini/client.go and
client_test.go; voice/state.go, service.go and service_test.go;
tests/integration/voice_live_test.go (all under backend-go), and this report.
No config/default/model/example update because live prerequisites did not PASS.

QuestionFields applies the same intent→category→milk volume/fat priority as the
actual Question. Continue now supplies only QuestionFields(Missing(previous));
public missingFields remains the complete Missing list and question text remains
unchanged. Neither Redis wire/TTL nor Merge/Missing/fallback/business logic changes.

When ExpectedFields is non-empty, provider request construction uses a separate
closed partial contract:

- Filters: current category slug/name only; expected filter key/label/primitive
  types only. No unrelated categories/fields/options. Output requires only filters;
  expected filter properties are optional/non-null, enabling partial answers.
- Intent: output only intent, no categories/filter vocabulary.
- Category: canonical category vocabulary/enum only, output only category.
- Unknown/mixed targeting, missing current category/filter definitions or invalid
  primitives fail closed before provider request construction.
- Partial output is checked against its closed targeted shape without dropping
  extras, normalized to canonical nil intent/category plus empty filters, then
  passed to the existing strict voice.Validate with full backend schemas/options.
  Foreign/unexpected filters, invalid options, null filters and extra top-level
  placeholders are rejected; arbitrary extra data is not silently discarded.

Start/full-input compact construction remains the existing path when ExpectedFields
is empty. SystemInstruction and voice.Validate byte-preservation verified against
the previous review archive. Model/keys/order/shared8s timeout/HTTP client/failover/
fallback unchanged. No public DTO/API, Redis/DB/Nest/frontend/Prisma/deploy changes.

### Regression and local checks

Tests cover all five question-target cases, including intent/category taking
precedence over other missing fields; Question(missing)==Question(targeted).
Provider tests check filter payload exclusion of unrelated categories/keys,
expected-only optional properties, no required intent/category placeholders,
minimal identity schemas and strict normalization/validation. A partial volume
answer is validated through both the pure normalization helper and mocked actual
provider HTTP path; Merge preserves cheapest/milk and next Missing is fatPercent.
Unknown category/filter, invalid real value/null/extra placeholders still reject.

gofmt/mod verify PASS; full Go unit/race suites PASS; vet PASS; pinned staticcheck
normal+integration PASS; govulncheck PASS, no vulnerabilities; integration
diagnostic-privacy race PASS; Part15 verifier29/29 and static verifier PASS.
No new end-to-end Redis/DB/deployment PASS inferred from unit coverage.

### Live prerequisite rerun — bounded FAIL and STOP

LIVE_GEMINI_TARGETED_CONFIRM selects only3.5 and defines sequential gates:
complete10 → targeted filters10 → intent3 → category3; each later phase requires
the preceding phase to PASS. Every accepted output must independently pass full
voice.Validate and exact phase extraction, with each call's unchanged8s budget.

Restricted production identity/session policy PASS. Current categories9/schemas9;
all three milk option boolean checks true. Complete input diagnostics remain
request_body_bytes2563, response_schema_bytes522, filter_fields_count5.
No raw text/body/output/schema/options/credentials logged.

| Model / phase | Attempt | provider_outcome_class | duration_ms | genuine_success |
| --- | --- | --- | --- | --- |
| gemini-3.5-flash-lite / complete | 1 | timeout,fallback | 8006 | no |
| gemini-3.5-flash-lite / complete | 2 | timeout,fallback | 8007 | no |
| gemini-3.5-flash-lite / complete | 3 | timeout,fallback | 8003 | no |
| gemini-3.5-flash-lite / complete | 4 | success | 6027 | yes |
| gemini-3.5-flash-lite / complete | 5 | success | 5567 | yes |
| gemini-3.5-flash-lite / complete | 6 | timeout,fallback | 8003 | no |
| gemini-3.5-flash-lite / complete | 7 | timeout,fallback | 8009 | no |
| gemini-3.5-flash-lite / complete | 8 | timeout,fallback | 8007 | no |
| gemini-3.5-flash-lite / complete | 9 | timeout,fallback | 8007 | no |
| gemini-3.5-flash-lite / complete | 10 | timeout,fallback | 8007 | no |

Aggregate genuine_success2/10, timeout8, invalid_output0, fallback8.
Genuine duration min/median/max=5567/5797/6027ms. Whole test82.63s includes
independent DB-context loading. Fallback outcomes denote exhausted direct-provider
calls, not a successful deterministic Voice response. No raw result inspection;
absence of invalid_output does not prove targeted clarification compatibility.

Complete-input prerequisite FAIL. Targeted filters10, intent3 and category3 live
tests **NOT RUN**, per mandatory STOP condition. Earlier complete-input10/10 remains
accepted historical evidence, but cannot replace this explicitly required rerun.
No new request/schema/model/timeout tuning or repeat after the failed gate.
**PART15_GEMINI35_COMPLETE_INPUT_TIMEOUT8S** remains BLOCKED; underlying provider/
network timing cause is not established. Source targeting is locally verified
only, not accepted live. Production Go model default and private GEMINI_MODEL
remain unchanged; conditional model-candidate switch was NOT executed.

Safety: production DB mutations/migration/ingestion/new snapshot=NONE;
Redis/Upstash writes=NONE; restricted metadata reads and ten direct3.5 NLP calls
only. No image build/transfer/deploy, VPS/Cloudflare contact/change/public cutover,
frontend/HSTS/scheduler, Part16+, commit or push. Zero-application state untouched.
Historical failure/rollback evidence preserved. STOP for external review.
Part15 archive verification PASS:507 safe regular unique members, exact source/
report byte-match, bounded secret scan and actual configured private credential/
endpoint scan (values withheld). Protected-source diff empty; gofmt/diff checks
PASS. No real env/credentials, DB backup/dump, image tar, binaries or build/test
output. Permanent target is rebuilt/verified after this final evidence update.

## Product-owner launch decision — graceful Gemini degradation

Same Part15 final source-finalization continuation. Fetch/prune PASS;
branch integrate/full-stack, HEAD=origin=
`695f7e34871879d32edff24c1775f9eb2d2f4e92`. Existing known Part15 candidate and
all prior BLOCKED/provider/rollback evidence preserved, not restarted or reset.

The product owner explicitly superseded strict provider-only3/3 or10/10 launch
acceptance. External provider latency/availability varies and repeated synthetic
benchmarks consume quota; approved deterministic fallback already exists.
Gemini remains primary NLP, fallback is the production degradation path, Redis
holds sessions, Go validates/merges/selects and PostgreSQL is catalog truth.
No fixture repository or memory Redis fallback is added to production.

### Source finalization

- Go config default and safe example now select `gemini-3.5-flash-lite`.
  Tests assert the production default and retention of an explicit model override.
  Private operator/VPS model configuration is NOT changed.
- Compact stateless start, QuestionFields and targeted clarification implementation
  preserved. This iteration does not edit Gemini client/schema/systemInstruction,
  shared8s timeout, keys/order/failover, voice.Validate, fallback implementation,
  state/Redis contract, HTTP DTOs or deterministic business selection.
- Deployment README now requires application-level correct Voice results/session
  continuation during provider degradation, not perfect provider-only availability.
  DB/session failure, invalid public responses, origin/CORS/security regressions
  remain blockers. Static verifier markers and two negative regressions enforce
  this policy without claiming static checks prove live availability. Portable
  artifact identity, private origin and all other deployment protections retained.
- Current network/checklist/API-down documentation is synchronized to this source
  review and application gate; historical image/readiness/invalid_output evidence
  remains preserved. No topology, Cloudflare setting or runbook command changes.
- New test-only `internal/httpapi/voice_degradation_test.go` uses the real Router,
  Voice Service and approved NLP fallback with explicit deterministic catalog and
  session doubles. There is no live DB/provider/session dependency in these tests.

### Deterministic application-level evidence — PASS

`TestVoiceGracefulDegradation` runs two independent provider modes: a synthetic
provider error carrying a synthetic credential sentinel, and DeadlineExceeded.
The timeout mode deterministically supplies an exhausted provider outcome without
sleeping or pretending to measure real provider latency. Provider fails for every
turn; usable extraction therefore comes from the unchanged approved fallback.
Each mode executes five actual HTTP requests through the application router:

| Required flow | Verified result in both provider modes |
| --- | --- |
| Complete cheapest milk | HTTP201/result/single; one valid fixture product, expected price/store/speech |
| Start incomplete milk | HTTP201/needs_clarification; volumeMl and fatPercent; opaque session created |
| Continue volume only | HTTP201/needs_clarification; fatPercent only; same session; TTL600 refreshed |
| Continue fat | HTTP201/result/single; same product/speech as complete input; session deleted |
| Search milk | HTTP201/result/list; exactly3 valid ordered fixture items; expected speech |

Result queries are asserted milk + numeric volumeMl1000/fatPercent3.2,
price_asc, limit1 or3. Clarification questions/missingFields and session counters
are asserted; fallback does not invent prices or stores. Privacy proof inspects
non-empty actual HTTP logs against exact generated session IDs, full utterances,
a unique harmless marker, high-entropy coordinate values, provider-error sentinel
and synthetic credential sentinel. No sensitive values are printed on failures;
no provider error is exposed in result responses. Privacy PASS in unit and race.

Fallback is intentionally small: approved core Russian keyword flow only.
Broader natural-language/category cases rely on Gemini and can require additional
clarification during degradation. This is an accepted limitation to monitor after
launch, not a claim of universal offline NLP support.

### Bounded real provider smoke

NOT RUN in this source-only finalization (optional, at most one complete plus
one clarification allowed by TODO). New real calls=0; no benchmark flags/helper
executed. Historical genuine successes and timeout/invalid_output observations
remain evidence above, not newly reclassified as perfect provider availability.
Provider telemetry is operational evidence; a timeout alone no longer blocks a
correct application flow. No new live Gemini/Upstash/production DB access.

### Executed final local gates

| Command / gate | Actual result |
| --- | --- |
| gofmt affected files + gofmt -l cmd internal tests | PASS, no unformatted files |
| go mod verify | PASS, all modules verified |
| focused production-model / HTTP degradation tests, count1 | PASS; both provider-mode subtests |
| go test -count=1 ./... | PASS,13 tested packages;2 packages without tests |
| go test -race -count=1 ./... | PASS, full suite |
| go vet ./... | PASS |
| pinned go tool staticcheck ./... | PASS |
| pinned go tool staticcheck -tags integration ./... | PASS |
| pinned go tool govulncheck ./... | **FAIL, exit3; GO-2026-6629 reachable** |
| node --test scripts/deploy/verify-part15.test.mjs | PASS31/31 |
| node scripts/deploy/verify-part15.mjs | PASS, static only |
| git diff --check | PASS |
| protected backend/frontend/contracts/Postgres/Redis/modules diff | Empty |

Explicit DB/live integration profiles were not run or inferred PASS from skipped
opt-in tests. Existing provider/schema/state tests are included in the full suite.
No new image build, Docker/VPS smoke or live cutover evidence is claimed.

### Remaining mandatory security blocker

Govulncheck reports [GO-2026-6629](https://pkg.go.dev/vuln/GO-2026-6629),
"Panic parsing crafted input in x/text/secure/precis". Selected module
golang.org/x/text v0.39.0; scanner reports fixed v0.41.0. Its reachable trace is
cmd/ingest.run → pgx.Connect → precis.Profile.String. No other module/package
vulnerability reported by this scan. Exploitability in this deployment is not
independently asserted; the mandatory reachable-vulnerability gate fails.

The scope permits model default/test/deploy-doc finalization, not an unrelated
dependency upgrade. No go get/replace/suppression attempted; go.mod/go.sum are
unchanged. A separately reviewed minimal dependency remediation is required
before declaring all mandatory quality/security gates PASS.
**PART15_FINAL_GOVULNCHECK_GO_2026_6629** is the current BLOCKED reason,
not provider-perfect availability. Application degradation acceptance PASS does
not suppress this newly discovered security gate failure.

### Safety and source-review boundary

DB mutation: NONE. Migration: NONE. Ingestion/snapshot: NONE.
VPS deployment: NONE. Cloudflare change: NONE. Frontend deployment: NONE.
Provider/Redis live calls: NONE. Image build/transfer: NONE.
VPS/cloudflared zero-application state left untouched (no SSH action).
Part16+ NOT STARTED. Commit/push: NOT DONE. No physical Siri claim.
No model/request/fallback tuning or next-Part work. STOP for external review.

Finalization archive verification PASS:508 safe regular unique members, all
source/report bytes match the working candidate, bounded secret scan PASS.
Additional scan against actual configured private credentials/endpoints PASS
(values withheld). No real env/private config, provider key/token, DB dump,
Docker image archive, binary, session payload or build/test output included.
Permanent production-part-15 target rebuilt and verified after recording this
evidence so the archived report contains the final bytes. Artifact verification
does not override the reachable-vulnerability BLOCKED result.

## Final narrow security remediation — GO-2026-6629 resolved

Owner separately authorized exactly the x/text dependency upgrade after accepting
Gemini/Voice source finalization. Same Part15 candidate preserved; fetch/prune
PASS, integrate/full-stack HEAD=origin=
`695f7e34871879d32edff24c1775f9eb2d2f4e92`. No reset/restore, source restart or
Part16 work. Prior BLOCKED and provider/image/readiness/rollback history remains
above as historical evidence, not the current source-review status.

### Minimal patch and dependency review

Executed with the local Go1.27.1 toolchain and GOTOOLCHAIN=local:

```text
go get golang.org/x/text@v0.41.0
go mod tidy
```

Immediate dependency diff inspected after get and again after tidy:

- `backend-go/go.mod`: one version replacement, x/text v0.39.0 → v0.41.0,
  still an indirect requirement; no replace or suppression.
- `backend-go/go.sum`: exactly the two x/text v0.39.0 module/go.mod checksums
  replaced by the two v0.41.0 checksums after tidy.
- pgx remains v5.11.0. All other runtime/tool dependency versions, Go version
  and module checksums unchanged. No unrelated drift accepted.
- `go list -m` confirms selected x/text v0.41.0 and pgx v5.11.0;
  `go mod why -m` confirms ingestion → pgx/pgconn → x/text/secure/precis.

The reported reachable path was ingest.run → pgx.Connect → SCRAM authentication
→ precis.OpaqueString.String (password normalization). The narrow patch uses the
upstream fixed shared dependency rather than changing authentication, parser
validation, role/session policy or caller behavior. Direct caller review confirms
pgx and both API/ingestion source paths are unchanged. No crafted panic/exploit
probe against production performed; the mandatory pinned vulnerability scanner
is the focused security verification. This is not a repository-wide security audit.

Incremental files changed in this iteration: **go.mod, go.sum and this report**.
Accepted Gemini/Voice/fallback/model/default8s budget/keys/Redis/DB/API,
deploy/perimeter documentation, frontend and VPS configuration are not edited.
No new tests required for a dependency-only patch; existing compatibility,
authentication/config, provider/state, HTTP degradation/privacy regressions run
under the updated module graph. The codex-security fix-finding workflow guided
the bounded dependency/caller review and verification; no delegated agents used.

### Final executed gates — all PASS

| Gate | Actual result |
| --- | --- |
| gofmt -l cmd internal tests | PASS, empty output |
| go mod verify | PASS, all modules verified |
| go test -count=1 ./... | PASS,13 tested packages;2 without tests |
| go test -race -count=1 ./... | PASS, full suite |
| go vet ./... | PASS |
| pinned go tool staticcheck ./... | PASS |
| pinned go tool staticcheck -tags integration ./... | PASS |
| pinned go tool govulncheck ./... | **PASS, exit0: No vulnerabilities found** |
| node --test scripts/deploy/verify-part15.test.mjs | PASS31/31 |
| node scripts/deploy/verify-part15.mjs | PASS, static only |
| git diff --check | PASS |

The original GO-2026-6629 reachable finding is no longer reported with the fixed
selected module; no vulnerability ignored/suppressed. Legitimate application
behavior is covered by the complete unit/race suites, including the already
accepted deterministic provider-outage complete/multi-turn/search/privacy tests.
No new live Gemini benchmark or provider-perfect requirement introduced.
Opt-in production/DB integration was NOT RUN or inferred PASS from skips.

Current source-review status **READY_FOR_EXTERNAL_REVIEW**. Security blocker
PART15_FINAL_GOVULNCHECK_GO_2026_6629 **RESOLVED**. Earlier network/checklist
checkpoint notes describe the prior blocked deployment attempt; this same report
records the current remediation outcome. Static/source acceptance does not claim
live availability or authorize a deployment.

DB mutation: NONE. Migration: NONE. Ingestion/snapshot: NONE.
Production/provider/Redis/VPS/Cloudflare access: NONE.
Image build/deploy/public cutover: NONE. Frontend change: NONE.
VPS/cloudflared zero-application state left untouched. Part16+ NOT STARTED.
Commit/push: NOT DONE. No physical Siri claim. STOP for external review.

Security-remediated review archive verification PASS:508 safe regular unique
members, exact source/report byte-match, bounded secret scan PASS and additional
configured private credential/endpoint scan PASS (values withheld). No real env,
private configs/key material, DB dump/backup, Docker image, compiled binary or
build/test output included. Permanent production-part-15 target is rebuilt and
verified after this evidence update; final report bytes are included.
