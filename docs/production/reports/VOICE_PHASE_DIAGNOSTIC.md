# Voice request-budget phase diagnostic

Status: **READY_FOR_EXTERNAL_REVIEW**.

Date: 2026-10-08. This status accepts the diagnostic candidate only. Production Voice and the performance-release deployment remain **BLOCKED** pending a separately reviewed remediation. No deployment was attempted.

## Baseline and scope

Fresh fetch succeeded on `integrate/full-stack`; HEAD and origin both remained `d6098f622dc5bb18fd9e7ec4f4a0c82033927981`. The production rollback release remains the previously documented `e6ef854e2973e5b0871888bbc3111e026cdccc5b`; this task did not contact the VPS or independently recheck its current state.

All pre-existing operational changes were preserved: deploy README, Part15 report, products-discovery remediation report, rollback runbook, and PUBLIC_VOICE_500_DIAGNOSTIC report. This task adds only:

- `backend-go/internal/httpapi/voice_phase_diagnostic_test.go`;
- `backend-go/internal/httpapi/voice_phase_readonly_integration_test.go`;
- this report.

Runtime, SQL, middleware, error/status mapping, Gemini configuration, Redis/session behavior, API contracts, dependencies and timeouts are unchanged.

## Instrumentation and privacy

Test-only decorators wrap the existing category, filter-schema, product and location repository boundaries, the existing Voice Service and the existing NLP fallback wrapper. Preparation uses the real compact Gemini request builder; the provider is a local simulator, never a live Gemini request.

Events contain fixed stage names, duration_ms, a synthetic request_id, fixed error_class, ctx_err (`none`, `canceled`, `deadline_exceeded`) and remaining_budget_ms. Dependency errors are classified without printing error strings. No utterance, coordinates, SQL/parameters, session identifier, prompt, provider body, URL or credential is logged. Tests check sentinel exclusion from both diagnostic events and existing access logs.

`deterministic_fallback_tail` is the provider-return-to-NLP-return interval, including small observer overhead. `nearest_store_and_speech_tail` is the location-return-to-Service-return interval, including Haversine/speech and wrapper overhead. These are derived boundary intervals, not exclusive CPU profiling. HTTP mapping records context state at Service return, avoiding the middleware's normal deferred cancellation being misreported as a failed successful request. Parent and provider-child deadline states are distinguished.

## Controlled fixture evidence

All seven controlled cases passed their diagnostic assertions. HTTP500 below is an observed existing behavior, not an accepted application success.

| Case | Measured Service duration | Observed outcome |
| --- | ---: | --- |
| Fast parser, normal repositories | 13.00 ms | HTTP201, correct single-item result |
| Simulated provider timeout, real deterministic fallback | 33.73 ms | HTTP201; child timeout 20.42 ms, fallback tail 0.11 ms |
| Category repository deadline | 149.96 ms | HTTP500; repository deadline cause masked |
| Filter-schema repository deadline | 150.49 ms | HTTP500; repository deadline cause masked |
| Product repository deadline | 150.26 ms | HTTP500; repository deadline cause masked |
| Product repository cancellation | 11.02 ms | HTTP500; repository canceled cause masked |
| Location repository deadline | 150.51 ms | HTTP500; repository deadline cause masked |

Short cases use a 150 ms caller context only in the test; production middleware stays 15 seconds. In successful cases all nine schema calls were sequential, with maximum concurrency one.

The separate full-budget case uses the actual 15-second Router deadline and unchanged 8-second Gemini budget, with injected fixture delays:

| Phase | Measured duration / state |
| --- | --- |
| Category loading | 100.25 ms |
| Nine sequential schema discoveries | 6306.23 ms total |
| Request preparation | 0.08 ms |
| Simulated provider | 8005.47 ms; child deadline, parent still active |
| Deterministic fallback tail | 0.03 ms; approximately 587.81 ms remaining |
| Product selection | 588.81 ms; parent deadline_exceeded |
| Service total | 15000.96 ms; generic dependency_error |
| HTTP mapping | 500 |

This proves a reproducible failure mechanism: fallback can parse successfully but cannot replenish the budget consumed before NLP; downstream product selection then expires. It does **not** prove these injected delays or this exact failed repository were present in the historical production request.

## Actual restricted READ-ONLY repository profile

One explicit local diagnostic run used the existing restricted API credential, with no owner/ingest fallback. The unchanged production pool gate authenticated and initialized a physical connection before measurement. Environment: WSL operator network to the actual Supabase application database, warmed pool following Ping, real current category/filter/product/location repositories, local httptest Router, simulated provider, no Redis or external provider calls. Two sequential observations completed, both HTTP201 with a correct single-item result.

| Phase | Fast local parser | Simulated 8-second provider timeout |
| --- | ---: | ---: |
| Category loading | 574.67 ms | 375.77 ms |
| Nine sequential schema discoveries | 4459.06 ms | 4253.18 ms |
| Request preparation | 1.00 ms | 0.88 ms |
| Provider parse / simulated wait | 0.03 ms | 8004.01 ms |
| Fallback tail | Not used | 0.06 ms |
| Product selection | 856.98 ms | 769.49 ms |
| Location loading | 191.60 ms | 95.06 ms |
| Service total | 6083.41 ms | 13498.53 ms |
| Remaining budget at successful return | 8916.21 ms | 1501.40 ms |

