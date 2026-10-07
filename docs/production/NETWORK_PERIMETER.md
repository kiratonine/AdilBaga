# Network perimeter — Part14 Phase A / Phase B

## Current Phase B state — perimeter activated

Owner authorized Part14B on baseline `b5ef421ee6a02c26576c5fd2f68b02779cbf2b56`.
VPS exists: Ubuntu24.04, deploy key-only SSH, UFW incoming deny/SSH only,
Docker active. Host cloudflared2026.10.0 is held and runs a locally-managed
Tunnel to `http://127.0.0.1:8080`, with final catch-all404.
`api.aktau.market` DNS/Tunnel/HTTPS probe passed; origin80/443/8080 externally
denied over IPv4. No global VPS IPv6; edge A/AAAA do not expose the VPS origin.

**Go API: NOT DEPLOYED**. Part15 is NOT STARTED. Temporary probe removed;
application origin intentionally absent until Part15. Docker/Tunnel survived
controlled reboot; final HTTPS probe succeeded before removal.
Owner Dashboard evidence confirms Free Managed Ruleset, API cache bypass,
Voice IP20/10s Block10s, Always Use HTTPS ON/HSTS OFF, DNSSEC confirmed.
Independent edge checks: no cache HIT/Age; HTTP301; controlled Voice429 and
recovery without browser challenge; DS visible and validating SOA authenticated.
HSTS: DEFERRED; no HSTS/preload activation. Temporary WSL account certificate
and tunnel credential copy removed; active VPS per-tunnel credential retained.
Future `CORS_ALLOWED_ORIGINS=https://aktau.market`; proxy trust remains empty:

```text
TRUSTED_PROXY_CIDRS=
```

Measure the actual Go container immediate peer only in Part15, then set exact
/32 or /128. No public API host bind or broad proxy trust. Real API health,
GETs, Voice, CORS/spoofing and physical Siri are deferred to Part15, not proved
by the probe. See the same Part14 report for actual gate evidence.

## Preserved Phase A design history

The following inactive/unowned infrastructure statements describe Phase A,
not today's provisioned VPS and routed API hostname.

Status: **PLANNED / NOT ACTIVATED**. This is design and local source evidence,
not Internet perimeter proof. Railway is retired; VPS, domain, Cloudflare zone
and tunnel do not exist. No external mutation is authorized by this document.

## Planned hostnames and boundaries

| Name | Purpose | Current state |
| --- | --- | --- |
| `aktau.market` | Next.js frontend | PLANNED ONLY / NOT OWNED / NOT RESOLVED / NOT ACTIVE |
| `api.aktau.market` | Go frozen-v1 API | PLANNED ONLY / NOT OWNED / NOT RESOLVED / NOT ACTIVE |

NOT RESOLVED means **not verified here**, not a DNS lookup result. No public
network probes were performed. The frontend hosting target is undecided and
belongs to Part15; do not invent a provider or DNS target. Public Go traffic
cutover is not authorized. NestJS remains the reference.

## Recommended Tunnel topology — PLANNED / NOT ACTIVATED

```text
Internet → Cloudflare Edge (HTTPS, WAF/DDoS, abuse controls)
         → authenticated encrypted outbound Tunnel
         → cloudflared on future VPS
         → loopback/private Docker connection → Go API
```

**Origin exposure invariant: no public inbound API origin port.** Public API
DNS should be a proxied Tunnel route, not an origin-IP record. Tunnel connections
are initiated outbound, so API traffic needs no public origin listener.
See [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/).
This hides the origin from normal API routing, not a promise of total IP anonymity.

Choose placement only after the actual VPS/network layout is approved:

| Option | Private reachability | Trust boundary |
| --- | --- | --- |
| Host cloudflared | API container published to `127.0.0.1:<API_PORT>:8080` only | Measure actual Go RemoteAddr; Docker NAT may change the immediate peer |
| Container cloudflared | Dedicated reviewed private network with API; no API host-port publication | Exact stable cloudflared peer address, measured and pinned in deployment |

The current `httpapi.NewServer` listens on `:<PORT>` **inside its namespace**.
`PORT` does not select a host bind address. Docker `EXPOSE 8080` is metadata,
not public publication or isolation. Do not run the current binary directly on
a public host and call it loopback-bound. Host mode above uses an explicit
loopback Docker publication; verify actual host/container listeners in Phase B.
Container placement must allow the reviewed outbound DB/Gemini/Upstash/Tunnel
connections without opening API ingress; blindly using a fully isolated Docker
network can break required egress. No production compose/firewall is created now.
Loopback/private access also trusts authorized local processes: isolate peers
and maintain host/container least privilege. Measure, do not assume the peer.

## Source-backed proxy audit and exact-peer policy

`internal/middleware/proxy.go` resolves RemoteAddr first, unmapped to IPv4 where
appropriate. Empty TRUSTED_PROXY_CIDRS ignores forwarding headers. Only a trusted
immediate peer may supply CF-Connecting-IP or X-Forwarded-For (XFF).

