# Cloudflare activation checklist — future Phase B only

**PLANNED / NOT ACTIVATED**. Do not execute under Phase A authorization.
`aktau.market` and `api.aktau.market`: **PLANNED ONLY / NOT OWNED / NOT RESOLVED / NOT ACTIVE**.
NOT RESOLVED is unverified, not a DNS test result. Railway retired; no VPS,
domain, zone/tunnel or deployment exists. **HSTS: DEFERRED**.

Use [network design](NETWORK_PERIMETER.md) and [operator template](../../ops/cloudflare/README.md).
All boxes are intentionally unchecked; attach safe evidence and actual timestamps
during a separately authorized Phase B. Do not record tokens, DSNs or credential paths.

## Authorization and prerequisite decisions

- [ ] New explicit owner approval for Phase B; confirm final purchased domain.
- [ ] VPS OS/provider/network and frontend target selected, not assumed.
- [ ] Immutable reviewed API image/CI and rollback image approved for Part15.
- [ ] Actual cloudflared host/container placement selected; version and digest
      verified/pinned, no `latest`; approved installation procedure.
- [ ] Secret custody/rotation/least privilege prepared outside repo; no token
      in CLI logs/history or application env example.
- [ ] Record rollback for DNS/edge rules/tunnel and DNSSEC before activation.

## Future origin and trust boundary

- [ ] API no public inbound port: loopback-only container publication for host
      cloudflared OR no published port on dedicated private network.
- [ ] Check actual listeners for IPv4/IPv6; Go `:<PORT>` is not a bind-to-loopback setting.
- [ ] Measure actual immediate Go peer after NAT; set TRUSTED_PROXY_CIDRS only
      exact reviewed `/32` or `/128` peer(s). Empty until proved; never broad ranges.
- [ ] Verify no alternate public origin route; private hop only; required egress works.
- [ ] Create Tunnel only after approval, authenticated encrypted transport;
      private token/credential JSON 0600/equivalent, isolated from app secrets.
- [ ] Narrow ingress hostname and final catch-all `http_status:404`.
- [ ] Prove invalid host cannot route to API; no public management/metrics route.

## Future zone, DNS, HTTPS

- [ ] Zone created under approved account; domain ownership confirmed.
- [ ] Registrar nameservers active, authority verified; actual DNS TTL recorded.
- [ ] Approved frontend target proxied where compatible; provider not invented.
- [ ] API proxied DNS points to Tunnel route, not an origin IP.
- [ ] Public frontend/API certificate chain and hostnames valid; HTTPS GETs work.
- [ ] Explicit HTTP redirect/reject behavior verified; Voice POST uses HTTPS
      directly, preserving method/body, no insecure redirect dependency.
- [ ] No mixed-content resources; existing CSP/nosniff/frame/privacy headers intact.
- [ ] DNSSEC enabled after stable onboarding; registrar DS and authoritative
      chain verified; rollback coordinated, no unsupported DNSSEC claim.
- [ ] HSTS remains DEFERRED until frontend/API/TLS/HTTP/subresources/rollback
      proof; separate reviewed decision, no preload/blind includeSubDomains.

## Future edge controls and cache

- [ ] Confirm current plan's WAF/rate fields/actions/rule limits before choosing rules.
- [ ] Free Managed Ruleset enabled; intended DDoS protections verified.
- [ ] Managed protections tested on legitimate requests before narrow observed-abuse rules.
- [ ] No global JS challenge/interactive Access requirement on API or Voice;
      non-browser Siri/Shortcut + server-side Next requests work without Origin.
- [ ] Edge rate-limit policy documented/tested; thresholds based on traffic/provider
      budget, not copied from local 40 RPS; app defaults unchanged (20/40, Voice 2/4).
- [ ] Health/ops behavior intentional; public `/metrics` remains 404.
- [ ] Entire API hostname cache bypass at MVP launch, no Cache Everything.
- [ ] Voice POST no-cache start/continue, including success/clarification/errors.
- [ ] Health/errors no cache; repeated API GET/POST gives no HIT, reused session
      or stale response. Inspect Age/CF-Cache-Status; validate effective rule priority.
- [ ] GET caching deferred until snapshot freshness + Part16 revalidation proof.

## Future external validation matrix (NOT RUN in Phase A)

- [ ] `https://aktau.market` renders expected frontend/SSR and security headers.
- [ ] API `/health/live` 200 and `/health/ready` 200 with sanitized JSON.
- [ ] Frozen GET catalog/filter/product/dashboard contract regression.
- [ ] JSON and legacy form Voice direct 201; clarification then continue 201;
      no HTML challenge/cookie requirement, no changed speech/DTO semantics.
- [ ] Physical Siri/Shortcut owner check through edge; no browser-only assumptions.
- [ ] Exact CORS_ALLOWED_ORIGINS=https://aktau.market: allowed GET and POST
      preflight; unknown/suffix origins blocked; absent Origin allowed, not authentication.
- [ ] Trusted path CF/XFF + IPv4/IPv6 identity correct; spoofed public headers
      cannot forge limiter identity; duplicate/malformed header fails safe.
- [ ] Direct API origin unavailable from external IPv4/IPv6 network.
- [ ] Voice/health/API/error no-cache proof; `/metrics` 404.
- [ ] HTTP/TLS/DNSSEC verification recorded; WAF/rate controlled abuse and recovery tested.
- [ ] Privacy review of edge logs/analytics, no unreviewed full query/IP retention.
- [ ] Tunnel/cert/domain alerts planned with private operator delivery; not claimed live yet.

## Future rollback and alternative route

- [ ] Bad edge rule can be disabled individually without weakening app validation.
- [ ] Deactivation removes public DNS route/stops Tunnel; API remains private.
- [ ] DNS TTL and DNSSEC DS rollback documented; HSTS cache implications understood.
- [ ] If Tunnel is unavailable, STOP for separate **Full (strict) + origin firewall**
      review: valid TLS origin, current Cloudflare ingress only, direct origin denied;
      never expose Go publicly as emergency fallback.
- [ ] Phase B perimeter proof precedes Part15 public traffic/cutover approval.
