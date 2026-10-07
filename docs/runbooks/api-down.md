# API unavailable

## LOCAL NOW

Symptoms: connection failure, unhealthy container, repeated 5xx. Probe the
known local origin's /health/live (process) and /health/ready (DB/runtime ability).
live200/ready503 is dependency degradation, not proof of process death. Use
RTK curl and inspect only your owned process/container. Read structured JSON
logs by request_id, route template and bounded error_code; do not dump env,
request bodies or container Env. Reproduce locally with private loopback config.

Check numeric pool/query failure signals and [db-down](db-down.md) before any
restart. Redis/Gemini outages do not invalidate catalog readiness. Preserve
logs safely without sensitive payloads. For a regression in a known immutable
app revision, follow [rollback](rollback.md); never fix API availability by
changing RLS/schema, running seed/migrations or switching to owner DB credentials.
Recovery: live200, ready200, frozen GET smoke and controlled Voice flow; no new
5xx and bounded latency. An unavailable backend alone is not DB loss.

## VPS — Part15 installed paths; rollout currently BLOCKED

Railway retired. Host cloudflared → loopback Docker API; Supabase restricted
identity only. See [deployment procedure](../../deploy/README.md). Current failed
candidate was rolled back: no API container/listener, Tunnel intentionally stopped.
Portable identity and readiness now PASS; do not restart/publicly activate it
until the current source/security review, hosted CI and new immutable image gates
pass. Provider-perfect availability is superseded: require correct application
Voice/session flows through Gemini success OR approved deterministic fallback.
See the same Part15 report for the current blocker; do not hot-fix dependencies
or runtime on VPS.

```bash
ssh my-vps 'sudo systemctl is-active docker cloudflared'
ssh my-vps 'sudo docker compose --env-file /etc/adilbaga/release.env -f /opt/adilbaga/compose.production.yml ps'
ssh my-vps 'curl -fsS http://127.0.0.1:8080/health/live; curl -fsS http://127.0.0.1:8080/health/ready'
```

After separately approved recovery, require running/healthy/restart0, loopback
publication, real Voice/session smoke and then public health through Tunnel.
Recreate command is documented in deploy/README; close public traffic first.
Inspect logs privately, output fixed error/provider classes only, never raw env,
voice text/coordinates/session IDs. Disk/memory/alert delivery and probe cadence
remain separate operations work, not a scheduler installed by this deployment.
