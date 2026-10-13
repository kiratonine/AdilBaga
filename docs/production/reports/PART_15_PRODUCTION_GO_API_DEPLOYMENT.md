# PART 15 — Production Go API Deployment

**Project:** Adil Bağa / `aktau.market`  
**Environment:** real production launch — hackathon/MVP phase is over  
**Branch:** `integrate/full-stack`  
**Previous gate:** Part 14B Cloudflare + network perimeter — externally accepted and committed/pushed  
**Production backend target:** `backend-go/`  
**Production database:** Supabase PostgreSQL  
**Production Redis:** Upstash  
**Production NLP:** Gemini  
**Production API:** `https://api.aktau.market`  
**VPS access from WSL:** `ssh my-vps`

> This Part deploys the reviewed Go API to the real VPS and connects it to the real
> production dependencies. This is not an MVP/demo deploy.
>
> Part 15 must stop at `READY_FOR_EXTERNAL_REVIEW`. Do not commit/push Part 15
> changes until external review passes.

---

# 0. Goal

Deploy the production Go backend as an immutable Docker artifact tied to the
reviewed Git commit SHA.

Target state:

```text
Internet
  ↓
Cloudflare
  ↓
api.aktau.market
  ↓
Cloudflare Tunnel
  ↓
cloudflared on VPS
  ↓
127.0.0.1:8080
  ↓
Go API Docker container
  ↓
Supabase PostgreSQL / Upstash / Gemini
```

After this Part:

```text
Go API deployed on VPS
real production dependencies connected
health/readiness PASS
catalog/dashboard PASS
real Voice/Gemini/Upstash PASS
CORS PASS
Cloudflare/Tunnel PASS
origin still private
rollback procedure proven
Part 16+ NOT STARTED
```

---

# 1. Production context

The project is now in real production-launch mode.

Do not use the phrases/assumptions:

```text
hackathon deploy
MVP infrastructure
demo-only production
temporary hackathon server
```

Historical hackathon documents remain context only.

Current production source of truth:

```text
AGENTS.md
docs/PRODUCTION_ROADMAP_AKTAU_MARKET.md
docs/production/reports/
contracts/openapi.yaml
docs/production/NETWORK_PERIMETER.md
docs/production/CLOUDFLARE_ACTIVATION_CHECKLIST.md
```

---

# 2. Read before changing anything

Read the current versions of:

```text
AGENTS.md
docs/PRODUCTION_ROADMAP_AKTAU_MARKET.md
docs/production/API_V1_CONTRACT.md
docs/production/NETWORK_PERIMETER.md
docs/production/CLOUDFLARE_ACTIVATION_CHECKLIST.md
docs/production/POSTGRES_LAYER.md
docs/production/STAGING_PLAN.md
docs/production/OBSERVABILITY_ALERT_POLICY.md

docs/production/reports/PART_14_REPORT.md
docs/production/reports/POST_SCRUM_7_REMEDIATION_REPORT.md
docs/production/reports/POST_SCRUM_7_INTEGRATION_REPORT.md

docs/runbooks/api-down.md
docs/runbooks/db-down.md
docs/runbooks/redis-down.md
docs/runbooks/rollback.md
docs/runbooks/secret-rotation.md

backend-go/Dockerfile
backend-go/.dockerignore
backend-go/.env.example
backend-go/README.md
backend-go/cmd/api/main.go
backend-go/internal/config/config.go
backend-go/internal/postgres/pool.go
backend-go/internal/middleware/proxy.go
backend-go/internal/middleware/http.go
backend-go/internal/middleware/ratelimit.go
backend-go/internal/middleware/voice_limit.go

contracts/openapi.yaml
scripts/create-clean-archive.mjs
```

Do not invent paths before inspecting the repository.

---

# 3. Scope

## Allowed

- deploy the reviewed Go API to the existing VPS;
- build an immutable Docker image from committed source;
- transfer/pull that exact image to the VPS;
- add production deployment files under `deploy/`;
- create production API env storage outside Git;
- use the existing restricted `aktau_api_runtime` Supabase credential;
- use existing real Upstash credentials;
- use existing real Gemini credentials;
- run bounded read-only production DB/API verification;
- run bounded real Voice integration smoke;
- measure the real immediate Docker proxy peer;
- set `TRUSTED_PROXY_CIDRS` to the exact measured `/32` or `/128`;
- start the API behind the existing Cloudflare Tunnel;
- perform health/readiness/catalog/dashboard/Voice/CORS/security smoke;
- update production runbooks;
- create/update `PART_15_REPORT.md`;
- add a Part 15 static deployment verifier and review archive support;
- stop for external review.

## Forbidden

Do **not**:

- change DB schema;
- create/run migrations;
- run `prisma migrate deploy` when no pending reviewed migration exists;
- run ingestion;
- create a new snapshot;
- run parsers;
- change taxonomy/matching;
- use the `postgres` owner credential in Go runtime;
- use `aktau_ingest_runtime` in Go runtime;
- expose `8080` publicly;
- bind API host publication to `0.0.0.0`;
- open VPS inbound `80`, `443`, or `8080`;
- weaken UFW;
- remove Cloudflare Tunnel;
- enable HSTS;
- enable Cloudflare Access/browser challenge for API;
- modify frozen API/DTO contracts;
- deploy NestJS as production traffic owner;
- delete `backend/`;
- deploy frontend;
- configure ingestion worker/timer/scheduler;
- create automatic CD;
- create/rotate secrets without separate authorization;
- put secrets into Git/reports/archive/shell command arguments;
- print secrets;
- commit/push before external review;
- start Part 16/17/18/19.

