# Voice vocabulary and selected-category validation remediation

Status: **READY_FOR_EXTERNAL_REVIEW**.

Final reviewed fixes: both remaining gates are resolved; see section 9 for the authoritative current results. Sections 1–8 retain the initial candidate checkpoint and its BLOCKED history, including the pre-fix HTTP400 behavior. They are not rewritten as final-state claims. This remains a local source candidate, not a production release.

Date: 2026-10-12. Blocker: **VOICE_VOCABULARY_GOVULNCHECK_STDLIB_1_27_1**. Functional/local performance/parity gates passed, but the pinned scanner reports nine reachable Go standard-library vulnerabilities. No suppression, toolchain upgrade, dependency update or deployment was attempted. Source candidate is retained for independent review; it is not release-approved.

## 1. Preflight and preservation

Fresh `git fetch origin --prune` succeeded. Branch `integrate/full-stack`; HEAD=origin=`d6098f622dc5bb18fd9e7ec4f4a0c82033927981`, matching the reviewed baseline. Accepted GET products-discovery optimization remains byte-unchanged.

Existing modified deploy README, Part15 report, products-discovery remediation report and rollback runbook were preserved without editing. Existing untracked PUBLIC_VOICE_500_DIAGNOSTIC and VOICE_PHASE_DIAGNOSTIC reports and the read-only diagnostic profile were preserved. The existing untracked phase diagnostic test was adapted to the new internal DI and one-selected-discovery flow; cancellation/privacy tests remain, and its full-budget assertion now requires HTTP201. Historical measurements in the diagnostic reports were not rewritten.

No reset, clean, rebase, staging, commit, push, merge or production action occurred.

## 2. Minimal design

Added a narrow internal `catalog.VoiceVocabularyRepository` and `VoiceVocabulary` metadata value; existing CategoryRepository, public DTOs and HTTP paths are unchanged. Runtime DI explicitly supplies this repository. Missing DI fails closed, rather than silently reverting to all-category discovery.

`postgres.ListVoiceVocabulary` reuses the public ListCategories SQL visibility/order: latest published snapshot, usable in-stock positive-price offers, slug ASC. A read-only repeatable-read snapshot operation resolves the snapshot and reads visible category rows plus existing `filterSchema` JSONB. It performs two Query/QueryRow calls, independent of category count, with BEGIN/ROLLBACK boundaries. No per-category live option discovery, full product scan in Go, cache, parallel DB fan-out, new index/table or migration was introduced.

Configured definitions use the existing decoder: malformed/unknown definitions and invalid options are excluded; empty multi-select definitions are omitted because they cannot infer a primitive. Boolean definitions remain valid without options. Declaration order/labels and primitive values are preserved. Configured options may be a superset and remain internal Go metadata; they are **not** authoritative snapshot values.

Gemini client/systemInstruction/schema/keys/model/shared 8-second budget are unchanged. Its existing compact vocabulary builder still sends category slug/name and deduplicated primitive filter metadata, not declared options, brand lists, products, prices or stores. Existing compact-payload/privacy/closed-shape tests pass.

Per turn:

1. Start/continue obtains one bounded configured vocabulary. Continue first loads the existing Redis state and supplies CurrentCategory plus the existing targeted QuestionFields hint.
2. Service invokes Parser.Parse **once**. Provider key failover within that logical parse and existing deterministic NLP fallback remain unchanged.
3. Strict Validate rechecks the candidate structurally and against configured definitions. Once a category is known (or inherited from the session), Service calls GetFilterSchema only for that category, after NLP, and validates again against its authoritative live option intersection.
4. Continue merges using the selected live schema, discarding foreign previous-category filters on category change, then validates the merged state before any session mutation or result query. A stale candidate/stored value is rejected; no session overwrite or SQL selection is allowed from an invalid candidate. Live invalid values return the existing ErrInvalid envelope, not invented products or silent acceptance.
5. Existing Missing/Question, Redis TTL600 and deletion, TOP1/TOP3, SQL selection, Haversine and speech are reused. No second interpretation is performed for a complete utterance.

