# Observability alert policy — local foundation

No monitoring provider/exporter, public /metrics, delivery destination or
scheduler exists. **External alert delivery NOT CONFIGURED**. All conditions
below are policy, not claims of active alarms. Runtime remains local-only;
Railway retired; VPS/domain/Cloudflare not provisioned.

| Alert | Signal / condition class | Source / severity | First action / recovery | Deployment dependency / runbook |
| --- | --- | --- | --- | --- |
| API unavailable | live probe fails N consecutive checks | private operator probe / critical | inspect process; recover live and ready | probe cadence, N and delivery after staging; [api-down](../runbooks/api-down.md) |
| 5xx spike | 5xx fraction above configured threshold/minimum sample count in rolling window | fixed HTTP counters / high | request_id + route/error_code; return to measured baseline | exporter/window/threshold from Part13; [api-down](../runbooks/api-down.md) |
| DB unavailable | ready503 with live200; query failures/pool saturation persist | readiness + numeric pool/query counters / critical | check availability/restricted identity; ready200 and reads recover | collector, consecutive checks; [db-down](../runbooks/db-down.md) |
| Ingestion failed | operator CLI failure or failed staged source/snapshot | safe completion/phase counters + operator history / high | inspect validation/lock; preserve previous published snapshot | separately approved ingestion activation; [ingestion-failed](../runbooks/ingestion-failed.md) |
| Snapshot too old | sampled publication/source age exceeds configured cadence/SLA | snapshot gauge; source freshness operator-only / high | inspect last publish/source report; verified timely publish | cadence/SLA + separate reviewed collector credential; [ingestion-failed](../runbooks/ingestion-failed.md) |
| Gemini sustained failure | non-success outcome fraction/latency in configured window | parse histogram + fixed provider classes / warning/high | inspect timeout/auth/quota classes; structured parse recovers | window and alert threshold from staging; [secret-rotation](../runbooks/secret-rotation.md) |
| Disk threshold | free space below configured minimum over N samples | future host metrics / high | stop unsafe writes/inspect capacity; free space recovers | **DEFERRED — VPS**, host agent/tool not selected; [api-down](../runbooks/api-down.md) |
| Memory pressure | sustained resident/host pressure over measured limit | future host/container metrics / high | inspect bounded workload; safe app rollback if needed | **DEFERRED — VPS**, thresholds Part13/15; [rollback](../runbooks/rollback.md) |
| Certificate/domain problem | expiry within configured lead time or DNS/HTTPS probe failure | future TLS/domain probe / critical | inspect approved domain/cert configuration; HTTPS healthy | **DEFERRED — domain/VPS**, topology Part14/15; [api-down](../runbooks/api-down.md) |

Redis get/set/delete failures observe session degradation separately: catalog
must remain available; follow [redis-down](../runbooks/redis-down.md). Backup or
restore failure requires operator attention and [rollback](../runbooks/rollback.md);
no recovery guarantee is inferred from an untested encrypted file.

## Signals and privacy

Registry Snapshot() is internal/test-only with no network exporter. Counters and
exclusive fixed latency buckets support future delta-RPS and approximate
p50/p95/p99; **no live RPS dashboard or externally computed quantiles now**.
Snapshot/source age gauges are sampled when existing reads complete, not a
background collector. The API role must not read source_runs. A future collector
needs separately reviewed least privilege; do not extend runtime grants.

Use fixed route/method/status-class/dependency/phase/store-enum labels only.
Never export SQL/args, URLs, request/session/product IDs, voice/search text,
coordinates, IPs, provider bodies, tokens or raw errors. Logs are JSON with
timestamp/level and HTTP request_id/route/method/status/duration_ms/error_code;
request IDs are correlation metadata, not metric labels.

## Activation decisions still required

Part12: reviewed CI/staging and synthetic/restore automation; no scheduler here.
Part13: measure windows, thresholds, minimum samples and ingestion cadence SLA.
Part14: choose private network/exporter/domain/TLS probe topology.
Part15: host monitoring, actual alert delivery, backup timer, independent storage
and key custody. Select severity routing/dedup/recovery notifications then.
No arbitrary permanent numeric threshold or vendor choice is introduced now.