---

# 4. Secret handling

Never request from the owner in chat:

```text
Supabase passwords/DSNs
Gemini API keys
Upstash token
Cloudflare tokens
tunnel credentials
SSH private keys
VPS password
GPG private material
```

The agent may use already-existing private configuration on the owner's machine.

If a required production credential cannot be located safely, STOP and ask only
for the **private file path or environment variable name**, never the value.

Required production runtime values:

```text
DATABASE_URL
GEMINI_API_KEY                # at least one valid key
GEMINI_API_KEY2               # optional
GEMINI_API_KEY3               # optional
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

The DB value must be the existing restricted:

```text
aktau_api_runtime
```

Do not substitute owner or ingestion credentials.

Known previous evidence uses a private API-only variable named similar to:

```text
AKTAU_API_RUNTIME_DATABASE_URL
```

Inspect current private operator configuration; do not assume the exact file path.

---

# 5. Gate A — immutable Git/CI preflight

Part 14B was committed/pushed by the owner. The Part 15 baseline is therefore the
**new current commit**, not the older `b5ef421...`.

From repository root:

```bash
rtk git fetch origin --prune
rtk git branch --show-current
rtk git status --short
rtk git rev-parse HEAD
rtk git rev-parse origin/integrate/full-stack
rtk git log -1 --oneline
```

Required:

```text
branch = integrate/full-stack
working tree = clean
HEAD = origin/integrate/full-stack
```

Record the exact full SHA privately and in the sanitized report as:

```text
PART15_RELEASE_SHA=<full SHA>
```

Do not continue if HEAD/origin differ.

## Hosted CI gate

Find the hosted CI run for this **exact SHA**.

Required mandatory jobs:

```text
Contracts
Frontend
Go Quality
Security
Nest Reference
Pipeline Quality
PostgreSQL Integration
Ephemeral Staging
CI Gate
```

All must be:

```text
completed / success
```

If CI is queued/running/failed:

```text
STATUS = BLOCKED
STOP
```

Do not rerun/change CI merely to make Part 15 pass without reporting it.

---

# 6. Gate B — verify Part 14B live perimeter before application mutation

Read-only:

```bash
ssh my-vps '
set -eu
whoami
sudo systemctl is-active docker
sudo systemctl is-active cloudflared
sudo systemctl is-enabled docker
sudo systemctl is-enabled cloudflared
sudo ufw status verbose
sudo ss -lntup
'
```

Required before deployment:

```text
user = deploy
docker active/enabled
cloudflared active/enabled
UFW incoming deny
SSH public inbound only
no 8080 listener
no Go API container
```

From WSL verify current expected no-origin state:

```bash
curl -sS -o /dev/null -D - https://api.aktau.market/health/live || true
```

An origin-unavailable response is expected before Part 15.

Do not change Cloudflare DNS/WAF/rate/cache/DNSSEC configuration in this Part
unless a regression is directly caused by the deployment and the correction is
within already accepted Part 14 policy.

---

# 7. Gate C — migration/data precheck

This Part must not mutate the database.

First prove there is no migration delta between the accepted pre-infrastructure
runtime baseline and the current release candidate.

Use Git history/diff, not production owner access, to inspect:

```text
backend/prisma/migrations/**
backend/prisma/schema.prisma
backend-go/internal/postgres/**
```

Part 14B should have changed no runtime/DB source.

If a migration/schema delta unexpectedly exists:

```text
STATUS = BLOCKED
STOP
```

Do not run migration automatically.

Expected Part 15 migration action:

```text
NONE
```

Also verify the accepted backup/restore/restricted-runtime reports remain present:

```text
docs/production/reports/PART_11_REPORT.md
docs/production/reports/POST_SCRUM_7_REMEDIATION_REPORT.md
```

A new DB backup is not required merely to deploy a read-only API when:

- no schema/data migration exists;
- no ingestion/snapshot action exists;
- accepted encrypted backup + restore proof already exists.

Do not access the owner DB credential merely to manufacture another backup.

---

# 8. Gate D — production artifact transport decision

The roadmap says:

```text
build immutable image
→ push image
```

However the repository does not currently freeze a container registry provider.

Do **not** silently create a new Docker Hub/GHCR account/package/token dependency.

Use this order:

1. Inspect whether an already-approved private image registry is configured.
2. If yes, use it and deploy by immutable digest.
3. If no registry is already approved, this Part explicitly authorizes the
   existing single-VPS manual release transport:

```text
clean committed source
→ build Docker image on WSL
→ tag with exact Git SHA
→ record image ID
→ docker save
→ encrypted SSH transport
→ docker load on VPS
```

This is a real production release transport for the current single-VPS topology.
It does **not** authorize building source on the VPS.

Do not introduce GHCR/Docker Hub just to satisfy the word “push”.

Future registry/CD work can be a separate production-hardening Part.

---

# 9. Gate E — build exact immutable image outside the VPS

Never build production source directly on the VPS.

Create a temporary clean export from the exact release SHA.

Example:

```bash
RELEASE_SHA="$(rtk git rev-parse HEAD)"
WORKDIR="$(mktemp -d)"
rtk git archive "$RELEASE_SHA" | tar -x -C "$WORKDIR"
```

Before build, verify the exported relevant source is from the commit, not the
working tree.

Build:

```bash
IMAGE="adilbaga-api:${RELEASE_SHA}"

sudo docker build \
  --pull \
  --label "org.opencontainers.image.revision=${RELEASE_SHA}" \
  -t "$IMAGE" \
  "$WORKDIR/backend-go"
```

Do not pass secrets as build args/secrets/environment.

Record sanitized artifact metadata:

```bash
sudo docker image inspect "$IMAGE" \
  --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Required:

```text
revision label = RELEASE_SHA
```

Do not dump image/container Env.

Verify image properties:

```bash
sudo docker image inspect "$IMAGE" --format '{{.Config.User}}'
sudo docker image inspect "$IMAGE" --format '{{json .Config.Entrypoint}}'
```

Expected:

```text
10001:10001
/usr/local/bin/api
```

Clean temporary source export after release artifact verification.

Do not remove the exact built image until Part 15 is accepted.

---

# 10. Gate F — assemble a private production runtime env

Create/maintain one private local file outside the repository, mode `0600`,
inside a directory mode `0700`.

Suggested stable operator path:

```text
~/.config/adilbaga/production-api.env
```

This path is not mandatory if a safe existing path already exists.

The file must contain:

```text
APP_ENV=production
PORT=8080

DATABASE_URL=<existing aktau_api_runtime URL>

CORS_ALLOWED_ORIGINS=https://aktau.market
TRUSTED_PROXY_CIDRS=

LOG_LEVEL=info

RATE_LIMIT_RPS=20
RATE_LIMIT_BURST=40

GEMINI_API_KEY=<private>
GEMINI_API_KEY2=<private if configured>
GEMINI_API_KEY3=<private if configured>
GEMINI_MODEL=gemini-3.1-flash-lite

UPSTASH_REDIS_REST_URL=<private>
UPSTASH_REDIS_REST_TOKEN=<private>

VOICE_RATE_LIMIT_RPS=2
VOICE_RATE_LIMIT_BURST=4
VOICE_MAX_CONCURRENCY=4
```

Do not add:

```text
postgres owner URL
aktau_ingest_runtime URL
DIRECT_URL
BACKUP_DATABASE_URL
Cloudflare credential
SSH key
```

## Safe validation

Validate only:

- required variable names are present;
- file/directory permissions;
- DB username is `aktau_api_runtime`;
- DB URL parses;
- Upstash URL is HTTPS;
- at least one Gemini key is non-empty.

Do not print values.

Do not run:

```bash
set -x
env
printenv
cat production-api.env
docker inspect ...Env
```

---

# 11. Gate G — pre-deploy exact-image production-profile smoke on WSL

Before touching the VPS application state, run the exact built image locally on
loopback using the real production runtime dependencies.

Use the private env file and the same hardening intended for production:

```bash
sudo docker run -d \
  --name adilbaga-part15-preflight \
  --env-file ~/.config/adilbaga/production-api.env \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -p 127.0.0.1:18080:8080 \
  "$IMAGE"
```

Do not publish to non-loopback.

Check:

```bash
rtk curl -fsS http://127.0.0.1:18080/health/live
rtk curl -fsS http://127.0.0.1:18080/health/ready
rtk curl -fsS http://127.0.0.1:18080/api/categories
rtk curl -fsS 'http://127.0.0.1:18080/api/products?limit=3'
rtk curl -fsS http://127.0.0.1:18080/api/dashboard
```

Required:

```text
live = 200
ready = 200
categories usable
products usable
dashboard usable
```

`/health/ready` is important: with `APP_ENV=production` it causes the Go runtime
to use the production DB identity guard. A 200 result must therefore be backed
by the restricted `aktau_api_runtime` identity.

Do not claim more than the application actually proves.

---

# 12. Gate H — real Gemini + Upstash preflight

Use synthetic test text/coordinates only.

## Direct result

Example:

```bash
curl -fsS \
  -H 'Content-Type: application/json' \
  -d '{"text":"найди самое дешёвое молоко 1 литр 3.2%","latitude":43.6,"longitude":51.1}' \
  http://127.0.0.1:18080/api/voice/start
```

Expected:

```text
HTTP 201
status = result
mode = single
items <= 1
speech nonblank
```

This exercises:

```text
real Gemini or deterministic approved fallback
+
production DB
+
nearest store
```

Do not infer Gemini success merely from a 201 if fallback may have handled the
request. Inspect only sanitized structured provider outcome/metrics if available;
never log/print provider key or raw provider response.

## Upstash session roundtrip

Use a deliberately incomplete request:

```text
"молоко"
```

Expected first response:

```text
HTTP 201
status = needs_clarification
sessionId opaque/nonblank
missingFields non-empty
```

Extract `sessionId` only into a shell variable/private temporary file; do not put
it into report/log output.

Then call `/api/voice/continue` with a synthetic answer, for example:

```text
"найди самое дешёвое 1 литр 3.2%"
```

Expected:

```text
HTTP 201
status = result
```

This is the required real Upstash session SET/GET/delete path.

If Upstash/Gemini integration fails:

```text
STATUS = BLOCKED
```

Do not add memory fallback or disable production validation.

After local smoke:

```bash
sudo docker stop --time 12 adilbaga-part15-preflight
sudo docker rm adilbaga-part15-preflight
```

Keep the exact image.

---

# 13. Required repository deployment files

Create only after inspecting current tree:

```text
deploy/compose.production.yml
deploy/README.md
```

## `deploy/compose.production.yml`

It must be secret-free.

Use the equivalent of:

```yaml
services:
  api:
    image: ${API_IMAGE:?API_IMAGE is required}
    container_name: adilbaga-api
    restart: unless-stopped

    env_file:
      - /etc/adilbaga/api.env

    user: "10001:10001"
    read_only: true

    tmpfs:
      - /tmp:rw,noexec,nosuid,size=16m

    cap_drop:
      - ALL

    security_opt:
      - no-new-privileges:true

    ports:
      - "127.0.0.1:8080:8080"

    stop_grace_period: 12s

    logging:
      driver: local

    networks:
      - production

networks:
  production:
    name: adilbaga-production
    driver: bridge
```

Do not add a DB container, Redis container or reverse proxy.

Supabase/Upstash/Gemini remain external.

Do not publish any other port.

## `deploy/README.md`

Document only safe operator procedures:

- exact paths;
- start/status/recreate/stop;
- image SHA/release file handling;
- loopback-only invariant;
- cloudflared dependency;
- health/readiness;
- rollback;
- secrets are external to repo.

Do not put real DSNs/tokens/private IPs in this file.

---

# 14. Gate I — prepare production directories on VPS

Before transferring secrets/artifacts:

```bash
ssh my-vps '
set -eu
sudo install -d -m 755 -o root -g root /opt/adilbaga
sudo install -d -m 700 -o root -g root /etc/adilbaga
'
```

Expected:

```text
/opt/adilbaga                 root:root 0755
/etc/adilbaga                 root:root 0700
```

Copy the tracked compose file:

```bash
scp deploy/compose.production.yml my-vps:/tmp/compose.production.yml

ssh my-vps '
set -eu
sudo install -m 644 -o root -g root \
  /tmp/compose.production.yml \
  /opt/adilbaga/compose.production.yml
rm -f /tmp/compose.production.yml
'
```

No secrets are in this file.

---

# 15. Gate J — install production env on VPS without printing it

Transfer the already validated local env using stdin, not command arguments.

Example pattern:

```bash
ssh my-vps '
set -eu
sudo sh -c "umask 077; cat > /etc/adilbaga/api.env"
' < ~/.config/adilbaga/production-api.env
```

Then verify only metadata and variable names:

```bash
ssh my-vps '
set -eu
sudo stat -c "%U %G %a %n" /etc/adilbaga/api.env
sudo awk -F= "
  /^[A-Z0-9_]+=/ { print \$1 }
" /etc/adilbaga/api.env | sort
'
```

Required:

```text
root root 600 /etc/adilbaga/api.env
```

Do not print values.

Create a **non-secret** release file:

```text
/etc/adilbaga/release.env
```

with only:

```text
API_IMAGE=adilbaga-api:<RELEASE_SHA>
```

Permissions may still be `0600` for operational consistency.

---

# 16. Gate K — close public API path during application assembly

Before starting the real Go container:

```bash
ssh my-vps '
set -eu
sudo systemctl stop cloudflared
sudo systemctl is-active cloudflared || true
sudo ss -lntup
'
```

Expected:

```text
cloudflared stopped/inactive
no public API path
no 8080 listener before container start
```

Stopping cloudflared here is a deliberate deployment gate.

Do **not** open the origin directly as a workaround.

---

# 17. Gate L — transfer the exact image to VPS

## If an already-approved private registry exists

Push/pull by immutable digest and record:

```text
release Git SHA
image digest
```

Never deploy `latest`.

## If no registry exists

Use the approved single-VPS SSH artifact transport.

Example:

```bash
sudo docker save "$IMAGE" \
  | gzip -1 \
  | ssh my-vps 'gunzip | sudo docker load'
```

No source build occurs on the VPS.

Compare image IDs:

```bash
sudo docker image inspect "$IMAGE" --format '{{.Id}}'

ssh my-vps \
  "sudo docker image inspect '$IMAGE' --format '{{.Id}}'"
```

They must be exactly equal.

Also verify the revision label on VPS equals `RELEASE_SHA`.

If not:

```text
STATUS = BLOCKED
STOP
```

---

# 18. Gate M — first container start, still no public traffic

Start the production container with cloudflared still stopped:

```bash
ssh my-vps '
set -eu
sudo docker compose \
  --env-file /etc/adilbaga/release.env \
  -f /opt/adilbaga/compose.production.yml \
  up -d
'
```

Wait for Docker health.

Inspect only safe fields:

```bash
ssh my-vps '
set -eu
sudo docker ps --filter name=^/adilbaga-api$
sudo docker inspect adilbaga-api \
  --format "status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}} image={{.Image}}"
sudo ss -lntp | grep 127.0.0.1:8080
'
```

Do not run:

```text
docker inspect ... .Config.Env
```

Expected:

```text
running
healthy
restart=0
127.0.0.1:8080 only
```

Verify container security:

```bash
ssh my-vps '
set -eu
sudo docker exec adilbaga-api id
! sudo docker exec adilbaga-api sh -c "touch /part15-write-test"
'
```

Expected UID/GID:

```text
10001 / 10001
```

Root filesystem write must fail.

---

# 19. Gate N — local production health before Cloudflare cutover

On VPS:

```bash
ssh my-vps '
set -eu
curl -fsS http://127.0.0.1:8080/health/live
curl -fsS http://127.0.0.1:8080/health/ready
curl -fsS http://127.0.0.1:8080/api/categories >/dev/null
curl -fsS "http://127.0.0.1:8080/api/products?limit=3" >/dev/null
curl -fsS http://127.0.0.1:8080/api/dashboard >/dev/null
'
```

Required:

```text
live 200
ready 200
catalog 200
dashboard 200
```

If readiness is 503:

- do not switch traffic;
- inspect sanitized logs;
- verify restricted DB connectivity;
- never replace runtime DB URL with owner credential.

---

# 20. Gate O — measure the actual immediate Docker peer

This is mandatory before public traffic.

Current topology:

```text
host cloudflared
→ http://127.0.0.1:8080
→ Docker published loopback port
→ API container
```

`TRUSTED_PROXY_CIDRS` must not be guessed from Docker defaults.

Cloudflared is still stopped, so create exactly one temporary host connection to
the same `127.0.0.1:8080` path and inspect the connection from the container
network namespace.

Example:

```bash
ssh my-vps '
set -eu

PID="$(sudo docker inspect -f "{{.State.Pid}}" adilbaga-api)"

(
  exec 3<>/dev/tcp/127.0.0.1/8080
  sleep 4
) &
HOLD_PID=$!

sleep 1

sudo nsenter -t "$PID" -n \
  ss -Htn state established "( sport = :8080 )"

wait "$HOLD_PID" || true
'
```

There must be one unambiguous remote peer address for the controlled connection.

Cross-check it with the persistent Docker network metadata:

```bash
ssh my-vps '
sudo docker network inspect adilbaga-production \
  --format "{{(index .IPAM.Config 0).Gateway}}"
'
```

Do not assume equality; compare actual evidence.

Expected current topology is IPv4. Configure exactly:

```text
TRUSTED_PROXY_CIDRS=<MEASURED_IP>/32
```

If the actual immediate peer is IPv6:

```text
TRUSTED_PROXY_CIDRS=<MEASURED_IPV6>/128
```

Never use:

```text
0.0.0.0/0
::/0
172.16.0.0/12
10.0.0.0/8
192.168.0.0/16
all Docker networks
Cloudflare public edge CIDRs
```

The exact private peer IP is not a secret, but the report may simply state:

```text
exact measured /32 configured
```

rather than persisting the address.

---

# 21. Gate P — apply exact trusted peer and recreate container

Update **only** the `TRUSTED_PROXY_CIDRS` line in:

```text
/etc/adilbaga/api.env
```

Do not rewrite/print other secret values.

Validate file remains:

```text
root:root 0600
```

Recreate the container while cloudflared remains stopped:

```bash
ssh my-vps '
set -eu
sudo docker compose \
  --env-file /etc/adilbaga/release.env \
  -f /opt/adilbaga/compose.production.yml \
  up -d --force-recreate
'
```

Re-run:

```text
Docker healthy
/health/live 200
/health/ready 200
loopback 8080 only
```

Record only:

```text
TRUSTED_PROXY_CIDRS = exact measured peer /32 or /128
```

Do not print the complete env file.

---

# 22. Gate Q — real production Voice smoke on VPS before public traffic

With cloudflared still stopped, call the real loopback API using synthetic text
and coordinates.

Required:

1. direct complete Voice request → 201 result;
2. incomplete Voice start → 201 clarification;
3. continue using returned private session token → 201 result.

This proves the production VPS container has working:

```text
Supabase restricted reads
Gemini integration / approved NLP fallback behavior
Upstash session roundtrip
nearest-store calculation
```

Do not put session IDs, full provider bodies or secrets in the report.

If the response succeeded only through fallback, report that accurately. If a
real Gemini outcome metric/log class can be safely established without exposing
content/secrets, record the provider class only.

Do not alter business logic to force a provider result.

---

# 23. Gate R — public traffic activation

Only after all local gates pass:

```bash
ssh my-vps '
set -eu
sudo systemctl start cloudflared
sudo systemctl is-active cloudflared
'
```

Wait briefly for Tunnel registration.

Do not change the DNS route.

---

# 24. Gate S — production edge smoke

Run from WSL/external client through:

```text
https://api.aktau.market
```

## Health

```bash
curl -fsS -D /tmp/part15-live.headers \
  https://api.aktau.market/health/live

curl -fsS -D /tmp/part15-ready.headers \
  https://api.aktau.market/health/ready
```

Required:

```text
200 live
200 ready
Cloudflare edge evidence present
no cache HIT
```

## Categories

```bash
curl -fsS https://api.aktau.market/api/categories
```

Expected accepted production dataset behavior:

```text
9 public usable categories
legacy other hidden
sugar present
```

Do not hardcode counts in runtime code; this is a current dataset smoke invariant.

## Filters

```bash
curl -fsS https://api.aktau.market/api/categories/milk/filters
```

Must match the frozen contract and real dataset.

## Products

```bash
curl -fsS \
  'https://api.aktau.market/api/products?category=milk&sort=price_asc&limit=3'
```

Verify:

- HTTP 200;
- max 3;
- `minPrice`;
- offers sorted price ASC;
- category;
- snapshotAt;
- no fixture/demo data marker.

Capture the first real product ID privately/safely, then:

```bash
curl -fsS "https://api.aktau.market/api/products/<OPAQUE_ID>"
```

Do not assume UUID format.

## Dashboard

```bash
curl -fsS https://api.aktau.market/api/dashboard
```

Verify current production aggregates and locations are non-empty/consistent.

## Metrics/private endpoints

```bash
curl -i https://api.aktau.market/metrics
```

Expected:

```text
404
```

No public metrics endpoint.

---

# 25. Gate T — CORS through the real edge

## Allowed browser origin

```bash
curl -i \
  -H 'Origin: https://aktau.market' \
  https://api.aktau.market/api/categories
```

Required:

```text
200
Access-Control-Allow-Origin: https://aktau.market
```

## Unknown origin

```bash
curl -i \
  -H 'Origin: https://evil.example' \
  https://api.aktau.market/api/categories
```

Expected frozen behavior:

```text
403 JSON
```

## POST preflight

```bash
curl -i -X OPTIONS \
  -H 'Origin: https://aktau.market' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type' \
  https://api.aktau.market/api/voice/start
```

Expected:

```text
204
exact allowed origin
POST allowed
no credentials wildcard
```

## No-Origin client

Normal non-browser requests without `Origin` must still work.

This is required for Siri/Shortcut/server-side traffic.

---

# 26. Gate U — real production Voice through Cloudflare

Use bounded synthetic production smoke.

## Complete request

```bash
curl -sS -i \
  -H 'Content-Type: application/json' \
  -d '{"text":"найди самое дешёвое молоко 1 литр 3.2%","latitude":43.6,"longitude":51.1}' \
  https://api.aktau.market/api/voice/start
```

Expected:

```text
HTTP 201
JSON
status=result
mode=single
no Cloudflare HTML challenge
```

## Clarification + continue

Start:

```text
text = "молоко"
```

Expected:

```text
201 needs_clarification
opaque sessionId
```

Continue with a synthetic completion such as:

```text
"найди самое дешёвое 1 литр 3.2%"
```

Expected:

```text
201 result
```

Keep the session token private and delete any local temporary file containing it
immediately after the check.

This is the required public-edge proof of real Upstash session behavior.

Do not run a rate-limit burst again unless there is evidence the Part 14 edge rule
stopped working.

---

# 27. Gate V — direct-origin isolation after real API deployment

This is mandatory because the Go application is now actually running.

From WSL/external network:

```bash
nc -vz -w 3 <VPS_IPV4> 80
nc -vz -w 3 <VPS_IPV4> 443
nc -vz -w 3 <VPS_IPV4> 8080
curl --connect-timeout 3 http://<VPS_IPV4>:8080/
```

Expected:

```text
80 denied
443 denied
8080 denied
```

SSH 22 remains reachable.

On VPS:

```bash
ssh my-vps '
sudo ufw status verbose
sudo ss -lntup
'
```

Required:

```text
host 8080 = 127.0.0.1 only
no public 80/443/8080 listener
```

Do not record the public IP in the report.

---

# 28. Gate W — runtime stability observation

Observe the real production container for at least a short bounded window
(~10 minutes after smoke), without generating load.

Check:

```bash
ssh my-vps '
set -eu
sudo docker inspect adilbaga-api \
  --format "status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restart={{.RestartCount}}"
sudo docker stats --no-stream adilbaga-api
sudo docker logs --since 15m --tail 200 adilbaga-api
'
```

Logs are designed to be sanitized, but review before copying anything into a report.

Acceptance:

```text
container running/healthy
RestartCount = 0
no startup loop
no repeated DB/provider failure
no panic
no secret/voice/coordinate leakage
resources reasonable for 2 CPU / 4 GB VPS
```

Do not invent a capacity claim from this smoke.

Performance/load testing was already a separate reviewed Part; do not stress
production merely to re-prove it.

---

# 29. First-deploy rollback strategy

There is no previous Go production image before the first Go cutover.

Therefore the correct first-deploy rollback target is the accepted Part 14B
zero-application state:

```text
Cloudflare perimeter exists
Tunnel can be stopped
Go API container absent/stopped
DB unchanged
```

This is an explicit first-deploy exception to the generic “previous image SHA”
roadmap wording.

Because Part 15 performs:

```text
no DB migration
no schema change
no data write
```

rollback requires no DB rollback.

## First deployment rollback

If a critical regression appears:

```bash
ssh my-vps '
set -eu
sudo systemctl stop cloudflared
sudo docker compose \
  --env-file /etc/adilbaga/release.env \
  -f /opt/adilbaga/compose.production.yml \
  down
'
```

Verify:

```text
no 8080 listener
origin remains private
production DB untouched
```

Do not open direct origin to “restore service”.

After the first successful production release, future releases must preserve:

```text
current image SHA
previous image SHA
```

before replacing the running version.

---

# 30. Failure rules

## `/health/live` fails

Do not switch traffic.

Inspect:

```text
container state
sanitized logs
config presence/permissions
```

Do not alter DB.

## `/health/live` 200 but `/health/ready` 503

Treat as DB/runtime dependency failure.

Do not:

```text
use owner credential
disable read-only checks
remove production identity guard
change RLS
seed/migrate
```

## Gemini fails

Do not make Gemini readiness-critical.

Voice may use approved deterministic fallback where code already allows it.
Report actual behavior.

Do not remove validation.

## Upstash fails

Voice clarification is unavailable.

Do not introduce in-memory Redis fallback.

## Cloudflare/Tunnel fails

Do not expose `8080`.

Rollback public route by stopping Tunnel or correcting the existing reviewed
Tunnel configuration.

## CORS fails

Do not use wildcard.

Only `https://aktau.market` is production browser origin unless a later Part
explicitly adds another origin.

---

# 31. Update runbooks to real production topology

Part 15 must replace obsolete `FUTURE VPS` wording where the actual topology is
now known.

## `docs/runbooks/api-down.md`

Add actual production checks:

```text
cloudflared service
Docker API container
127.0.0.1 health/live
127.0.0.1 health/ready
public edge health
container restart count
sanitized logs
```

Add actual start/recreate commands using:

```text
/opt/adilbaga/compose.production.yml
/etc/adilbaga/release.env
```

Never suggest changing DB schema or owner credentials to recover API.

## `docs/runbooks/rollback.md`

Document:

- first-deploy zero-state rollback;
- future previous-image rollback model;
- no DB rollback in this Part;
- stop Cloudflare public path before unsafe application mutation;
- never expose origin as emergency fallback.

## `docs/runbooks/secret-rotation.md`

Only update VPS/runtime storage path references if necessary.

Do not rotate actual secrets in Part 15.

---

# 32. Update production perimeter/checklist docs

After successful deployment update, without deleting Phase A/B history:

```text
docs/production/NETWORK_PERIMETER.md
docs/production/CLOUDFLARE_ACTIVATION_CHECKLIST.md
```

Record:

```text
Go API deployed
127.0.0.1:8080 only
exact immediate peer measured
TRUSTED_PROXY_CIDRS exact /32 or /128
real health/ready passed
real catalog/dashboard passed
real Voice/Upstash passed
CORS passed
direct origin still denied
HSTS remains DEFERRED
```

Do not store secret env values.

Physical Siri/iPhone may remain for the final launch gate if not explicitly
performed in this Part; never claim it passed without owner confirmation.

---

# 33. Update `AGENTS.md`

Only the current-status section should change.

After Part 14B commit/push and while this task is being reviewed:

```text
Part 00–13                       DONE
Part 14 Phase A                  DONE
Part 14B network activation      DONE
Part 15 application deployment   CURRENT
Part 16+                         NOT STARTED
```

Do not rewrite unrelated project policy.

The existing statement:

```text
This repository is no longer in hackathon/MVP implementation mode.
Work now targets a real production launch.
```

is correct and must remain.

---

# 34. Part 15 report

Create:

```text
docs/production/reports/PART_15_REPORT.md
```

Report status only:

```text
READY_FOR_EXTERNAL_REVIEW
```

or:

```text
BLOCKED
```

Include sanitized evidence:

```text
release branch/SHA
hosted CI exact SHA PASS
no migration/schema delta
image tag by exact SHA
local image ID == VPS image ID
artifact transport mode
production env metadata/permissions only
restricted DB identity readiness PASS
pre-deploy production-profile smoke PASS
real Gemini/Voice outcome classification
real Upstash clarification/continue PASS
cloudflared intentionally stopped during assembly
container hardening PASS
loopback 8080 only
exact Docker peer measured
TRUSTED_PROXY_CIDRS exact /32 or /128
cloudflared resumed
public health/live PASS
public health/ready PASS
categories/products/detail/dashboard PASS
CORS allowed/blocked/preflight PASS
public Voice start/continue PASS
direct origin denied PASS
container health/restarts/observation
rollback procedure
DB mutation = NONE
migration = NONE
ingestion = NONE
frontend deploy = NONE
Part16+ = NOT STARTED
commit/push = NOT DONE
```

Do not include:

```text
DSN
password
Gemini key
Upstash URL/token
sessionId
tunnel UUID/credential
SSH key
raw env
full docker inspect Env
provider raw body
```

---

# 35. Static deployment verifier

Add a focused production deployment verifier, for example:

```text
scripts/deploy/verify-part15.mjs
scripts/deploy/verify-part15.test.mjs
```

It must be offline/static.

At minimum verify:

- `deploy/compose.production.yml` exists;
- API image comes from required `API_IMAGE` variable;
- only `127.0.0.1:8080:8080` is published;
- no bare `8080:8080`;
- no `0.0.0.0`;
- no host network;
- read-only root filesystem enabled;
- user 10001:10001;
- `cap_drop: ALL`;
- `no-new-privileges`;
- private env file path is outside repo;
- no real secrets/DSNs/tokens are present in deploy files;
- no owner/ingest DB identity appears as runtime recommendation;
- HSTS is not newly enabled;
- report states no migration/DB mutation;
- report does not falsely claim frontend/physical Siri if not run.

Negative tests are required for at least:

```text
public 8080 bind
wildcard/broad trusted proxy recommendation
embedded DATABASE_URL
embedded Gemini/Upstash token-like assignment
owner DB runtime identity
missing hardening
```

Do not make static verifier pretend it proves the live server.

---

# 36. Review archive

Extend the existing permanent archive builder with:

```text
production-part-15
```

Output:

```text
artifacts/production-part-15-review.tar.gz
```

Add a Part 15 archive verifier, for example:

```text
scripts/deploy/verify-archive.mjs
```

The archive must:

- contain current tracked review source;
- contain `PART_15_REPORT.md`;
- contain deploy files/runbooks/verifier;
- contain no `.git`;
- contain no `TODO/`;
- contain no `artifacts/`;
- contain no `.env`;
- contain no private production env;
- contain no Docker image/tar;
- contain no credentials;
- contain no `cert.pem`;
- contain no tunnel JSON;
- contain no SSH keys;
- contain no DB backups;
- contain no build outputs;
- contain no temporary Voice/session files;
- use regular unique members only;
- byte-match repository files.

Do not include the Docker release image in the review archive.

The production image remains an operational release artifact, not source-review
archive content.

---

# 37. Final verification commands

## Repository

```bash
rtk git status --short
rtk git diff --check
rtk git diff --name-only

node --test scripts/deploy/verify-part15.test.mjs
node scripts/deploy/verify-part15.mjs
```

Run current relevant Go tests only if source/runtime files were touched.

If no Go runtime source changed, do not falsely claim a new runtime code change.

## VPS

```bash
ssh my-vps '
set -eu
whoami
sudo systemctl is-active docker
sudo systemctl is-active cloudflared
sudo docker compose \
  --env-file /etc/adilbaga/release.env \
  -f /opt/adilbaga/compose.production.yml \
  ps
sudo docker inspect adilbaga-api \
  --format "status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restart={{.RestartCount}} image={{.Image}}"
sudo ss -lntup
sudo ufw status verbose
'
```

## Public edge

```bash
curl -fsS https://api.aktau.market/health/live
curl -fsS https://api.aktau.market/health/ready
curl -fsS https://api.aktau.market/api/categories
curl -fsS 'https://api.aktau.market/api/products?limit=3'
curl -fsS https://api.aktau.market/api/dashboard
```

Plus CORS and Voice checks from previous gates.

## Archive

```bash
node scripts/create-clean-archive.mjs production-part-15
node scripts/deploy/verify-archive.mjs
```

---

# 38. Expected tracked changes

Expected new/modified paths should remain narrowly deployment-focused:

```text
AGENTS.md

deploy/compose.production.yml
deploy/README.md

docs/production/NETWORK_PERIMETER.md
docs/production/CLOUDFLARE_ACTIVATION_CHECKLIST.md
docs/production/reports/PART_15_REPORT.md

docs/runbooks/api-down.md
docs/runbooks/rollback.md
docs/runbooks/secret-rotation.md          # only if runtime-path wording needs update

scripts/create-clean-archive.mjs
scripts/deploy/verify-part15.mjs
scripts/deploy/verify-part15.test.mjs
scripts/deploy/verify-archive.mjs
```

Do not modify runtime/backend/frontend/contracts/data files unless a real
deployment-blocking defect is discovered.

If a runtime defect is discovered:

1. STOP the production cutover;
2. report the exact defect;
3. make the smallest source fix;
4. run the full required quality/CI cycle;
5. obtain external review;
6. build a new immutable image from the new commit;
7. never hot-patch the container/VPS source.

---

# 39. Acceptance criteria

Part 15 is complete only if:

- [ ] exact current Git SHA captured;
- [ ] HEAD == origin/integrate/full-stack;
- [ ] hosted CI for exact SHA all mandatory jobs PASS;
- [ ] Part 14B perimeter still healthy;
- [ ] no DB schema/migration delta;
- [ ] migration action = NONE;
- [ ] exact Docker image built off-VPS from clean committed source;
- [ ] image tagged by full commit SHA;
- [ ] local/VPS image identity matches;
- [ ] no secret is baked into image;
- [ ] private production env root-owned0600 on VPS;
- [ ] runtime DB identity is `aktau_api_runtime`;
- [ ] no owner/ingest DB credential is used;
- [ ] exact image local production-profile smoke PASS;
- [ ] real production readiness PASS;
- [ ] real Upstash clarification/continue PASS;
- [ ] real Voice request PASS;
- [ ] production compose hardening present;
- [ ] API published only on `127.0.0.1:8080`;
- [ ] exact immediate Docker peer measured;
- [ ] `TRUSTED_PROXY_CIDRS` exact `/32` or `/128`;
- [ ] cloudflared resumed only after local checks PASS;
- [ ] public `/health/live` 200;
- [ ] public `/health/ready` 200;
- [ ] categories/filters/products/detail/dashboard PASS;
- [ ] allowed CORS PASS;
- [ ] forbidden CORS PASS;
- [ ] POST preflight PASS;
- [ ] no-Origin API/Voice PASS;
- [ ] public Voice clarification/continue PASS;
- [ ] no Cloudflare browser challenge;
- [ ] direct origin `80/443/8080` denied;
- [ ] `/metrics` 404;
- [ ] container healthy;
- [ ] `RestartCount=0` after observation;
- [ ] no secret/privacy leak in inspected logs;
- [ ] first-deploy rollback documented;
- [ ] DB mutation = NONE;
- [ ] ingestion/snapshot = NONE;
- [ ] frontend deploy = NONE;
- [ ] Part 16+ NOT STARTED;
- [ ] deployment verifier/tests PASS;
- [ ] review archive PASS;
- [ ] no commit/push yet;
- [ ] status = `READY_FOR_EXTERNAL_REVIEW`.

If any mandatory item fails:

```text
STATUS = BLOCKED
```

Do not hide/degrade the requirement.

---

# 40. After successful Part 15 external review

External review must happen before Git commit/push.

After owner receives external PASS, the Part 15 changes can be committed/pushed.

Only after that move to the next separately authorized production Part.

Do not automatically start Part 16.

---

# 41. Production roadmap after this Part

The project is no longer divided into “MVP now / after hackathon”.

Use:

```text
Production launch now
Post-launch hardening later
```

## Production launch sequence

```text
Part 15  Go API production deploy
Part 16  frontend revalidation after atomic snapshot publish
Part 17  frontend domain/brand production configuration
Part 18  full launch gate + real iPhone/Siri + E2E
Part 19  NestJS decommission after stable Go cutover
```

## Post-launch hardening examples

Only after launch/stability and separate review:

```text
private container registry / automated release pipeline
CD
HA / second Tunnel connector
more restrictive sudo policy
centralized production alert delivery
cloudflared update lifecycle
HSTS after full domain/subdomain proof
additional edge rules based on observed traffic
```

Do not pull these into Part 15 unless required to safely launch the Go API.

---

# 42. Final stop rule

When all Part 15 gates pass:

```text
STATUS = READY_FOR_EXTERNAL_REVIEW
```

Then:

1. update `docs/production/reports/PART_15_REPORT.md`;
2. rebuild `production-part-15-review.tar.gz`;
3. verify archive;
4. provide sanitized summary;
5. **STOP**.

Do not:

```text
git commit
git push
start Part 16
deploy frontend
run ingestion
change DB
enable scheduler
enable HSTS
decommission NestJS
```

until external review explicitly accepts Part 15.