## 3. Snapshot safety and limits

Vocabulary read ends before provider network I/O. Selected live discovery resolves a fresh latest published snapshot. Configured-option validation alone cannot authorize business queries or Redis state writes.

Product repository is unchanged: ListProducts resolves its own fresh read-only snapshot and revalidates dynamic filter values in that same transaction before product/offer selection. This intentionally retains selected-category filterSchemaAt/discovery inside the result operation. Thus one Service-level selected discovery does **not** mean only one discovery SQL across the whole request. Removing result revalidation would introduce a snapshot race and is not part of this change.

Local integration proof switches the published snapshot after vocabulary/NLP: a formerly usable numeric value is rejected before result lookup. A separate switch after selected validation proves ListProducts rejects the stale filter and returns only the new snapshot's product set for unfiltered reads. No transaction is held across NLP.

Session state is not a snapshot cache. A new turn revalidates its selected options. There is no globally pinned snapshot across provider, session mutation and result operations; later publication is handled by the subsequent fresh repository read, not by claiming cross-operation atomicity. Existing boolean discovery semantics are preserved, including type-only boolean validation where the public definition has no options.

## 4. Before/after measurement — LOCAL ONLY

The explicit user boundary forbids production access in this source task. Accordingly no fresh Supabase timing, production HTTP or live Gemini measurement was made. Historical restricted measurements remain historical evidence only and are not presented as a same-environment post-change comparison.

Measured a new owned loopback PostgreSQL17-alpine fixture using the existing reviewed migration/bootstrap harness and a separate local overlay with nine visible categories. Shared `catalog.sql` is unchanged. Same restricted API reader pool, Ping warm-up, one warm-up per algorithm, five bounded sequential repeats each; no concurrent load or artificial network latency. Old preparation is reproduced only in the test: ListCategories plus nine GetFilterSchema calls. New comparison includes vocabulary **and** one selected milk discovery (not merely pre-NLP vocabulary).

| Observation | Old preparation | New preparation + selected validation |
| --- | ---: | ---: |
| Vocabulary/category repository operations | 1 | 1 |
| Service-level live discovery operations | 9 | 1 |
| Total repository operations | 10 | 2 |
| Query/QueryRow invocations | 28 | 5 |
| BEGIN/ROLLBACK commands | 20 | 4 |
| Logical SQL command total | 48 | 9 |
| Median wall time | 20.950 ms | 5.439 ms |
| Min / max | 20.399 / 23.822 ms | 5.241 / 5.914 ms |

Query counts are observed through the existing counted DB adapter, including queries within read transactions. Transaction command counts follow the executed snapshotReader boundaries. These are logical operations, not a packet trace: implicit statement preparation, network packets and session initialization are not counted. The fixture has seven synthetic category definitions plus milk and empty-schema oil; actual schemas affect query counts. No fixed production speedup or local-to-VPS latency projection is claimed.

### Actual 15-second Router + simulated 8-second provider timeout

Same controlled delays as the previously documented fixture (category/vocabulary 100 ms, individual discovery 700 ms, product lookup 1000 ms), with the new path. Real Router, real compact request preparation, existing deterministic fallback; no external provider.

| Phase | Measured duration |
| --- | ---: |
| Vocabulary preparation | 100.917 ms |
| Gemini request preparation | 0.285 ms |
| Simulated provider timeout | 8006.684 ms |
| Fallback tail | 0.070 ms |
| Selected live schema | 700.725 ms |
| Product/business repository | 1001.057 ms |
| Location loading | 0.003 ms |
| Nearest-store/speech derived tail | 0.009 ms |
| Service total | **9809.898 ms** |
| Remaining HTTP budget | **5189.872 ms** |
| Result | **HTTP201, TOP1, no context deadline** |

