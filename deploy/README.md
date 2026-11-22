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

This section is the single source of truth for the active SHA and the rollback
target. Runbooks and other production docs link here instead of copying SHAs;
update only this section after a release.

- Active Go API — `6dec3357ddf7d19c8bbb0196cca853328752b0b5` (PR #144). Owner-authorized manual API-only release on 2026-11-22. Exact-main CI 45052751799 passed all nine jobs. Official build-only run 45053311834 produced artifact 14766770157.
- API rollback target — `3c5e8cbc9f2c984808a158f243949e49b2a73cd5`. The prior working image and the root-private backup of the release reference and Compose were verified before cutover and retained after postflight.
- Active Frontend — `34654678857ceabf6d68f968eac2c586dcb88909` (Next.js 16.4.5). The API cutover kept its image, container and BUILD_ID. Signed cache revalidation returned HTTP 204; RU/KK brand selection, search, sorting, product, dashboard and SZPT passed in Chrome.
- PostgreSQL 17.6 passed the restricted read-only role and collation gate. The live catalog and Voice passed the application smoke. The five-minute postflight recorded zero HTTP 5xx, zero readiness 503 and a healthy API with zero restarts or OOM kills.
- The 2026-11-17 combined release remains recorded in the [release evidence summary](../docs/production/reports/FRONTEND_VPS_DOCS_INFRA_RECONCILIATION_REPORT.md#manual-release-evidence). Its previous API was `e9e4543b130d212a95f4c60f3e1229b26db6388e` and previous Frontend was `a04bee643470753fd0874bc1b53d740a4593e618`. See the [Frontend deployment runbook](../docs/production/FRONTEND_VPS_DEPLOYMENT.md) for the independent lifecycle.
- The operator used manual SSH. Automated rollout remained disabled. Future broker releases require a new exact-artifact approval under [Auto-deploy setup](../docs/production/AUTO_DEPLOY_SETUP.md).

History: the first Go release was `e6ef854` (2026-10-08, Part15 report); the same-day
`d6098f6` rollout was rolled back after a public Voice HTTP500. Later releases:
`438ecdf`, `6a4b4c7`, `b4f4b88`, `49f6823`, `e50de25`, `1cbd535`, `a08ff71`, `e3fa08e` (SZPT
endpoints, 2026-11-12), `98427c3` (SZPT group-rule hotfix, 2026-11-13), `c7ba31f` (SZPT weighted goods, 2026-11-14),
`0a7bf2a` (SZPT group-rule hotfix 2, 2026-11-15), `e9e4543` (SZPT phase 3, 30 groups, 2026-11-16). HSTS stays deferred;
ingestion is the separate `ops/sync/` units, not part of an API release.

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

## Rollback

Roll back to the target named in «Current release»: same compose, previous SHA
image, no DB rollback, migration, ingest or snapshot action. Do it outside the
sync windows (01:00Z, 13:00Z, Sunday 22:00Z). Replace `<ROLLBACK_SHA>` with the
full SHA from «Current release».

```bash
ssh my-vps 'sudo systemctl stop cloudflared'
ssh my-vps 'sudo cp -p /etc/adilbaga/release.env /root/adilbaga-release.env.$(date -u +%Y%m%dT%H%M%SZ)'
ssh my-vps 'echo "API_IMAGE=adilbaga-api:<ROLLBACK_SHA>" | sudo tee /etc/adilbaga/release.env >/dev/null'
ssh my-vps 'sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml up -d --force-recreate'
ssh my-vps 'sudo docker inspect adilbaga-api --format "status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restart={{.RestartCount}} image={{.Config.Image}}"'
ssh my-vps 'curl -fsS http://127.0.0.1:8080/health/live; curl -fsS http://127.0.0.1:8080/health/ready'
ssh my-vps 'sudo systemctl start cloudflared'
```

Run the local smoke (installed `auto_smoke.py`) before starting cloudflared, then
update «Current release». Before every new release keep both the current and the
previous SHA images and check DB compatibility of the rollback target.

## Frontend cache flush

The frontend server caches API answers for up to one hour (tag `catalog-data`). After an
API cutover or rollback that changes data, flush that cache, otherwise pages show the old
answer for up to an hour (2026-11-14: `/ru/szpt/rice` showed 10 groups after the 25-group
release). Only a signed `POST /internal/revalidate` does this; the helper
`ops/frontend/revalidate_frontend.py` signs it with the secret from `/etc/aktau-sync.env`
and never prints it. Installed once as `/usr/local/sbin/adilbaga-revalidate-frontend`
(`ops/frontend/README.md`). Cutover scripts call it after `RESULT=CUTOVER_PASS`; a failed
flush does not roll the API back. By hand:

```bash
sudo python3 -I -B /usr/local/sbin/adilbaga-revalidate-frontend
```

Expect `REVALIDATE_PASS host=aktau.market status=204`, then check that a page shows the
new API data right away (for example `/ru/szpt/rice` and the changed group page).

### Emergency stop (last resort)

Only if no retained image is healthy: return to the Part14B zero-application state
(public path closed, API stopped). The site is down until a reviewed recovery.
Never expose origin as fallback.

```bash
ssh my-vps 'sudo systemctl stop cloudflared; sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml down'
ssh my-vps 'sudo ss -lntup'
```

Require no 8080 listener and no public 80/443/8080.

Ingestion (регулярный sync цен) — отдельные systemd-юниты из `ops/sync/`, не часть API-релиза.
