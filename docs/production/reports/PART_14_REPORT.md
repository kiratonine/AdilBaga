# Production Part 14 — Network perimeter, Phase A + Phase B

Status: **READY_FOR_EXTERNAL_REVIEW**.

External-review follow-up: package classification completed read-only; exact
active Voice rule expression confirmed by owner Dashboard inspection. Both
evidence gaps resolved. Previous perimeter PASS evidence is preserved.
Part15 remains NOT STARTED.

Current scope: **Part14B perimeter activation only**, explicitly authorized by
the owner. Gates A–T and administrative cleanup passed. Gate P settings and
DNSSEC Dashboard confirmation are owner evidence; external behavior, public
DNSSEC and reboot persistence were independently checked. Tunnel/perimeter active;
application origin intentionally absent until separately authorized Part15.
Go API is **NOT DEPLOYED**; Part15 is **NOT STARTED**.

The following Phase A evidence is preserved as historical evidence, including
its initial BLOCKED/CI history and final **READY_FOR_EXTERNAL_REVIEW** outcome.
Its “no VPS/domain” and “NOT ACTIVATED” statements describe that earlier run,
not the current VPS inventory. Current Phase B facts are appended below.

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

## Phase B — Cloudflare + network perimeter activation

Date: 2026-10-07. Scope: TODO Part14B, no Part15 or application rollout.
Production PostgreSQL remains Supabase; no DB connection/operation was performed.

### Gate A — immutable preflight PASS

Fresh fetch/prune PASS; branch `integrate/full-stack`; HEAD and origin both
`b5ef421ee6a02c26576c5fd2f68b02779cbf2b56`; working tree initially clean.
Previously verified accepted post-merge CI run37542875578 completed/success,
all9 mandatory jobs including CI Gate success. No rebase/reset/commit/push.

### Gates B–D — VPS/admin/SSH PASS

Verified Ubuntu24.04, 2CPU, RAM3915MiB, root ext4 disk50G. Initially root access,
public listeners SSH only; system resolver port53 was loopback-only, not public.
Global IPv6 addresses0; enabled IPv6 firewall rules still preserve SSH-only ingress.
No public IP, SSH key or private identity file is recorded here.

Created `deploy` with disabled password, sudo membership, existing authorized
public keys installed privately with directory0700/file0600. Dedicated sudoers
file0440 validated with visudo. Independent new `User=deploy` connection:
actual identity deploy, `sudo -n true` PASS. No docker-group membership.

Existing WSL SSH alias config backed up privately with0600; changed only the
unique `Host my-vps` User root→deploy. Fresh alias connection and sudo PASS;
backup retained pending external acceptance.

SSH drop-in `60-adil-baga.conf` sets reviewed key-only/no-root/X11/agent policy.
Inspection proved earlier `50-cloud-init.conf` supplied PasswordAuthentication=yes:
OpenSSH first-value precedence required a narrow additional
`00-adil-baga-password.conf` overriding only PasswordAuthentication=no.
Main config/cloud-init files were not rewritten. Effective sshd -T confirmed
pubkey=yes, password=no, kbdinteractive=no, root=no, empty-password=no,
X11=no, agent-forwarding=no. sshd -t, reload and independent new deploy access PASS.
Password-only negative attempt failed authentication as expected.

### Gate E — Ubuntu24.04 updates/reboot PASS

Normal apt update/upgrade/autoremove completed exit0: 49 packages upgraded,
5 packages kept back by apt; no dist-upgrade/release upgrade. Reboot-required
was honored. Bounded fresh SSH polling after reboot succeeded as deploy with
sudo; OS24.04 retained, kernel6.8.0-142-generic. Later dpkg --audit returned empty,
AppArmor active, no remaining reboot-required. An AppArmor maintainer-script
warning occurred during updates; installation exited0 and service state was verified,
not silently treated as a failed package update or full AppArmor profile audit.

### Gates F–H — firewall/container runtime/cloudflared PASS

UFW active: default incoming deny/outgoing allow, only OpenSSH22/tcp allowed
for IPv4 and IPv6. No80/443/8080/7844 inbound rule. Fresh deploy SSH after enabling
firewall PASS. Listener inventory confirmed public SSH only.

Installed Docker Engine from official Docker Ubuntu apt repository, not a
convenience script: Engine/client29.8.2, Compose5.6.0. Docker active/enabled;
containers0; no Go image build or application container. Deploy remains outside
docker group; sudo docker only. Future publication must be
`127.0.0.1:8080:8080`; UFW alone does not protect Docker-published ports.