The previous historical injected-delay test exhausted 15 seconds after nine discovery operations and fallback. The new full-budget test asserts one selected discovery and a successful result. These injected-delay observations demonstrate removed serial work, not a production reliability guarantee. Variable DB/provider/network latency can still exhaust the unchanged deadline.

## 5. Regression and integration coverage

- One complete milk utterance with numeric 1000/1.5 -> single result with one logical provider parse; discovery occurs after parse.
- Incomplete milk -> clarification; volume-only continue -> only fatPercent missing; final fat continue -> result, TTL600 preserved and completed session deleted.
- Search -> three ordered items; existing price/store/location/image/speech and response field assertions remain.
- Bread/eggs do not acquire milk-only required fields; missing intent/category clarifies without selected discovery until known; category switch drops previous milk filters.
- Unknown category/key, foreign filters, wrong primitive type, stale values and extraneous JSON fail closed. Already-stored stale values are checked again before SQL/session mutation.
- Timeout/invalid-output/provider-error candidates fall back through existing NLP; fallback candidates undergo the same live validation and cannot overwrite/delete a valid session when rejected.
- Visible vocabulary categories/order equal ListCategories; hidden/no-offer category excluded. Configured brand/string/number/boolean metadata preserved; live intersections unchanged; null/empty/malformed definitions covered.
- Local snapshot switches prove stale-option rejection and new-snapshot-only results. Restricted read-only policy and cancellation are checked.
- Existing controlled category/schema/product/location deadline and product cancellation evidence remains: causes are masked by Service and currently map to HTTP500. This unresolved observability/error-mapping issue was **not** silently fixed.
- Existing Gemini compact request, strict validation, classified failover/shared-budget, graceful-degradation/privacy, middleware security/rate and Redis tests pass. No real provider/session traffic was needed.

## 6. Executed mandatory checks

Environment: WSL, repository on Windows-mounted path; Go 1.27.1 linux/amd64 with GOTOOLCHAIN=local; pinned staticcheck module v0.8.1 and govulncheck module v1.8.0. Node v20.20.2 / pnpm10.32.1 were available in this shell. Contracts commands passed but warned that their declared Node engine requires >=22.12.0; no engine/dependency installation or relaxation was performed. Supported-Node rerun is recommended for final release evidence.

| Gate | Actual result |
| --- | --- |
| gofmt -l cmd internal tests | PASS, empty |
| go mod verify | PASS, modules unchanged |
| go test -count=1 ./... | PASS, full suite; final httpapi 10.483 s |
| go test -race -count=1 ./... | PASS, full suite; final httpapi 11.558 s |
| go vet ./... | PASS |
| pinned staticcheck normal + integration tags | PASS after correcting the new unused assignment; initial SA4006 recorded/resolved |
| pinned govulncheck ./... | **FAIL, exit3; nine reachable stdlib findings** |
| unchanged scripts/ci/run-db-integration.mjs | PASS, fresh owned PG17; full existing catalog/security/pool/ingestion regression profiles |
| new local vocabulary/snapshot/comparison integration with race | PASS, 3 profiles |
| local Go/Nest TestHTTPParity | PASS, four fixture products x three sorts, filters/detail/search/dashboard |
| local SecurityQuery / ContentType / CategoryVisibility parity | PASS; 6 Content-Type cases |
| local TestLocalVoiceParity | PASS, all 9 existing scenarios |
| Nest generate/build | PASS, explicit local restricted runtime only |
| contracts lint | PASS |
| contracts offline tests | 12 PASS / 10 environment-profile SKIP / 0 FAIL |
| frozen GET contract profile, local Go and local Nest separately | 18 PASS / 4 excluded Voice-profile SKIP / 0 FAIL each |
| git diff --check; bounded report secret scan | PASS |

