# Production Part 14 — Network perimeter, Phase A

Status: **READY_FOR_EXTERNAL_REVIEW**.

Scope: **Part14 Phase A only**. Cloudflare/DNS/Tunnel/TLS/DNSSEC/VPS remain
**NOT ACTIVATED** and require separate **Phase B authorization**.

Initial blocker: **PART14_BASELINE_CI_GATE_NOT_CONFIRMED — RESOLVED**.

## Immutable source preflight

- Branch: `integrate/full-stack`.
- `git fetch origin --prune`: PASS.
- Working tree before this report: clean.
- `PART14_BASE_SHA = 5f59e04cb863b02a99853dfd54fa2874eca7deec`.
- HEAD and `origin/integrate/full-stack` both equal this SHA.
- Baseline commit: `feat(prod): add representative performance baseline`.

## Initial CI blocker history (preserved)

The baseline has an existing [GitHub Actions run 37374046839](https://github.com/kiratonine/AdilBaga/actions/runs/37374046839).
Read-only GitHub API checks confirmed the run's exact head SHA matches
`PART14_BASE_SHA`. At the final check, the run remained `queued` with no
conclusion:

| Job | Observed result |
| --- | --- |
| Security | completed / success |
| Go Quality | completed / success |
| Frontend | completed / success |
| Nest Reference | queued |
| Contracts | queued |
| CI Gate | not present in the returned jobs; PASS not proven |

The owner's Part14 prerequisite requires CI Gate PASS when CI has started
for this SHA. Partial job success is not sufficient. Phase A implementation
therefore did not begin. No workflow was changed, rerun or cancelled.

## Initial stopped-run scope and verification status

Source inspection was read-only. No runtime, frontend, contracts, deployment
or infrastructure configuration was changed. No Cloudflare, DNS, VPS,
Railway, database or provider operation was performed.

Focused Go checks, perimeter verifier, topology/checklist implementation and
review archive creation: **NOT RUN / NOT CREATED**, pending the baseline CI
prerequisite. This report is the only working-tree change.

## Original resume condition (now satisfied)

Confirm `CI Gate` success for the exact baseline SHA, then recheck provenance
and continue the same Part14 Phase A. Do not treat this report-only preflight
stop as completed Phase A or authorization for external infrastructure changes.

## Resume provenance and resolved CI gate

Continuation re-ran `git fetch origin --prune`. Branch remains
`integrate/full-stack`; HEAD=origin=PART14_BASE_SHA. The only pre-existing change
was this known untracked report; no unknown change was present. Nothing was
reset/restored/rebased. Accepted Part13 evidence remains unchanged.

Independent read-only GitHub API verification now confirms run `37374046839`
**completed / success**, exact head SHA matching PART14_BASE_SHA, and
**CI Gate job `111985393088` completed / success**. All mandatory jobs completed
success: Security, Go Quality, Frontend, Nest Reference, Contracts, PostgreSQL
Integration, Ephemeral Staging. The original CI blocker is resolved, not hidden.

## Current infrastructure and source audit

Railway retired; VPS not provisioned, domain not purchased, Cloudflare zone/tunnel
absent. `aktau.market` and `api.aktau.market`: **PLANNED ONLY / NOT OWNED /
NOT RESOLVED / NOT ACTIVE**. NOT RESOLVED means unverified, not a DNS result.

| Area | Source evidence and finding |
| --- | --- |
| Proxy | `middleware/proxy.go`: RemoteAddr first, empty trust ignores headers, only trusted immediate peer may supply CF/XFF; single valid CF preferred, duplicates/malformed/present-empty CF revert to peer without XFF fallback; absent CF uses validated right-to-left XFF |
| Normalization | IPv4-mapped IPv6 unmaps; zoned/malformed header values fail safe; nearest untrusted XFF hop prevents leftmost spoofing |
| CORS | `config/config.go`, `middleware/http.go`: exact allowlist, production HTTPS/no wildcard/localhost; absent Origin allowed for non-browser requests, POST preflight supported; CORS is not auth |
| Abuse | General 20 RPS/burst40, Voice 2 RPS/burst4, concurrency4; bounded 8192-client instance-local limiter with idle TTL10min, health/OPTIONS general exemption; unchanged |
| Privacy | Access logs use route pattern/unmatched and bounded request ID, no client IP/raw query/body/precise coordinates/session payload/secrets; existing privacy tests retained |
| HTTP | Body1MiB, URI16KiB, header/read/write/idle timeouts and request deadline unchanged; sanitized errors and panic recovery; no public metrics |
| Cache | Voice JSON writes, health and errors set no-store; successful GET TTL/ETag not frozen; planned launch edge bypass avoids stale snapshot caching |
| Headers | API nosniff/no-referrer and Next CSP/frame/permissions safeguards unchanged; HSTS absent intentionally |
| Origin | `httpapi.NewServer` binds `:<PORT>` inside namespace; Docker EXPOSE is metadata, not isolation. Future loopback publication or private container placement must enforce the boundary and verify actual NAT peer |

No implementation defect requiring a runtime change was found in this focused
audit. **Runtime delta NONE**. Added only missing focused tests: duplicate CF
(including identical duplicate values), comma/empty/zoned CF, mapped client,
adjacent untrusted peer against exact /32; no-Origin POST/allowed/denied browser
and POST preflight. This is local middleware evidence, not live Siri/edge proof.

## Design, control matrix and Phase B boundary

Detailed source-backed policy:
[NETWORK_PERIMETER.md](../NETWORK_PERIMETER.md),
[activation checklist](../CLOUDFLARE_ACTIVATION_CHECKLIST.md),
[operator artifacts](../../../ops/cloudflare/README.md).

Recommended architecture: Cloudflare HTTPS edge → encrypted outbound Tunnel →
cloudflared on future VPS → loopback/private Docker Go API. **No public inbound
API origin port**. Host and dedicated-container options are documented; actual
placement/peer awaits provisioned VPS. Exact measured /32 or /128 peer only;
no broad Docker/private/LAN/Cloudflare-edge trust. No runtime HOST setting is invented.

| Control | Policy | State |
| --- | --- | --- |
| Domain/proxied DNS | approved frontend target; API Tunnel route, not origin IP | PLANNED / NOT ACTIVATED |
| Tunnel/private origin | measured private peer, catch-all404, no public API port | PLANNED / NOT ACTIVATED |
| WAF/DDoS | Free Managed Ruleset, intended edge protection, observed-abuse rules only | PLANNED / NOT ACTIVATED |
| Edge rate limit | verify actual plan entitlement/actions; calibrate against real traffic/Siri/provider budget, not local40RPS | PLANNED / NOT ACTIVATED |
| Voice/Siri | non-browser no-Origin JSON/form, direct+continue; no JS challenge/interactive Access gate | PLANNED / NOT ACTIVATED |
| Cache | Voice POST no-cache; entire API hostname bypass at launch including health/errors; safe GET caching deferred until Part16 | PLANNED / NOT ACTIVATED |
| HTTPS/DNSSEC | valid chains/HTTP behavior, nameservers then DS/zone proof | PLANNED / NOT ACTIVATED |
| HSTS | no header change, no preload/blind includeSubDomains | DEFERRED until Phase B HTTPS proof |
| Fallback | separately reviewed Full (strict) valid TLS origin + Cloudflare-only ingress firewall, direct origin denied | PLANNED / NOT ACTIVATED |
| Alerts/edge logging | future private delivery, privacy/retention review; no public metrics | DEFERRED |

Safe YAML template has only Tunnel/credential-path placeholders, loopback service
illustration and final catch-all404, NOT ACTIVE. No actual UUID/token/file path
is created. Future secret custody is private 0600/equivalent outside repo, separate
from application credentials, least privilege and verify-before-revoke rotation.

Phase B prerequisites: new explicit owner approval, purchased final domain,
Cloudflare account/zone/plan, VPS platform, frontend target, actual placement/NAT
and exact peer, pinned verified cloudflared binary/image, egress and rollback.
The future matrix covers frontend/API HTTPS, health, frozen GETs, Voice direct+
clarification, CORS/preflight, forged headers/IPv6, direct-origin blocking, no-cache,
metrics404, WAF/rate compatibility, DNSSEC and conditional HSTS. **All external
checks NOT RUN**. Public Part15 traffic must wait for Phase B perimeter proof.

Rollback concept: disable bad edge rules individually; remove public route/stop
Tunnel while keeping API private. Never open origin as recovery. Coordinate
actual DNS TTL/DS; consider persistent client HSTS before any later enablement.
No frontend hosting provider, VPS layout or Cloudflare thresholds were guessed.
Vendor behavior was checked only through public official documentation; no
planned domain/API, infrastructure, database or real provider probes were made.

## Local verification

Commands run from `backend-go` with PATH=/usr/local/go/bin:$PATH and
GOTOOLCHAIN=local; external operator command wrapper is RTK:

| Command | Actual result |
| --- | --- |
| `gofmt -w internal/middleware/middleware_test.go` | completed; test-only formatting |
| `go test -count=1 ./internal/config` | PASS |
| `go test -count=1 ./internal/middleware` | PASS |
| `go test -count=1 -race ./internal/middleware` | PASS; no race finding |
| `go vet ./internal/config ./internal/middleware` | PASS exit0 |
| `go tool staticcheck ./internal/config ./internal/middleware` | PASS exit0 |
| Explicit TestProxy, TestProxyExactPeerCFHeaders, TestCORSNonBrowserVoice, privacy/metrics/Voice limit tests | PASS |
| `node --test scripts/network/verify-part14.test.mjs` | PASS 16/16, 0 failed, including commented activation-claim rejection |
| `node scripts/network/verify-part14.mjs` | PASS offline policy checks |
| `node --check scripts/create-clean-archive.mjs` | PASS |
| `node scripts/ci/check-source.mjs` | PASS bounded known-pattern source/security check |
| `git diff --check` | PASS |
| Protected runtime/API source diff (`backend`, `frontend`, `contracts`, frozen API doc, proxy/http/config/Dockerfile) | empty, unchanged |
| `node scripts/create-clean-archive.mjs production-part-14` | PASS permanent target |
| `node scripts/network/verify-archive.mjs` | PASS 421 safe regular unique members; source/report byte-match; six runbooks; bounded secret scan |

During verifier development one negative HSTS test exposed a loose assertion
matching an unrelated deferred mention. Corrected to require explicit
`HSTS: DEFERRED`; the 15-test suite then passed. Added commented activation-claim
coverage before final rerun. No runtime assertion failure or source fix occurred.
Full performance/API/DB/provider matrix not rerun: runtime unchanged and no such
Phase A requirement. No live Cloudflare/TLS/DNSSEC/Siri PASS is claimed.

## Changed files and archive

- `docs/production/NETWORK_PERIMETER.md`
- `docs/production/CLOUDFLARE_ACTIVATION_CHECKLIST.md`
- `docs/production/reports/PART_14_REPORT.md` (same report, preserved history)
- `ops/cloudflare/README.md`
- `ops/cloudflare/cloudflared-config.example.yml`
- `scripts/network/verify-part14.mjs`
- `scripts/network/verify-part14.test.mjs`
- `scripts/network/verify-archive.mjs`
- `scripts/create-clean-archive.mjs` (permanent `production-part-14` target)
- `backend-go/internal/middleware/middleware_test.go` (focused coverage only)

Review output: `artifacts/production-part-14-review.tar.gz`.
Archive verification PASS: 421 safe regular unique members, all source/report
byte-match, six runbooks retained, bounded secret scan. No real env, Cloudflare
token/credential JSON, private keys, DB backups/dumps, GPG material, node_modules,
build outputs, Go binaries or temporary artifacts. Verification is bounded
known-pattern/artifact screening, not an exhaustive secret-detection guarantee.
The final report is rebuilt into the archive and checked again byte-for-byte.

No domain purchase/zone/tunnel/DNS/VPS/firewall/SSH/DB mutation, cloudflared
installation/run, deployment, commit or push. Phase B remains separately
authorized future work; stop after Phase A artifacts for external review.
