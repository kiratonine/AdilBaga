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

## FUTURE VPS

Service/process restart command, probe cadence, disk/memory/domain/TLS checks
and alert delivery are **DEFERRED** until actual topology is reviewed. No fake
deployment command or automatic restart/scheduler is configured. Railway retired.