Opt-in actual-production/provider profiles were **NOT RUN**, not inferred PASS from skipped tests. `test:live` for contracts targeted only local fixture servers. No frontend source changed; standalone frontend checks were not required or rerun. Existing frontend wire contracts remain covered by the frozen examples/local GET profile; no RU/KK browser evidence is invented.

Both owned disposable PostgreSQL containers and local Go/Nest processes were cleaned up. Existing harness did local migrations/role setup/fixture writes only inside these new owned containers. Prisma CLI guidance was used to keep existing deploy/generate commands in that explicit local scope, without dev/reset/db-push changes.

### Security blocker

Pinned scanner now reports the following reachable findings in stdlib Go1.27.1; for all nine it identifies fixed version **Go1.27.2**:

`GO-2026-6603`, `GO-2026-6613`, `GO-2026-6611`, `GO-2026-6612`, `GO-2026-6617`, `GO-2026-6610`, `GO-2026-6605`, `GO-2026-6608`, `GO-2026-6607`.

This is a current scanner result, not evidence that vocabulary code introduced these vulnerabilities. Go module files/dependencies are unchanged. Two additional imported-package and two module-level findings were classified by the scanner as not called; they are not hidden or substituted for the reachable gate. A follow-up structured scanner run extracted only IDs/version/fix metadata to avoid retaining large traces.

Owner action: separately approve/install a fixed Go toolchain and any required repository/CI/Docker toolchain pin reconciliation, then rerun the pinned security gate and final checks. No automatic system install, Docker edit, module upgrade, suppression or vulnerability-ignore change was made. Until mandatory scanner exit0, status cannot be READY_FOR_EXTERNAL_REVIEW.

## 7. Exact candidate files and preserved work

Modified tracked Go files:

- `backend-go/cmd/api/main.go` — explicit vocabulary DI;
- `backend-go/internal/catalog/models.go` — narrow internal metadata/interface;
- `backend-go/internal/voice/service.go` — bounded vocabulary and selected live validation;
- `backend-go/internal/voice/service_test.go` — explicit fixture DI adapter;
- `backend-go/internal/httpapi/voice_outage_test.go` — fixture vocabulary adapter/DI;
- `backend-go/internal/httpapi/voice_degradation_test.go` — explicit DI;
- `backend-go/tests/integration/voice_parity_test.go` — explicit DI;
- `backend-go/tests/integration/voice_live_test.go` — explicit DI only; live tests not run.

New source/tests/fixture:

- `backend-go/internal/postgres/voice_vocabulary.go`;
- `backend-go/internal/voice/live_validation.go`;
- `backend-go/internal/voice/vocabulary_test.go`;
- `backend-go/tests/fixtures/voice-vocabulary.sql`;
- `backend-go/tests/integration/voice_vocabulary_test.go`;
- this report.

Existing untracked `backend-go/internal/httpapi/voice_phase_diagnostic_test.go` was minimally adapted as described above. Existing untracked read-only profile and both prior diagnostic reports remain present and unchanged. Four pre-existing tracked operational docs remain modified, unchanged by this task. No source/test is staged; new files must be included explicitly in a future review patch/commit.

Protected source diff is empty for Gemini, state/Validate/Merge/Missing/Question, fallback, HTTP catalog/product-query parser, product SQL/repository, pool, Go modules, Nest, frontend and contracts. No new dependency, cache, schema/table/index/migration or API/DTO change.

## 8. Final boundary

No production access (including Supabase), production HTTP, Gemini quota consumption, real Upstash, private credential/config change, Docker image build, VPS/Tunnel/Cloudflare/Vercel action, ingestion, production snapshot, migration, deploy, commit, push or merge. Existing rollback release is untouched by this task. Part17 not started.

The vocabulary source candidate and local functional/performance proof are retained. Remaining mandatory security blocker and supported-Node limitation are explicit. STOP for independent external Code Review and toolchain remediation direction.

## 9. Final external-review fixes — Go patch and Siri compatibility

