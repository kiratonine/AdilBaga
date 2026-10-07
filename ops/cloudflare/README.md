# Cloudflare operator artifacts — Part14 Phase A / Part14B

## Current operator state

Host cloudflared on Ubuntu24.04 connects an encrypted outbound locally-managed
Tunnel to `127.0.0.1:8080`. Public API hostname is `api.aktau.market`.
VPS incoming policy SSH-only; never open80/443/8080/7844.
Live root-owned0600 config: `/etc/cloudflared/config.yml`; per-tunnel credential
`/etc/cloudflared/tunnel-credentials.json` in directory0700. Temporary WSL account
certificate and tunnel copy removed after proof; never copied account certificate
to VPS. Re-authenticate for future account management. No secret/UUID/token in Git.

```bash
ssh my-vps 'sudo systemctl is-active cloudflared'
ssh my-vps 'sudo systemctl is-enabled cloudflared'
ssh my-vps 'sudo systemctl restart cloudflared'
ssh my-vps 'sudo ufw status verbose; sudo ss -lntup'
```

Inspect logs privately; do not paste Tunnel identifiers/credentials/account metadata.
Docker uses sudo; deploy is not docker-group member. Future API publish must be
`127.0.0.1:8080:8080`; no Go deployment in this Part. **Go API: NOT DEPLOYED**.
Temporary perimeter probe removed; application origin intentionally absent until
Part15. Tunnel/Docker reboot persistence and post-reboot HTTPS probe passed.
**HSTS: DEFERRED**. Future origin config remains exact and trust empty:

```text
CORS_ALLOWED_ORIGINS=https://aktau.market
TRUSTED_PROXY_CIDRS=
```

Rollback: disable offending edge rule individually, or disable public Tunnel route
and stop cloudflared; keep origin private. Never open8080 to recover service.
DNSSEC needs coordinated zone/registrar state, never repeated blind toggling.
Owner Dashboard confirms Free WAF/cache bypass/Voice20/10s Block10s/HTTPS/DNSSEC;
independent cache, redirect, mitigation/recovery and DNSSEC checks passed.
See report for attribution and command evidence; static verifier is not live proof.

## Preserved Phase A design history

Earlier statements below describe the pre-provisioning state only.

**PLANNED / NOT ACTIVATED**. `aktau.market` and `api.aktau.market` are
**PLANNED ONLY / NOT OWNED / NOT RESOLVED / NOT ACTIVE** (resolution not tested).
Railway retired; VPS/domain/zone/tunnel absent. **HSTS: DEFERRED**.
No cloudflared install, credentials, DNS change, firewall or deployment is authorized here.

Read [network perimeter](../../docs/production/NETWORK_PERIMETER.md) and
[future activation checklist](../../docs/production/CLOUDFLARE_ACTIVATION_CHECKLIST.md).

## Topology decision, not deployment configuration

Preferred: Cloudflare HTTPS edge → encrypted outbound Tunnel → cloudflared
on future VPS → private Go API. Origin has **no public inbound API port**.

Host placement: API container published ONLY to loopback; template's
`http://127.0.0.1:8080` illustrates that local hop. Go currently listens `:<PORT>`
inside its namespace, so do not infer host loopback binding from PORT. Measure
actual RemoteAddr after Docker NAT before setting trust; no production bind,
port or CIDR is selected by this example.

Container placement: dedicated reviewed private bridge, no API host ports;
stable exact cloudflared peer. Ensure required outbound dependencies still work.
Do not invent production Docker networks/CIDRs or a compose file here.

Future illustrative configuration, not active env:

```text
CORS_ALLOWED_ORIGINS=https://aktau.market
TRUSTED_PROXY_CIDRS=<EXACT_IMMEDIATE_PEER_CIDRS>
```

Only measured immediate peer `/32` or `/128` addresses; no broad trust ranges.
Cloudflare public edge IP lists are not Tunnel application-peer trust. Empty
trust ignores forwarding headers; CF duplicate/malformed falls back to peer.

## Template custody

`cloudflared-config.example.yml` is NOT ACTIVE and intentionally unusable with
placeholder Tunnel ID and private credential path. Narrow API hostname only,
final catch-all 404. Do not commit an instantiated config, UUID credential JSON,
token or API token. Actual credentials live outside repo, 0600/root-owned or
equivalent, least privilege, separate from application env; rotate one class
at a time per [runbook](../../docs/runbooks/secret-rotation.md).
Pin/verify actual cloudflared binary/image in Phase B; no unverified latest image.

## Future activation/deactivation

New owner authorization + provisioned inputs → approve placement/peer/egress →
pin cloudflared/store credentials → private API proof → Tunnel/zone/proxied
route/HTTPS → exact CORS + managed WAF/DDoS + observed-abuse limits → entire API
cache bypass (Voice POST no-cache) → Siri/GET/spoof/cache/direct-origin proof →
DNSSEC → separate HSTS decision after HTTPS proof. No JS challenge or interactive
Access gate for non-browser Voice/Next requests. Check actual Cloudflare plan
capabilities first. Frontend hosting is a separate approved input, not guessed.

Rollback: disable offending edge rule, or remove public DNS route/stop Tunnel;
keep API private. Account for actual TTL/DS/HSTS state. Never expose origin to
recover availability. Separate fallback needs Full (strict) valid TLS origin
and reviewed Cloudflare-only ingress firewall, including IPv6; direct origin
denied. No firewall tooling/SSH commands are prescribed now.

## Offline checks

```bash
node --test scripts/network/verify-part14.test.mjs
node scripts/network/verify-part14.mjs
node scripts/create-clean-archive.mjs production-part-14
node scripts/network/verify-archive.mjs
```

These check source artifacts only, not active Cloudflare behavior. Operator
commands can be wrapped with `rtk proxy`; no cloudflared process is started.