- Exactly one valid CF-Connecting-IP wins, normalized with Unmap.
- Duplicate, empty, comma-joined, malformed or zoned CF values fall back to peer;
  **they do not fall through to XFF**. XFF is used only when CF is absent.
- XFF is validated as a complete chain, walked right-to-left to the nearest
  untrusted hop; malformed chains fall back to peer.
- An untrusted peer cannot forge limiter identity with either header.

Future config is illustrative only, not an active env file:

```text
APP_ENV=production
CORS_ALLOWED_ORIGINS=https://aktau.market
TRUSTED_PROXY_CIDRS=<EXACT_IMMEDIATE_PEER_CIDRS>
```

Deployment policy: exact measured peer(s), IPv4 `/32` or IPv6 `/128`; no arbitrary
subnet. Do not trust `0.0.0.0/0`, `::/0`, office/home LAN, all RFC1918, all Docker
networks or all Cloudflare edge ranges in Tunnel mode. Broad ranges accepted by
the general runtime parser are not deployment recommendations. Any justified
range expansion needs separate review. Without a known peer, leave trust empty.

In Phase B prove Cloudflare overwrites/removes forged public headers and preserves
the intended client IP, including IPv6. Review Workers/header transforms; do not
enable visitor-IP removal or Pseudo IPv4 overwrite blindly. Header names alone
never establish trust. See [Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/).
Resolved IP is transient rate-limit state, not identity, analytics or log data.

## CORS and Voice/Siri compatibility

Current config requires exact origins, rejects wildcard/userinfo/path/query and
production HTTP/localhost/loopback. Planned browser allowlist is only
`https://aktau.market`; www/preview/temporary origins require separate approval.
Runtime permits GET/POST/OPTIONS preflight with Accept, Content-Type, X-Request-ID;
unknown origins are JSON 403, with Vary: Origin and no credential allowance.

Siri/Shortcut and Next server requests can have **no Origin**; runtime permits
them. CORS is a browser boundary, **not authentication**. No secret API token
inside a Shortcut is treated as access control. Preserve JSON and compatible
legacy form Voice transport, 201 result/clarification, opaque session IDs and
the existing limits. No new voice-text maximum or public DTO change.

Never require JavaScript challenges, browser cookies, interactive Cloudflare
Access login or global bot challenges for Voice POST start/continue. Regression
must include non-browser direct + clarification/continue and eventual physical
Shortcut. A challenged response is not frozen-v1 success. If an edge feature
requires CSP scripts/beacons, STOP for review rather than widening Next CSP.
See [Challenge Pages compatibility](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/).

## WAF, DDoS and rate limits — PLANNED / NOT ACTIVATED