Fresh fetch/branch/baseline check again matched `integrate/full-stack`, HEAD=origin=`d6098f622dc5bb18fd9e7ec4f4a0c82033927981`. All existing candidate source/tests and operational reports were preserved. No production connection was opened. Both previous review gates below are **RESOLVED**.

### 9.1 Minimal Go security patch — fixed

Changed only the Go directive in `backend-go/go.mod` from **1.27.1 to 1.27.2** and the builder image in `backend-go/Dockerfile` from **golang:1.27.1-alpine to golang:1.27.2-alpine**. Runtime Alpine/hardening/build flags are unchanged. No image was built.

All three existing CI setup-go steps use `go-version-file: backend-go/go.mod`; workflow GOTOOLCHAIN remains local. A focused static assertion confirmed the module, Docker and CI version selection agree. No CI workflow edit or hosted CI claim was needed. Future hosted CI/Docker execution is still a separately authorized release gate.

Used Go's authenticated native versioned-toolchain mechanism to obtain Go1.27.2, then selected its executable on process PATH with GOTOOLCHAIN=local for every final Go/harness command. The pre-existing system/bootstrap Go installation was not overwritten and shell profiles were not changed. Node24.10.0 was already installed and selected on process PATH, with pnpm10.32.1. No packages/dependencies were upgraded to change those environments.

The exact dependency diff is **only the Go directive**; go.sum and all selected runtime/tool dependencies are unchanged. Pinned govulncheck v1.8.0, using actual **go1.27.2 linux/amd64**, exited **0: “No vulnerabilities found.”** The nine previously reported reachable stdlib findings no longer reproduce under this toolchain. No suppression, ignore, broad go-get update or unrelated module drift occurred. The security fix skill guided narrow boundary verification: HTTP/TLS server/client paths now use the patched standard library, while legitimate API/provider/fallback behavior is covered by the same full tests and local parity. It did not authorize or perform production changes.

This closes the **source/toolchain** security gate; it does not assert that the currently deployed rollback image has been rebuilt or patched.

### 9.2 Configured-but-unavailable milk option — regression proved and corrected

A focused HTTP regression first reproduced the concern before the compatibility fix:

- Historical live-schema input algorithm: **HTTP201**, existing clarification asking only for fatPercent.
- Accepted vocabulary candidate before this correction: **HTTP400** for a declared numeric fat option absent from current live options.

The missing live value is not malformed input and must not become a product filter, but an otherwise valid Siri turn can reuse the existing milk question rather than abort. Implemented that narrow behavior without changing the vocabulary architecture or strict Validate.

`liveInput` still performs configured/closed/type validation first, fetches the selected live schema once, and performs strict live validation before any session/product operation. Between those validations, only milk's existing **volumeMl/fatPercent** can be removed from the parsed filter map when the value is a numeric, declared-valid option that fails live availability. The map is copied, not mutated in parser/session-owned state. Removed values become the existing Missing/Question clarification fields. There is no alternative value selection, second provider interpretation or invented price/store.

On continue, the same rule applies to merged prior required values that became unavailable. An explicitly stated unavailable replacement also clears that required field from the merged state, rather than silently reusing a different previously valid value and returning the wrong product. Valid known fields, intent/category and coordinates remain intact. Category-change merge semantics remain unchanged.

Unknown categories/keys, foreign filters, undeclared numeric options, wrong primitive types and unavailable **optional** filters still fail closed. A declared-but-unavailable brand is explicitly tested as HTTP400, not broadened into a new clarification framework. Null/malformed/extra provider output handling is unchanged. No invalid required value reaches product selection; existing result-time snapshot revalidation remains unchanged.

This uses the already-frozen **201 needs_clarification / sessionId / question / missingFields** branch. No DTO/path/status definition or OpenAPI edit was required. The previous candidate's HTTP400 regression is not hidden: its reproduction and narrow correction are retained here.

### 9.3 Independent exact-source local HTTP comparison

