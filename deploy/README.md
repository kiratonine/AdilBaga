# Production Go API operations

Cloudflare edge → host cloudflared → loopback Docker publication → Go API.
Supabase remains the database; only restricted `aktau_api_runtime` is admitted.
Existing real Upstash and Gemini configuration stays outside Git. No migration,
ingestion, frontend, scheduler or secret rotation is part of API deployment.

Build only from a clean committed export outside the VPS. Require exact release
SHA and all hosted CI jobs success. Use `adilbaga-api:<full-commit-SHA>`, never
latest; verify portable artifact identity before starting the loaded VPS image.
An existing approved registry may supply a digest; otherwise the authorized
single-VPS transport is docker save → encrypted SSH → docker load. No VPS build.

## Current release

Active production Go release: `e6ef854e2973e5b0871888bbc3111e026cdccc5b`.
Hosted run37668466461 attempt2 passed all9 mandatory jobs; reviewed source was
not changed during rollout. Portable identity, restricted local/VPS readiness,
real application Voice/Upstash, exact measured peer and public edge checks PASS.
Keep the SHA image and private release configuration for reviewed recovery.
Part16+ NOT STARTED; frontend/HSTS/ingestion are not included.

Use curl or an explicitly identified operator User-Agent for edge probes. Generic
Python-urllib gets Cloudflare1010/403; no browser impersonation or WAF weakening
was used. See Part15 report for precise evidence and compatibility limitations.

## Gate L — portable artifact identity

Create ONE `docker save` archive from the existing exact release image. Record
its SHA-256 locally, transfer that exact file over SSH, and require the VPS file
SHA-256 to match BEFORE load. Abort on any mismatch; never start first and compare
later. After load, require revision label == PART15_RELEASE_SHA, linux/amd64,
User10001:10001 and entrypoint `/usr/local/bin/api`. Compare RootFS diff IDs and
SHA-256 of `/usr/local/bin/api` between the local and VPS images.

Cross-store `.Id` equality is NOT required: a legacy Docker store may expose a
config digest while a containerd/OCI store exposes a manifest descriptor. Those
different identifiers do not replace the file, metadata, layer and binary proof.
Do not rebuild a reviewed image merely to make these identifiers equal.

## Files and hardening

- `/opt/adilbaga/compose.production.yml`: root-owned0644, directory0755.
- `/etc/adilbaga/api.env`: root-owned0600, directory0700; private runtime only.
- `/etc/adilbaga/release.env`: root-owned0600; only `API_IMAGE` SHA-tag reference.

Never print env/container Env or put secrets into argv, reports or archives.
Only `127.0.0.1:8080:8080`; never public API publication or host networking.
UID/GID10001, read-only root, tmpfs16MiB/noexec/nosuid, all capabilities dropped,
no-new-privileges, graceful stop12s, local rotated Docker logging.
HSTS: DEFERRED. Exact CORS origin is `https://aktau.market`. Proxy trust must be
the measured immediate container peer, exact IPv4 /32 or IPv6 /128, not a subnet.
Measure from the container network namespace on a controlled host connection
while cloudflared is stopped; cross-check persistent network metadata before
setting only that private env line. Do not guess a Docker gateway.

## Start / recreate / verify

Stop cloudflared before first start or unsafe assembly. Keep the public path
closed until local readiness, catalog and application-level Voice checks pass.

```bash
ssh my-vps 'sudo systemctl stop cloudflared'
ssh my-vps 'sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml up -d'
# Recreate after a reviewed env/image change:
ssh my-vps 'sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml up -d --force-recreate'
ssh my-vps 'sudo docker inspect adilbaga-api --format "status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restart={{.RestartCount}} image={{.Image}}"'
ssh my-vps 'curl -fsS http://127.0.0.1:8080/health/live; curl -fsS http://127.0.0.1:8080/health/ready'
ssh my-vps 'sudo systemctl start cloudflared'
```

Privately prove preflight and VPS env byte-identical without logging values or
secret-material hashes. Diagnose DNS/TCP/auth/identity using only the restricted
API credential. Poll cold readiness bounded to approximately30s and record each
status/timing; persistent503 is a STOP, not permission to hot-fix configuration.

Readiness validates restricted physical DB identity/session policy; never repair
it by broadening grants or substituting an owner/ingestion credential.

## Voice launch gate — application-level graceful degradation

Gemini is the preferred NLP provider; approved deterministic fallback is the
production degradation path. Active Go model: `gemini-3.5-flash-lite`.
Keep the shared8s budget, keys/failover and strict backend validation unchanged.
Before public cutover require correct HTTP201 complete cheapest milk, multi-turn
milk clarification/continue with session deletion, and search TOP-3 responses.
Prove these application flows with both a successful parser and provider outage;
Redis/DB/business results must remain genuine, never fabricated or fixture fallback.

Provider outcome is telemetry, not a perfect availability gate. At most one
complete-input and one clarification direct smoke may record sanitized
provider_outcome_class/duration; timeout/failure means DEGRADED, not an automatic
launch blocker if the application flows are correct. Do not run repeated
provider-only benchmarks or tune prompt/model/timeout without review.
Persistent application-level Voice failure, invalid public response, DB/session
failure, origin exposure, CORS or security regression remains a hard blocker.
No public metrics. Static verifier PASS is not live Voice availability evidence.

Fallback is intentionally small and protects the approved core Russian keyword
flow. Broader natural-language/category cases rely on Gemini and may require
additional clarification during provider degradation. This accepted limitation
must be monitored after launch; not every phrase/category works without Gemini.

## First-release rollback

There is no earlier Go production image. Accepted rollback target is Part14B
zero-application state, not another backend/provider or DB rollback:

```bash
ssh my-vps 'sudo systemctl stop cloudflared; sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml down'
ssh my-vps 'sudo ss -lntup'
```

Require no8080 listener and no public80/443/8080; retain the verified image and
private configuration for reviewed recovery. Never expose origin as fallback.
Future releases preserve current/previous SHA images before replacement and
validate DB compatibility. No DB rollback, migration, ingest or snapshot action.