Enable the Free Managed Ruleset and intended edge DDoS protections only in Phase B,
then test normal GET, JSON/form Voice and preflight. Managed protections first;
observe abuse, then add narrow evidence-based bot/security rules. Avoid blanket
challenges. [Managed rules](https://developers.cloudflare.com/waf/managed-rules/)
and [rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
depend on actual plan entitlement, available fields/actions and rule count.
Do not promise multiple independent host/method rules on a Free zone. Confirm
actual capabilities before activation; unsupported policy needs owner review.

Edge limits complement unchanged Go limits: general **20 RPS / burst 40**,
Voice **2 RPS / burst 4**, concurrency **4**. Application limiter state is
instance-local, max 8192 clients, idle TTL 10 min; not a distributed quota.
Health and OPTIONS are exempt from the general limiter, not automatically from
edge rules. Preserve explicit health/ops availability policy without exposing
private telemetry. Part13's local 40-RPS headroom is **not** an edge threshold or
VPS capacity claim. Choose edge thresholds/actions after expected real traffic,
Siri burst tests and provider budget; use predictable API blocking rather than
browser challenge responses. Edge-generated denials may differ from the Go
JSON envelope; record that boundary without changing normal API wire behavior.

## Cache policy — PLANNED / NOT ACTIVATED

Launch policy: **API cache bypass** on the entire approved API hostname, including
errors, health and Voice. Never apply Cache Everything to `/api/*`.
**Voice POST no-cache** for `/api/voice/start` and `/api/voice/continue`, every
success/error branch. Current Go Voice, health and errors set `Cache-Control:
no-store`; successful GETs have no frozen TTL/ETag. No runtime change is needed.
Explicit future edge bypass must win over any other account cache rule.

Phase B inspect Age and CF-Cache-Status across repeated GET/POST/error requests:
no HIT, no reusable response/session, no stale snapshot. DYNAMIC or BYPASS may
be expected depending on rule/response; verify behavior, not one label alone.
See [Cache Rules bypass](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/).
Potential future safe GET candidates: categories, filter discovery, product
reads and dashboard. **No GET caching is activated at launch**; Part16 snapshot
revalidation/purge correctness and freshness semantics must precede adoption.
Do not implement revalidate here. `/metrics` remains public 404.

## HTTPS, HSTS and DNSSEC — PLANNED / NOT ACTIVATED

Future public transport is HTTPS only. Edge HTTP behavior must be explicitly
verified: redirect for appropriate GETs; Voice clients call HTTPS directly and
must not rely on a redirect changing POST to GET. Certificate chains must be
valid for both names. Tunnel transport is authenticated/encrypted; the final
HTTP hop is acceptable only in the reviewed loopback/private boundary.

**HSTS: DEFERRED until Phase B real HTTPS proof.** Both current API and Next lack
HSTS intentionally. No preload or blind includeSubDomains. Only consider it
after TLS, frontend/API HTTPS, HTTP behavior, all subresources and rollback are
proved. HSTS persists in clients; disabling a header does not immediately undo
an existing cached policy. Do not use it as an unverified launch checkbox.

DNSSEC activation follows purchased domain, active zone/nameservers, registrar
DS coordination and validation of authoritative chain/zone status. Incorrect
DS can make the domain unreachable; record rollback before changing it. No DNS
queries/activation evidence exist in Phase A.
See [DNSSEC activation and DS coordination](https://developers.cloudflare.com/dns/dnssec/).

## Separate fallback — PLANNED / NOT ACTIVATED

If Tunnel is unavailable, separately review **Full (strict)** TLS plus origin
firewall: proxied DNS → TLS origin with valid matching unexpired certificate
→ ingress allowed only from reviewed current Cloudflare edge ranges → private
Go hop. Direct API origin access must fail, including alternate IPv6 paths.
Never Flexible or Full-without-validation; never expose Go `:8080` as fallback.
This is not a rollback shortcut. Fallback reverse proxy/IP trust must be reviewed
separately; edge firewall ranges do not become Tunnel application trust ranges.
No firewall tool/provider is selected here.
See [Full (strict) certificate requirements](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

## Secrets, privacy, monitoring

No Tunnel UUID/token/credential JSON/API token is created. Future credentials
stay outside Git/env examples/reports/archives, private 0600 with least-privilege
ownership or equivalent. Separate perimeter credentials from app DB/Redis/NLP
credentials; see [rotation runbook](../runbooks/secret-rotation.md).
No credentials in process logs, shell history or pasted commands.

Existing JSON access logs contain bounded request ID, route pattern/unmatched,
method, status, duration and error class, not raw path/query/body, IP, precise
coordinates, session payload/ID or credentials. X-Request-ID validation remains;
CF Ray ID is not adopted as application ID. Preserve nosniff/no-referrer and
Next CSP/frame/permissions protections. Future Cloudflare analytics/log delivery
must separately review IP/query retention/redaction and access; do not enable
full request logging by default. Part11 future tunnel/certificate/domain/host
alerts stay DEFERRED; no public metrics or collectors are introduced here.

## Phase B validation matrix — NOT RUN

Requires separate owner authorization, purchased domain, VPS/platform, frontend
target, actual cloudflared placement/peer, approved egress and private credentials.
The [activation checklist](CLOUDFLARE_ACTIVATION_CHECKLIST.md) records operator evidence.

| Future proof | Acceptance |
| --- | --- |
| Frontend HTTPS | expected page/SSR content, CSP intact, no required HTTP resources |
| API HTTPS + health | valid TLS; live/ready 200; sanitized JSON |
| Frozen GETs | categories/filters/list/detail/dashboard, normal contract unchanged |
| Voice non-browser | JSON + legacy form, direct + clarification/continue, no challenge |
| Browser CORS | exact origin + POST preflight allowed; unknown/suffix origin blocked |
| Spoofing | public forged CF/XFF cannot choose limiter identity; IPv4/IPv6 path verified |
| Direct origin | unreachable externally over every enabled address; no public API port |
| Cache | repeated Voice/health/API/error never HIT or reused |
| Private telemetry | `/metrics` 404; no exporter/DB/provider details exposed |
| HTTP/TLS/DNSSEC | documented HTTP behavior, valid chains, verified DS/zone status |
| WAF/DDoS/rate | activated capabilities recorded, controlled abuse denied; Siri preserved |
| HSTS | DEFERRED until all HTTPS and rollback proofs; separate decision |

## Rollback and unresolved inputs

Disable offending edge rule individually; revert cache rule rather than API.
For Tunnel deactivation remove/disable public DNS route and stop Tunnel while
keeping API private; account for real DNS TTL when known. Never open the origin
to recover availability. Keep prior rule/version evidence privately with safe
identifiers only; revoke perimeter credentials only after replacement verified.
DNSSEC rollback must coordinate DS/zone changes. HSTS rollback needs its cached
policy considered before enabling it.

Unknown: actual domain ownership, account/plan, VPS OS/provider, network/NAT,
frontend host, pinned cloudflared version/digest, egress/firewall, real edge
rate thresholds and monitoring delivery. Phase A does not invent these.
Part15 public traffic must wait for Phase B real perimeter proof; deployment
assembly/activation ordering must be separately reviewed before cutover.