One task-owned loopback PostgreSQL17 fixture declared milk fat options 1.5 and 3.2, with usable current offers only for 3.2. Three separate local binaries were built using Go1.27.2 (not Docker images):

1. Exact committed `d6098f6...` baseline, exported from Git without modifying the working tree.
2. The prior candidate, extracted from the previously verified review archive before this correction.
3. The current corrected candidate.

All used the same restricted local API role/fixture and approved deterministic fallback, no Gemini key. A bounded loopback fake Upstash reused the existing production adapter protocol; no real Upstash was contacted. Results:

| Source | Unavailable-option start | Repeated unavailable continue | Valid current answer | Session after completion |
| --- | --- | --- | --- | --- |
| Exact baseline | 201, fatPercent clarification | 201, same clarification | 201, single TOP1 result | Deleted; further continue404 |
| Pre-fix vocabulary archive | **400** | Not attempted after failed start | Not claimed | No created session |
| Corrected candidate | **201, same fatPercent clarification** | **201, same clarification** | **201, single TOP1 result** | **Deleted; further continue404** |

The existing Russian question was unchanged. Unit regressions separately assert zero product calls while a required value is unavailable, TTL600, exactly one provider parse per utterance, valid volume preservation, both-required-field targeting, strict optional/unknown/type rejection, and no reuse of a different prior fat value. Fallback timeout/invalid-output/provider-error cases now safely clarify for unavailable required fields; they still do not authorize SQL with those values.

Local snapshot-switch integration now requires clarification rather than HTTP400 when a required numeric value disappears after vocabulary/NLP. It still proves that stale values do not produce a result. The separate product-repository switch test continues to require ErrInvalidQuery and the new-snapshot-only product set. Product SQL/selection and selected-category discovery implementation were not changed.

### 9.4 Final mandatory verification — actual results

Every final command used effective Go1.27.2, GOTOOLCHAIN=local; Node-based parity/contracts/harness commands used **Node24.10.0**, eliminating the earlier unsupported-engine warning. Existing pnpm lockfiles and pinned tools were preserved.

| Gate | Final result |
| --- | --- |
| gofmt -l cmd internal tests | PASS, empty |
| go mod verify | PASS |
| go test -count=1 ./... | PASS, full suite; httpapi10.488s |
| go test -race -count=1 ./... | PASS, full suite; httpapi11.606s |
| go vet ./... | PASS |
| pinned staticcheck normal / integration tags | PASS / PASS |
| pinned govulncheck ./... | **PASS, exit0, no vulnerabilities found** |
| new unavailable-option HTTP regression | PASS, historical-input/candidate plus 6 strict scope cases and explicit replacement case |
| unchanged run-db-integration.mjs under Node24 | PASS, fresh owned PG17; catalog/security/pool/ingestion regression profiles |
| local vocabulary/snapshot/count profiles with race | PASS, all3 |
| exact-source baseline/archive/corrected HTTP comparison | PASS, expected201/400/201 and completion/cleanup evidence above |
| Go/Nest HTTP / SecurityQuery / ContentType / CategoryVisibility parity | PASS; all3 product sorts; 6 Content-Type cases |
| Go/Nest LocalVoiceParity | PASS, all9 scenarios |
| Nest generate/build under Node24 | PASS |
| contracts lint under Node24 | PASS |
| contracts offline | 12 PASS, 10 explicit environment-profile SKIP, 0 FAIL |
| frozen local GET contracts, Go / Nest | Each18 PASS, 4 excluded Voice-profile SKIP, 0 FAIL |
| Go module/Docker/CI version static proof | PASS |
| git diff --check / bounded report secret scan | PASS |

Controlled **unchanged 15-second Router + simulated 8-second provider timeout** again returned HTTP201/TOP1: vocabulary100.313ms, request preparation0.139ms, provider8005.964ms, fallback tail0.079ms, selected schema700.790ms, product selection1000.719ms, Service total**9808.184ms**, remaining budget**5191.662ms**. No provider benchmark or live provider call occurred.