Installed VPS cloudflared from official signed Cloudflare apt repository:
**2026.10.0**, apt hold applied. Outbound Tunnel endpoint DNS resolution PASS;
no inbound tunnel port opened. Existing local WSL cloudflared2026.9.1 available.
At completion of Gate H, cloudflared service/tunnel were not yet installed/started;
the subsequent service activation is recorded below.

Installation references: [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
and [Cloudflare package repository](https://pkg.cloudflare.com/).

### Gate I — browser authorization RESOLVED / PASS

No existing local account certificate or API token was available. Started local
`cloudflared tunnel login`; owner was given the generated browser authorization
link and exact action: select aktau.market and Authorize. Owner confirmed completion;
cloudflared independently reported successful login. Local certificate0600/
directory0700 verified. No secret requested. Account certificate never went to VPS/Git.

Created reviewed named locally-managed Tunnel and API hostname DNS route using
local authenticated certificate. Initial CLI empty inventory returned JSON null;
sanitized operator parsing corrected without a duplicate tunnel/runtime change.

### Gates J–O — Tunnel/config/probe/HTTPS/origin isolation PASS

Only per-tunnel JSON transferred: root:root0600, directory0700; temporary VPS
credential copy removed. Live config root:root0600. Root/deploy account certificate
absence on VPS verified. No UUID/account ID/token/payload recorded here.
Ingress validate PASS; API selects http://127.0.0.1:8080; unrelated hostname
selects http_status:404. Cloudflared active/enabled; private journal inspection
found registered Tunnel connection, no detected credential error; raw logs withheld.

Temporary probe: non-root deploy/transient systemd/NoNewPrivileges, no request
logging, no-store responses, exact127.0.0.1:8080 listener. External HTTPS GET
returned expected probe JSON with cf-ray; TLS validation PASS. Independent
openssl certificate subject aktau.market, issuer Let's Encrypt YE2, validity
2026-10-07 through2027-01-05. Edge DNS A2/AAAA2 do not expose the VPS origin.
This is perimeter proof, not frontend/application deployment.
External direct IPv4 TCP22 reachable;80/443/8080 denied (bounded3s attempts).
No global VPS IPv6: direct-origin IPv6 N/A, not PASS. IPv6 UFW SSH-only retained.

### Gate P — initial authenticated dashboard action pending (resolved)

Owner received exact UI steps: Free Managed Ruleset/no Access or blanket challenge;
API hostname cache bypass; one path-only/IP Free Voice20requests/10s Block10s rule;
Always Use HTTPS on/HSTS off. No token requested. Settings NOT VERIFIED pending
confirmation. DYNAMIC/no-store probe response alone does not prove a Cache Rule.
Controlled rate burst/recovery, post-setting cache/HTTP policy, DNSSEC UI/DS/
validating resolver proof and final Tunnel reboot persistence NOT RUN.

Probe stopped/removed at checkpoint: origin8080 listener absent, Docker and
cloudflared active/enabled. Real Go/API/CORS/Siri checks remain Part15-only;
TRUSTED_PROXY_CIDRS unmeasured/empty; HSTS: DEFERRED. Resume by restoring only
the temporary probe after Gate P confirmation, then run remaining gates in order.
Local creation credentials remain private pending final administrative cleanup.

### Phase B documentation/static adaptation

Phase A history preserved. Network design/checklist/operator runbook now include
accurate in-progress Phase B sections. Example config unusable/placeholder-only.
Verifier allows Phase B activation wording/checkboxes without asserting live truth;
retains credential/key/token/public-origin/UUID/catch-all/wide-trust controls and
rejects false Go deployment claims. Actual proxy peer still deferred to Part15.
Local AGENTS status subsection corrected to Part14B CURRENT/Part15 NOT STARTED;
policy sections unchanged.

### Local checks / safety

Focused `go test -count=1 ./internal/config ./internal/middleware` **PASS**;
same packages with `-race` **PASS**. Updated offline verifier tests **PASS16/16**,
static verifier **PASS**, archive verifier syntax check **PASS**. These are
artifact checks, not live activation evidence. Runtime/contract source unchanged.

Only approved Part14 docs/template/verifier/tests and local AGENTS status changed;
same report/Phase A history retained.
No production DB access/write, migrations, ingestion, new snapshot, provider secrets,
Go rollout, Part15, scheduler, commit or push. Probe stopped/removed; no Go origin.

Previous checkpoint: **BLOCKED — CLOUDFLARE_EDGE_CONFIGURATION_UI_PENDING**.
Review archive rebuilt with permanent production-part-14 target: **PASS501 safe
regular unique members**, all source/report byte-match, six runbooks retained;
known-pattern and actual private tunnel-credential scans **PASS**. No .env,
tunnel JSON/account cert/keys/tokens, DB backups or build/test artifacts included.
`git diff --check` PASS; protected runtime/contracts diff empty. Final report is
rebuilt/byte-checked again after this evidence update. Full Part14B acceptance
is not claimed. Next exact action is owner dashboard confirmation of Gate P,
then resume remaining live gates without repeating VPS setup or starting Part15.

### Gate P resumed — owner Dashboard confirmation

Owner reports Free Managed Ruleset enabled/verified; API hostname cache rule
deployed with Bypass cache; Voice rule matches exact /api/voice/start OR
/api/voice/continue, confirmed by owner follow-up Dashboard inspection. IP counting,
20 requests/10 seconds, Block for10 seconds,
no method condition. Always Use HTTPS ON; HSTS OFF. This is explicit owner
Dashboard evidence, not an independently authenticated settings/API audit.
The previous edge-configuration UI blocker is RESOLVED.

### Gate Q — live edge behavior PASS

Temporary loopback-only probe recreated for verification, not Go deployment.
Three HTTPS GETs returned200, CF-Cache-Status DYNAMIC, no Age, no cache HIT;
HTTP HEAD returned301 to the HTTPS hostname, HTTPS HEAD returned200.
Non-browser HTTPS POST to continue returned200. Controlled start burst:
24 requests total, 20 returned200 and4 returned429 with cf-ray, no browser/JS
challenge. After12 seconds, normal start POST returned200. No Voice/provider
calls occurred: responses came only from the temporary no-store probe.

### Gate R — public DNSSEC PASS; initial Dashboard confirmation pending (resolved)

WSL dig is absent; the required public queries were executed on the VPS instead.
DS visible through1.1.1.1 and8.8.8.8; validating1.1.1.1 SOA response NOERROR,
signed RRSIG and authenticated `ad` flag. Default VPS resolver initially returned
no DS, so independent validating public resolvers were explicitly queried.
Owner asked to confirm Dashboard DNSSEC Active/Confirmed without toggling it.
Gate S reboot and final cleanup follow only after that confirmation.
Probe stopped and its temporary source removed again at this checkpoint;
8080 listener absent, cloudflared/Docker active. No temporary application origin
is left running while waiting for owner confirmation. Local account management
credential cleanup remains pending final Tunnel persistence proof.

### Gates R–T final completion and administrative cleanup

Owner confirms Dashboard: “Success! aktau.market is protected with DNSSEC.”
Public DS again visible at1.1.1.1/8.8.8.8; signed SOA has authenticated `ad`.
DNSSEC Dashboard confirmation blocker RESOLVED; no repeated enable/disable.

Controlled VPS reboot PASS: fresh SSH returned as deploy after17 seconds;
uptime under1 minute, Ubuntu24.04/kernel6.8.0-142-generic retained. Docker and
cloudflared both active/enabled without reinstall/reconfiguration. Transient
probe restarted only for final edge proof: HTTPS200, expected probe JSON/cf-ray.
This proves Tunnel recovery, not Go readiness or application deployment.

Probe stopped, remote/local temporary Python source removed. Final80/443/8080
listeners absent; Docker containers empty, cloudflared/Docker active. sshd syntax
PASS; effective root/password/kbd-interactive authentication disabled,
pubkey enabled. UFW incoming/routed deny, outgoing allow, SSH22 only IPv4/IPv6.
Cloudflared QUIC UDP sockets are outbound transport, not permitted inbound
application ports. Final external direct-origin TCP proof again SSH22 reachable,
80/443/8080 denied; IPv6 direct-origin N/A because no global VPS IPv6 exists.

Active VPS credential/config retained root:root0600 in root-owned0700 directory.
No account certificate on VPS. Actual private UUID/credential-value scan of
changed files PASS before cleanup. Temporary WSL per-tunnel JSON and account
certificate removed, no secure-erasure claim; future account management needs
re-authentication. Private non-secret tunnel state remains outside repo.

### Final acceptance and remaining boundary

HEAD/origin remain accepted b5ef421ee6a02c26576c5fd2f68b02779cbf2b56.
Docker29.8.2/cloudflared2026.10.0 held; active/enabled after reboot. Public
API DNS exposes Cloudflare A/AAAA, not origin; TLS certificate verified again.
HSTS remains OFF/DEFERRED. TRUSTED_PROXY_CIDRS remains empty/unmeasured.
WAF/cache/rate configuration attribution is owner Dashboard confirmation;
cache/HTTPS/mitigation/recovery/DNSSEC/Tunnel behavior is independent live proof.

Go API NOT DEPLOYED. Real health/catalog/Voice/CORS/immediate Docker peer and
physical Siri remain NOT RUN, separately authorized Part15 scope. Probe removed,
so edge origin-unavailable responses are expected, not a running application.
No production PostgreSQL/provider access, DB mutation, migrations, ingestion,
new snapshot, commit or push. Runtime/backend/frontend/contracts/data diff empty.
All earlier Phase A and Phase B blocker/checkpoint history retained above.
Final offline verifier PASS, tests16/16 PASS, archive verifier syntax PASS,
git diff --check PASS. Permanent production-part-14 archive rebuilt and verified:
501 safe regular unique members, every source/report byte matches, six runbooks
retained, bounded secret scan PASS. No env/credential/certificate/key/tunnel JSON,
DB backup, temporary workspace or build/test artifact included. The report's
final evidence paragraph is included by rebuilding and verifying the archive again.
Previous candidate status: **READY_FOR_EXTERNAL_REVIEW**; stop before Part15.

### Final external-review evidence correction — remaining packages

Read-only `apt-mark showhold`, `apt list --upgradable`, `apt-get -s upgrade`,
`apt-get -s full-upgrade`, package policy and metadata inspection completed.
Only intentional hold: cloudflared2026.10.0. Five pending upgrades:

| Package | Installed | Candidate | Candidate origin |
| --- | --- | --- | --- |
| fwupd | 1.9.34-0ubuntu1~24.04.1 | 2.0.20-1ubuntu2~24.04.2 | noble-updates only |
| linux-firmware | 20240318.git3b128b60-0ubuntu2.27 | 20240318.git3b128b60.0ubuntu3.1 | noble-updates only |
| linux-generic | 6.8.0-142.142 | 6.8.0-146.146 | noble-updates only |
| linux-headers-generic | 6.8.0-142.142 | 6.8.0-146.146 | noble-updates only |
| linux-image-generic | 6.8.0-142.142 | 6.8.0-146.146 | noble-updates only |

Upgrade simulation:0 upgraded/new/removed,5 kept back. Full-upgrade simulation:
5 upgrades,27 new dependencies,0 removals. No Phased-Update-Percentage metadata
found for these candidates; classification is non-security-pocket dependency
transition, not an asserted phased rollout. Kernel meta installed versions match
the available noble-security versions; installed firmware2.27 is newer than
the security-pocket2.26. No pending installed-package security-pocket upgrade
was identified in current apt metadata. This is not an exhaustive CVE audit.

Full-upgrade lists libdrm-amdgpu1 from both updates/security, but it is currently
not installed and is a new dependency, not a withheld installed security update.
No full-upgrade, package install, autoremove, apt refresh, release upgrade,
reboot, runtime/topology/configuration/DB change performed in this correction.

### Final external-review evidence correction — Voice expression

Initial evidence gap **VOICE_EXPRESSION_NOT_CONFIRMED — RESOLVED**. Owner
inspected the active Dashboard rule and confirms exact path equality, not prefix:

```text
(http.request.uri.path eq "/api/voice/start") or
(http.request.uri.path eq "/api/voice/continue")
```

This records the confirmed match semantics in Cloudflare expression notation;
not a claim about cosmetic parenthesis/formatting in an API-exported rule.
No HTTP method condition. Counting characteristic IP;20requests/10seconds;
Block; mitigation10seconds. No credential request, rule edit or new edge burst.
No inference from prior rate behavior is used to choose this expression.

Correction checks: verifier tests16/16 PASS, static verifier PASS,
git diff --check PASS. Archive safe-members/source-report byte-match/bounded
secret scan PASS; final archive rebuilt again with this owner-confirmed evidence.
Only this report was edited in this follow-up; no runtime/contracts/DB/topology
changes, installs, Part15, commit or push. Final status:
**READY_FOR_EXTERNAL_REVIEW**.