Schema discovery accounts for approximately 89% and 92% of measured category-plus-schema preparation. It is a confirmed dominant pre-NLP cost in this environment. Category plus schemas consumes approximately 5.03 and 4.63 seconds. Following the simulated provider timeout, approximately 2.37 seconds remained for fallback/business logic; this run finished with approximately 1.50 seconds to spare.

These are two observations, not latency percentiles or a load benchmark. They neither establish VPS latency nor guarantee enough headroom under cold connections or network variation. The real-data profile ran before a final test-only correction to derived HTTP/context/tail metadata; the primary repository/provider/Service timings above are unaffected. No claim of live Gemini performance or genuine provider success is made.

## Confirmed conclusions and remaining unknowns

1. Voice loads categories and discovers each category's schema sequentially **before** starting the provider's independent 8-second budget. Both source and measured restricted repository boundaries confirm this.
2. Sequential discovery is the largest measured pre-NLP cost. Each existing discovery uses its own snapshot/read/discovery transaction boundaries. This profile measures the whole repository operation, not individual SQL execution, pool acquisition or network round trips.
3. Category/schema/product/location errors are replaced by fresh generic Service errors. Controlled deadline/cancellation causes therefore cease to satisfy errors.Is at the Service boundary. voiceResponse maps these to HTTP500. Timeout middleware only writes its timeout response if the downstream handler has not already written one; it does not replace this 500. No mapping was changed.
4. Deterministic fallback is fast in these complete-input cases, but it inherits the remaining request context. The controlled full-budget run demonstrates downstream expiry after a successful fallback. The actual restricted profile demonstrates fallback can also finish correctly when headroom is sufficient.
5. Historical evidence remains: old release also returned HTTP500 at 15000 ms, with an NLP timeout/fallback interval of approximately 8003 ms. The previously inferred approximately 6.44-second pre-NLP interval is **not** a historical stage measurement. The exact production failing query, dependency error and phase are still unproven. Request-level historical tracing is insufficient to establish them.
6. No evidence here establishes an edge, Redis, malformed Gemini output, panic, or product-selection semantic defect as the cause of the historical complete-input failure. The tests intentionally do not exercise real providers or session writes.

## Minimal proposed remediation — NOT implemented

First propose a narrowly reviewed repository operation that loads the current category schemas and usable option intersections with bounded SQL round trips under the existing read-only snapshot semantics, rather than nine serial discovery operations. Preserve latest published snapshot selection, category visibility, typed numeric/boolean values, dynamic live options and strict voice.Validate. Measure before/after with the same environment. Do not blindly parallelize nine calls against the bounded pool or introduce stale caches, indexes, schema changes or larger timeouts.

Separately preserve sanitized context causes across Service boundaries and add fixed request-correlated stage telemetry if runtime observability is approved. Any HTTP-status change needs explicit contract/reference review; changing 500 to another status alone would not restore application correctness. Do not tune Gemini in response to this evidence.

The expected launch remediation must demonstrate sufficient total budget and correct application-level fallback results, not merely fast parser execution. A later controlled same-SHA rollout would be needed to independently attribute the historical VPS failure; it is not authorized or performed in this task.

## Verification

All commands used RTK as the external operator wrapper. Full Go checks ran with the installed Go 1.27.1 toolchain and GOTOOLCHAIN=local.

- gofmt check: PASS for both new files; go mod verify: PASS; no module/dependency change.
- `go test -count=1 ./...`: PASS, full suite; final httpapi run 15.702 s.
- `go test -race -count=1 ./...`: PASS, full suite; final httpapi run 16.810 s.
- `go vet ./...`: PASS.
- Pinned `go tool staticcheck ./...` and integration-tag staticcheck: PASS.
- Pinned `go tool govulncheck ./...`: PASS, no known vulnerabilities found.
- New diagnostic tests: seven controlled cases, full 15-second case and sanitized classification PASS. Restricted observational profile: 2/2 completed, both HTTP201.
- Existing fresh disposable loopback PostgreSQL17 setup: PASS; committed migrations, reviewed local role prerequisites and original deterministic fixture plus existing CI-only overlay. Local resources were cleaned up.
- Local Go/Nest `TestHTTPParity`, `TestLocalSecurityQueryParity`, `TestLocalContentTypeParity`, `TestLocalCategoryVisibilityParity`, `TestLocalVoiceParity`: all PASS. HTTP parity covers the four fixture products across three sorts, categories/filters/detail/search/dashboard; Voice parity covers nine existing scenarios. These are fixture results, not full production HTTP parity.
- Nest reference generate/build: PASS.
- Contracts lint: PASS. Offline suite: 12 PASS, 10 environment-dependent SKIP. Frozen GET profile against each local Go and Nest: 18 PASS, 4 excluded Voice-profile SKIP each. The tooling's `test:live` name does not imply production: both targets were local fixture servers.
- Final diff/format/privacy hygiene: PASS. No runtime/contracts source modification.

## Safety boundary

No production HTTP smoke, VPS access, live Gemini benchmark, Upstash operation, production image build, deployment, Cloudflare/Vercel change, DB data/schema/security mutation, migration, ingestion or snapshot publication occurred. Production database access was restricted READ-ONLY repository observation only; existing session read-only initialization was reused. Migrations and transient role prerequisites occurred only in the task-owned disposable local parity database. No credentials or private paths are included here. No commit/push. Part17 not started.