The local warm-up/5-repeat count comparison remained bounded: old28 Query/QueryRow calls / new5, median**20.048ms / 5.733ms**. No production latency guarantee is inferred; the accepted vocabulary architecture and operation counts are unchanged.

Both fresh owned PG17 containers, four local Go/Nest processes and fake-session server were cleaned up. Mutation/migration/role setup occurred only inside these task-owned local test databases. Opt-in production/provider profiles were NOT RUN and skipped tests are not presented as PASS. Existing controlled canceled/deadline error masking remains documented and unchanged.

### 9.5 Exact delta for this final iteration

Modified relative to the accepted uncommitted candidate:

- `backend-go/go.mod` and `backend-go/Dockerfile` — patch-level toolchain pins only;
- `backend-go/internal/voice/live_validation.go` — narrow required-milk availability-to-missing normalization followed by unchanged strict validation;
- `backend-go/internal/voice/service.go` — consume normalized parsed state and safely merge/clarify explicit unavailable answers;
- `backend-go/internal/voice/vocabulary_test.go` — required unavailable values now require safe clarification, not SQL success or generalized permissiveness;
- `backend-go/tests/integration/voice_vocabulary_test.go` — same snapshot safety with clarification branch;
- this existing report — historical evidence retained, final results appended.

Added only `backend-go/internal/httpapi/voice_unavailable_option_test.go` for focused HTTP baseline/candidate, strict-scope, TTL/cleanup and single-parse regressions. All other existing uncommitted work remains present. Gemini/model/keys/failover/8s timeout, 15s middleware timeout, state/Validate/Merge/Missing/Question definitions, Redis adapter/TTL, product selection, repository live discovery, products-discovery optimization, public DTOs/contracts, Nest/frontend, Prisma and dependencies are unchanged. CI continues to read the Go version from go.mod without workflow edits.

No commit/push/merge, Docker image build, production access, VPS/Cloudflare/Vercel action, provider benchmark, deployment, ingestion or production snapshot. The earlier review archive is a pre-correction historical artifact, not falsely claimed current. Part17 not started. Both source review fixes PASS; STOP for independent Code Review before any release.

## 10. Separately authorized production deployment — 2026-10-13

Owner merged the reviewed source into main and explicitly authorized deployment.
Deployed immutable main revision: **438ecdfa3d386a186dcd8b73c3c10aef5e79dc82**,
containing source commit20a96120c165fd45ecfcf740c3ef66e2703a2bf7. Independent
exact-SHA hosted CI run38298368043: all9 mandatory jobs success. No source/runtime
change or provider tuning during rollout. Go1.27.2 binary was built from clean
Git export outside VPS; single-file SSH transport and portable image identity PASS.

Actual VPS/public Voice TOP1, TOP3 and clarification/partial continue/completion
all201; real owned Upstash TTL≤600/session deletion PASS. Public Voice durations
2447.531–4075.888ms in five bounded application turns.6provider success and
4invalid_output in the combined deployment window; strict validation and approved
fallback preserved genuine business results. This is not a provider benchmark
or a promise about all future requests. Origin isolation, CORS,605.518s stability
and restricted READ-ONLY POST counts/fingerprints/security comparison PASS.

Detailed CI IDs/artifact/hardening/timings/limitations are in the final main-release
section of [PART_15_REPORT.md](PART_15_REPORT.md). Previous failed deployment and
source-only checkpoints above remain historical. Previous e6ef854... image is
retained; rollback was not needed. Production Supabase/provider credentials and
configuration unchanged; no DB/catalog/ingestion/snapshot or frontend changes.
No commit/push by this task. **Physical iPhone Siri NOT RUN / PENDING OWNER**;
automated HTTP success does not close that manual gate. STOP for owner Siri E2E.
