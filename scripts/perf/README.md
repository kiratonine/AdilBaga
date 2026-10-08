# Part13 local performance rehearsal

This is API protocol load against owned disposable resources, **not production/VPS
capacity evidence**. Requires accepted Part12 SHA with real GitHub CI Gate PASS,
Docker, local Go/Node/GnuPG/PostgreSQL17 clients and official `grafana/k6:2.3.0`.
No automatic system install, cloud k6, real providers or production URL.

Privately source the owner's0600 env file with tracing off, exporting PERF_BACKUP_FILE
(encrypted Part11 dump plus adjacent metadata) and PERF_BACKUP_GPG_HOME. Keep paths
and key material out of report/logs. Runner requires the accepted Part11 checksum
and counts/fingerprints; a newer backup needs provenance review, not data overwrites.

```sh
rtk proxy node --test scripts/perf/helpers.test.mjs
# Privately source owner environment with tracing off and export first.
rtk proxy node scripts/perf/run-local.mjs
# Safe numeric aggregates from ignored generated results (no raw SQL/inputs).
rtk proxy node scripts/perf/summarize.mjs
```

Quality before representative load: Go unit/race/vet/pinned staticcheck, local
Go1.27.1/GOTOOLCHAIN=local and Node24. No runtime tuning.

Runner creates randomly namespaced owned bridge, PG17, Go API, fake and bounded k6
containers; cleans exact containers/anonymous volumes/network in finally. PG/API
host ports bind127.0.0.1; fake publishes no port. Docker29 internal networks suppress
the published loopback port needed by restore, so this is an owned standard bridge,
**not an Internet firewall**. Generated target guards and minimal env prevent live/
provider targets; scenarios make no external requests. Images cached locally except
approved pinned k6 pull. API build uses unchanged Dockerfile with network disabled.

Tier A: shared fixture unchanged plus reviewed CI Voice overlay, smoke only. Tier B:
fresh PG17, existing guarded decrypt/checksum restore, full app counts/fingerprints/
history/RLS proof, local SELECT6-only runtime (no private3 access). Local
pg_stat_statements profiling only, not a migration. Results contain query IDs and
numeric aggregates, never SQL/args. Pool max4 unchanged.

Cold smoke30s; mixed5/60s,10/120s,20/180s,40/120s; soak20/300s. Mix products30%,
search20%,filter15%,detail15%,categories5%,dashboard10%,alternate sorts5%; later
product page when available. Isolated dashboard5/60s and six list/sort/search/filter
profiles5/30s. Voice direct1/s and clarification0.5flows/s each60s, max4VUs/concurrency4.
IDs/search/filter values/session IDs discovered through API and not reported.

Measurement overrides general1000/2000 and Voice100/200; concurrency4 unchanged.
Separate policy process uses default general20/40 and Voice2/4. Intentional policy/
outage errors are not mixed into normal capacity thresholds. Gemini absent:
fallback measured; Google latency/capacity **NOT MEASURED**. Fake supports exact
authenticated SET EX600/GET/DEL, TTL expiry, <=1024 entries,1MiB body, no persistence
or key/payload logs. It is not an application memory fallback.

Ignored raw output: artifacts/perf-part13; archive excludes it. Final docs contain
safe aggregates. Failure prints class only. Never tune runtime/index/pool/timeouts
or restart API to conceal a failing capacity target; STOP for review.

## Reviewed equivalent mapping audit (pm-audit-v1)

The legacy Part11 mapping aggregate expression was not retained. Its reference
hash remains unchanged in Part11 and Part13 history; it is NOT used to choose or
tune this independent encoding. Only product_mappings uses the separately reviewed
double-restore proof: two fresh owned plain PG17 targets restore the same immutable
encrypted backup through unchanged restore-test.sh. Each first proves empty public,
drops public RESTRICT (no CASCADE), then proves it absent. Compare count=863 and all
three fingerprints before deleting B; all other tables retain legacy comparisons.

Exact executable expression: [product-mappings-audit.sql](product-mappings-audit.sql).
Field inventory must be exactly id/rawProductId/canonicalProductId/matchMethod/
matchConfidence/reviewStatus/createdAt. Non-float encoding is PostgreSQL
json_build_array in that fixed non-float field order, with enum text and timestamp
without time zone formatted YYYY-MM-DDTHH24:MI:SS.US (microseconds, no rounding).
JSON preserves escaping/nulls. Float encoding is exact float8send network bytes,
hex, not decimal text. Each fingerprint aggregates MD5 row digests separated by
newline, ordered by id COLLATE C; full rows use fixed pm-audit-v1 marker and pipe
delimiter, and the aggregate includes the same version marker. The SQL fixes every
delimiter and version. Repeat on A after instrumentation and after all load.
This proves field-complete deterministic restoration, not equivalence to the
unavailable historical aggregate serialization or production/VPS capacity.

Application RLS9 inventories only the nine application tables, not the separately
RLS-protected Prisma migration-history table. Check exact reader6/writer17 policy
matrix/name/command/qualifiers, FORCE0, one published snapshot/three succeeded runs,
three exact migration names and local non-admin SELECT6-only runtime membership.
All checks precede local profiling and representative API startup. Sampler errors
stay bounded, cancel the child, and propagate only after owned-container cleanup.
