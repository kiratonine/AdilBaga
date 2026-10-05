# Production Part13 — Local performance and load testing

Status: **READY_FOR_EXTERNAL_REVIEW**.
Date: 2026-10-06. Reviewed equivalent mapping audit, full integrity/security and
all local representative Part13 profiles PASS. Earlier BLOCKED runs preserved below.

## Immutable provenance — PASS

Fetch `origin --prune` PASS. Branch `integrate/full-stack`, initially clean;
HEAD=origin/integrate/full-stack:
**PART13_BASE_SHA `b9ef53347c42c35143a9930801d38e030f27bd80`**.
Owner Part12 commit: `feat(ci): add release gates and ephemeral staging`.
Parent `7b8c925cb57a985c302207ed504cf1e7af070a18`.
Preflight `git diff --check` PASS. No reset/rebase/restore/merge/commit/push.

## Real Part12 Phase B evidence — PASS

GitHub CLI is not installed; did not install it. Public GitHub Actions API returned
HTTP200 for runs filtered by the exact baseline SHA and for that run's jobs.
Verified [CI run37354994690](https://github.com/kiratonine/AdilBaga/actions/runs/37354994690):
head_sha exactly PART13_BASE_SHA, status completed, conclusion success.
Verified [CI Gate job111917159058](https://github.com/kiratonine/AdilBaga/actions/runs/37354994690/job/111917159058):
name `CI Gate`, completed, success. All seven dependency jobs completed success:
Frontend, Nest Reference, Security, Go Quality, Contracts, PostgreSQL Integration,
Ephemeral Staging. This is real hosted execution, not inferred from the historical
Part12 local report's NOT RUN statement. No GitHub settings or source changed.

## Initial mandatory blocker — backup input unavailable (history, resolved)

**PART13_REPRESENTATIVE_DATA_UNAVAILABLE**.
Safe presence check: `PERF_BACKUP_FILE` UNSET; `PERF_BACKUP_GPG_HOME` UNSET.
Part13 requires explicit operator-provided encrypted Part11 application backup
(`*.dump.gpg` plus adjacent metadata) and private GPG home. Did not search home
directories, guess private artifact paths, source the Part11 live backup URL,
read production credentials, connect to production, create a replacement dump,
or substitute the small fixture for representative performance evidence.

Smallest next input: owner supplies the explicit path of a private environment file
exporting PERF_BACKUP_FILE and PERF_BACKUP_GPG_HOME, or safely exports those two
variables into the operator environment. Keep backup/key material outside repo;
no DSN/password/key contents are needed in chat or report.

## Initial not-run evidence after prerequisite STOP (history)

k6 resolution/pull, Go quality rerun, Docker resource creation, decrypt/restore,
counts/fingerprints/security proof, fixture smoke, representative read profiles,
5-minute soak, Voice/fake-session profiles, limiter/outage/recovery measurements,
CPU/memory/connection/query aggregates and privacy checks: **NOT RUN**.
No latency/RPS/capacity numbers or performance PASS claimed.
Performance harness/baseline document and Part13 archive target/archive are
**NOT CREATED** in this prerequisite-only STOP. Existing Part12 artifacts are not
represented as Part13 results. Only this report is added; runtime/API/frontend/
Prisma/contracts unchanged. No production load/mutation, real Gemini/Upstash,
Railway/VPS/domain/Cloudflare, deploy, N+1 or ingest apply.

**BLOCKED — stopped pending explicit representative backup inputs.**

## Owner-supplied private inputs — resolved

Privately sourced the explicitly supplied operator env with shell tracing OFF;
encrypted file, adjacent JSON metadata and GPG directory exist. Private directory
mode700 verified. No input paths, secret/key contents or URL/host/password printed
or persisted in this report/generated results. Did not search arbitrary directories.
Manifest's approved Part11 plaintext SHA match PASS (boolean only emitted).
Fetch/prune repeated: HEAD=origin=PART13_BASE_SHA, only existing report initially
dirty. Earlier real hosted CI Gate evidence retained. No Part12/history reset.

## Tooling and local quality — PASS

Official `grafana/k6:2.3.0` pulled; actual version
`k6 v2.3.0 (commit/e088784614, go1.27.1, linux/amd64)`.
RepoDigest `sha256:9c2dee7f8ed74d317e4027c06a10f169b625638189de8d4555d0b3486a5aeb34`.
Docker29.1.3, Go1.27.1/GOTOOLCHAIN=local, WSL2 kernel6.18.40.1 linux/amd64;
12 logical CPUs,16,705,351,680 memory bytes. PostgreSQL17 Alpine cached image;
pg_restore17.10, GnuPG2.4.4. No system tool installation or unreviewed generator.

Go full `test -count=1 ./...`, full race, vet and pinned staticcheck PASS.
Focused Node tests PASS2/2: unsafe targets/ownership/missing inputs/exact pinned
image; fake SET EX600/GET/DEL, TTL, auth/body validation, bounded map and1MiB limit.
Final script syntax and diff checks PASS. An initial invocation used the wrong
working directory/unquoted inherited PATH, failed before tests, then corrected
explicit directories/PATH and executed the full gates above; no assertion hidden.

## Local harness and orchestration history

Created scripts/perf source: focused load scenarios/discovery, fake sessions,
helpers/tests, local runner, README and archive verification. Uses existing
unchanged Dockerfile/API and existing guarded restore script. No Go/Nest/frontend/
contracts/Prisma/index/pool/timeouts/default rate changes. SQL writes only on owned
disposable PG17; local pg_stat_statements instrumentation, not a migration.
API pool stays max4. No real Gemini/Upstash credentials inherited by children.

First harness attempt used Docker internal network; Docker29 did not expose its
published PG port and loopback restore binding proof failed. Exact resources cleaned.
Harness-only correction uses a randomly owned standard bridge and explicit loopback
PG/API bindings; fake has no published port. This is **not an Internet firewall**;
generated target guards/minimal env ensure no public/production/provider requests.
API build uses network none and cached base/module layers. Only k6 image acquisition
and already-required GitHub provenance API verification used external network.

Tier A fixture smoke then PASS: existing unchanged shared fixture plus CI overlay,
local restricted SELECT6 runtime, non-root/read-only API, fake sessions without
persistence. Cold30s mixed1RPS,30 measured requests,33 checks PASS, errors0/5xx0,
max sampled connections1/active0. p50=2.595ms,p95=5.558ms,p99=7.814ms,max8.635ms.
Scheduled rate1.00RPS; k6 whole-run rate0.944/s includes discovery/teardown.
API CPU avg0.598%,max3.15%, memory avg6.24MB,max7.51MB;
DB CPU avg0.391%,max3.75%, memory avg55.06MB,max56.42MB.
Direct fallback Voice and clarification→continue functional smoke PASS, not a
Voice capacity profile. Query aggregates captured without SQL/values: top queryid
2738654720222302525,calls25,mean0.129ms,max0.605ms,total3.234ms,rows68;
queryid1195472369116484460,calls29,mean0.056ms,max0.168ms,total1.621ms,rows93.
These are **small-fixture functional evidence only**, not representative performance.
The alternate-sort selector was subsequently corrected to alternate both sorts and
duration bounded to300s; syntax PASS, final revised load source not rerun after STOP.

## Previous mandatory blocker — representative restore FAILED (history)

**PART13_REPRESENTATIVE_RESTORE_FAILED**.
Fresh second PG17 created exclusively for representative restore with only local
NOLOGIN reader/writer prerequisites and a new empty application DB. Existing
guarded decrypt/checksum/custom-format stages reached restore. `pg_restore`
--no-owner/--no-acl/--exit-on-error invocation failed; wrapper exit1.
Safe diagnostics: `postgres_outcome_class=operation_failed`,
`restore_failed:restore`. Do not interpret these as a specific SQL defect: underlying
raw pg_restore error is not exposed by existing sanitized wrapper. No restore error
ignored, no exit-on-error removed, no production repair or backup mutation performed.

Initial restore attempt reported only generic operation_failed. Added bounded
known-class extraction to perf helper diagnostics (not backup helper/runtime), then
one new disposable run repeated Tier A PASS and confirmed the restore-stage class
above. After confirmed restore FAIL, mandatory STOP applied. No further restore
retry or representative load. Expected app counts/fingerprints/history/RLS and
restricted representative runtime proof therefore **NOT VERIFIED**.

Smallest next reviewed action: diagnose the existing guarded pg_restore failure
on another explicitly authorized disposable target with sanitized error classes;
do not change production/backup/restore safeguards or optimize runtime to bypass it.
Representative5/10/20/40RPS,soak,isolated profiles,Voice load,policy/outage/recovery,
representative CPU/memory/connections/query aggregates and highest stable step
are **NOT RUN/not established**. No capacity/SLO claim. Gemini external capacity
and latency NOT MEASURED; only deterministic fixture fallback was exercised.

## Cleanup, report and partial review artifact

Each attempt removed exact owned API/k6/fake/PG containers, anonymous volumes and
network. Existing restore trap removed decrypted temporary material. Original
encrypted backup/private keyring retained outside repo; no unrelated resource/data
removed. No production DB connection/load/mutation, real providers, store scraping,
Railway/VPS/domain/Cloudflare, deploy, N+1, ingest apply, commit or push.

PERFORMANCE_BASELINE.md explicitly contains only fixture evidence and marks the
representative baseline unavailable. Permanent production-part-13 archive target
added, preserving narrow secret-rotation.md allowance. Partial BLOCKED review archive
excludes raw generated perf summaries/stats, all env/backup/key/dump/dependency/
build/test/binary outputs; source/report byte-match, safe unique regular members,
six runbooks and bounded secret scan checked after build. This archive is not a
Part13 PASS artifact. **BLOCKED — stopped for external review of restore blocker.**

## Reviewed plain-target isolation and one diagnostic restore — history, 2026-10-06

Fetch/prune PASS; branch integrate/full-stack, HEAD=origin=PART13_BASE_SHA
`b9ef53347c42c35143a9930801d38e030f27bd80`. Only known Part13 candidate changes;
history/source preserved, no reset/restore/rebase/commit/push. Prior hosted Part12
CI Gate PASS evidence retained. Private inputs sourced with tracing OFF; no backup/
key path or contents printed, saved in diagnostics or included in this report.

New helper `scripts/perf/diagnose-restore.mjs` performs exactly the approved isolation
sequence, with no benchmark/repair. First target: a fresh plain postgres:17-alpine,
no shared_preload_libraries override, bounded final TCP readiness, new empty
part11_perf and only aktau_api_reader/aktau_ingest_writer NOLOGIN prerequisites.
Executed **unchanged** ops/postgres/restore-test.sh with --exit-on-error preserved.

| Approved check | Safe actual result |
| --- | --- |
| plain local server version | PostgreSQL17.11 |
| pg_restore client version | PostgreSQL17.10 |
| plain restore | FAIL |
| second new disposable diagnostic server | PostgreSQL17.11, no profiling preload |
| diagnostic decrypt/checksum/custom-format | PASS |
| one diagnostic pg_restore --verbose/--exit-on-error | FAIL |
| bounded error class | duplicate_object |
| allowlisted failing object kind/name | SCHEMA / public |

Current exact blocker: **PART13_RESTORE_DUPLICATE_PUBLIC_SCHEMA**.
Diagnostic raw stderr/SQL is captured only inside helper memory and never emitted
or persisted. Only bounded class and strict allowlisted application object escape;
unknown identifiers are omitted. The failure is an existing public-schema object
conflict during restore. Did not infer backup corruption or alter encrypted input.
The reviewed plain target also fails, so instrumentation is **not confirmed** as
the cause; no pg_stat_statements enable/restart experiment performed.

Exactly two new disposable targets in this continuation: plain isolation, then the
single permitted diagnostic target. Both removed with exact owned names/volumes;
diagnostic decrypted temporary directory removed in finally. Existing restore trap
cleans its own plaintext. Backup/keyring retained unchanged outside repo.

No DROP/ALTER target repair, --clean, ignored errors, removed --exit-on-error,
backup/restore-script change, Prisma/RLS/runtime change, production connection,
real provider call or performance load. Counts/fingerprints/migrations/RLS/history
must all PASS before any representative load, and remain NOT VERIFIED after FAIL.
5/10/20/40RPS and remaining Part13 gates remain NOT RUN.

Smallest next review decision: approve a precise disposable-target preparation
that resolves the existing public-schema conflict, consistent with the successful
Part11 restore; do not automatically change target schema or weaken safeguards.
Per reviewed instruction, stopped after safe diagnosis. Focused helper tests
PASS3/3 including bounded diagnostic output/no SQL/private identifiers; syntax and
diff checks PASS. Rebuilt BLOCKED archive retains all history, source/report bytes
match, no backup/key/env/raw diagnostic artifact. **BLOCKED; external review required.**

## Reviewed disposable target preparation — restore blocker resolved

Fetch/prune PASS, HEAD=origin remains PART13_BASE_SHA; known Part13 changes
preserved. No reset/restore/rebase/commit/push. Added only Part13 harness preparation,
timer safety and related harness correctness checks, no protected source changes.

Before representative restore, prove the container was created by this process,
its generated namespaced name passes ownership guard and its owner label equals
this run's namespace. Inside a transaction, assert current_database=part11_perf,
public exists, and no public relations/functions/types. Execute **DROP SCHEMA public**
without CASCADE (default RESTRICT); assert to_regnamespace(public) IS NULL.
Any proof/drop failure aborts; never remove user-created objects or repair a dirty
target. These assertions **PASS** on fresh owned targets.

Representative PG17 now starts plain, without pg_stat_statements preload. Exact
unchanged restore-test.sh then **PASS exit0**, preserving no-owner/no-acl/
exit-on-error. Duplicate-public-schema blocker resolved by reviewed preparation,
not by changing backup, restore safeguards or production. Profiling enable/restart
is sequenced only after full integrity; it has **NOT RUN** on representative data.

### Timer safety — PASS

Timer catches sampling exceptions, retains only sampling_failed/DB_pool_invariant,
stops polling, requests controlled child termination; owner finally removes the
owned k6 container before propagating the bounded error. Outer cleanup still owns
API/fake/DB/network resources. Unit injected private exception proves one tick,
bounded class, cancellation and deferred propagation after cleanup. Focused Node
tests now **PASS4/4**. Source/default runtime behavior unchanged.

### Integrity verifier harness correction and new mandatory STOP

First prepared restore PASS was followed by a SQL verifier failure: harness used
the shorthand confidence column from report prose, while checked-in schema/migration
names it **matchConfidence**. Corrected only harness SELECT expression to the actual
field; no DB/schema/data or protected source modification. A new fresh owned run
repeated target proof/restore PASS and collected all table counts/fingerprints.
Offline comparison of that saved safe audit output (no new DB access) shows:

| Table | Restored count = Part11 | Exact fingerprint matches Part11 |
| --- | ---: | --- |
| stores | 3 | PASS |
| store_locations | 15 | PASS |
| categories | 6 | PASS |
| raw_products | 863 | PASS |
| canonical_products | 849 | PASS |
| product_mappings | 863 | **FAIL** |
| offers | 863 | PASS |
| snapshots | 1 | PASS |
| source_runs | 3 | PASS |
| _prisma_migrations | 3 | PASS |

Current blocker: **PART13_PRODUCT_MAPPINGS_FINGERPRINT_REFERENCE_MISMATCH**.
Reference `eaee049588f7f77a9a5ecdb47cf8410e`;
current verifier `b21269e7cb1bba6111970f7c18ab839e`.
This is not a claim of data loss: encrypted-stream checksum/decrypt/custom format
and actual restore PASS, all counts and nine other fingerprints match. The original
Part11 report specifies float8send bytes plus canonical non-float JSON but does not
give its complete encoding expression. Current harness removes matchConfidence
from JSONB text, directly concatenates exact float8send hex, hashes each row, then
aggregates row hashes without delimiter ordered by id COLLATE C. Potential encoding
difference is **not yet proven**; did not pick a new hash scheme until it matches,
round floats, omit fields, overwrite backup/reference or ignore the mismatch.

Smallest next reviewed input: exact Part11 product_mappings fingerprint expression
or separately reviewed equivalent verification of all fields/exact float8 bits.
Full integrity gate remains FAIL until this is resolved. Three migration-record
count/full-row fingerprint matches, but explicit migration-name/RLS/policies/
snapshot-history/security SELECT6/private3 proof did not execute after the mismatch.
No representative API or profiling was started; no cold/5/10/20/40RPS/soak,
isolated/Voice/policy/outage/recovery/privacy/post-load measurements. All remain
NOT RUN. Tier A smoke still PASS, not substituted for representative evidence.

Prepared future policy orchestration separates fresh general and Voice policy
processes, so spent general tokens cannot mask VoiceGate; unexecuted, no policy
PASS claimed. Existing runtime general20/40, Voice2/4/concurrency4 unchanged.

Both new runs cleaned exact owned containers/anonymous volumes/network, restore
trap removed plaintext, original backup/keyring preserved. No production, real
providers, deployment or data repair. Full Go quality results from unchanged source
remain prior PASS evidence. Updated baseline explicitly BLOCKED; syntax/diff checks
PASS and partial review archive rebuilt/verified with source/report byte-match,
safe regular unique members, six runbooks and bounded secret scan.

**BLOCKED — stopped before representative load; external review required.**

## Separately reviewed equivalent product_mappings verification

Owner confirmed historical aggregate SQL serialization was not saved. Legacy
Part11 hash `eaee049588f7f77a9a5ecdb47cf8410e` remains unchanged; no expression
search/hash matching, float rounding or reference rewrite. Instead, owner approved
field-complete binary-safe double-restore proof **only for product_mappings**.
Other nine tables still require exact legacy count/fingerprint matches.

Two independent fresh owned PG17 targets A/B restored the SAME immutable encrypted
Part11 backup. Both use reviewed empty-public ownership guards, DROP public without
CASCADE, absence proof and unchanged restore-test.sh/no-owner/no-acl/exit-on-error.
Both restore exits **0**. Before audit, verify actual mapping columns are exactly
the seven expected fields; no extra field can silently escape the audit.

Exact versioned SQL (also committed-candidate scripts/perf/product-mappings-audit.sql):

```sql
WITH encoded AS (
  SELECT id,
    json_build_array(id, "rawProductId", "canonicalProductId",
      "matchMethod"::text, "reviewStatus"::text,
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.US'))::text AS non_float,
    encode(float8send("matchConfidence"), 'hex') AS float_bits
  FROM product_mappings
)
SELECT json_build_object(
  'version', 'pm-audit-v1',
  'count', count(*),
  'nonFloatFieldsFingerprint', md5(coalesce(string_agg(md5(non_float), E'\n' ORDER BY id COLLATE "C"), '')),
  'matchConfidenceBinaryFingerprint', md5(coalesce(string_agg(md5(float_bits), E'\n' ORDER BY id COLLATE "C"), '')),
  'fullCanonicalFingerprint', md5('pm-audit-v1|' || coalesce(string_agg(
    md5('pm-audit-v1|' || non_float || '|' || float_bits), E'\n' ORDER BY id COLLATE "C"), ''))
) FROM encoded;
```

Fixed non-float field order/JSON escaping/null encoding, explicit timestamp(3)
formatted to microseconds without timezone conversion, exact float8 network bytes,
newline row-digest separator and pipe/version marker. No decimal float encoding.
Historical aggregate serialization unavailable; **equivalent field-complete
binary-safe double-restore proof used**, not a claim that legacy aggregate matches.

| Audit | A | B |
| --- | --- | --- |
| Version | pm-audit-v1 | pm-audit-v1 |
| Count | 863 | 863 |
| nonFloatFieldsFingerprint | b0250d2f99e88c9e1f29d8a91f9a6f3c | b0250d2f99e88c9e1f29d8a91f9a6f3c |
| matchConfidenceBinaryFingerprint | 00fc971e240d5d0288cf814005767262 | 00fc971e240d5d0288cf814005767262 |
| fullCanonicalFingerprint | d1f78d4cc4ba26353ba3a440badd56d8 | d1f78d4cc4ba26353ba3a440badd56d8 |

**A/B equality PASS**, secondary target deleted before main security proof/load.
Focused helper tests **PASS5/5**, including audit encoding contract and preserved
timer deferred-error cleanup proof.

### Application RLS inventory harness correction (history)

First A/B verification PASS run then stopped before load: harness accidentally
included RLS-protected _prisma_migrations in its application-table RLS9 inventory.
Corrected only Part13 SELECT inventory to exact nine application table names.
Migration-history table is not one of application RLS9; its data remains covered
by exact Part11 count/fingerprint and three-name/status proof. No policy/RLS/data
change or suppression. Owned resources cleaned; at that point repeated full local
run was pending. Its completed results follow.

## Final representative run — all mandatory gates PASS

Repeated complete local orchestration from fresh owned resources after the
application-table inventory correction. Fixture Tier A smoke/Voice PASS, not
capacity evidence. New independent representative A/B restore exits0, approved
plaintext SHA unchanged, all10 counts match and nine legacy fingerprints match.
Both pm-audit-v1 hash sets equal the table above. B deleted before load.
Legacy mapping aggregate reference remains retained, not replaced or declared matched.

### Integrity/security/history — PASS before and after load

Counts: stores3,locations15,categories6,raw863,canonical849,mappings863,offers863,
snapshots1,source_runs3,_prisma_migrations3. Exact finished/not-rolled-back names:
20260923000000_init;20261004000000_rls_runtime_access;20261005000000_snapshot_history.
Exact application RLS9/FORCE0; exact23 permissive policies: reader6 SELECT and
writer17 SELECT/INSERT/UPDATE matrix with expected names/roles/qualifiers. No policy
repair. Exactly1 published snapshot with publishedAt; all3 SourceRuns succeeded
and belong to that snapshot. Migration rows/history retain exact legacy fingerprint.

Local runtime has exactly reader membership, ADMIN=false/INHERIT=true/SET=false,
LOGIN/INHERIT but no superuser/create-role/create-db/replication/bypassRLS.
Public USAGE, SELECT6 metadata and actual restricted SQL SELECT6 PASS; private3
SELECT denied by privilege metadata, schema CREATE and DML denied. No production
credential or role/state used. Go pool stays max4; runtime/API source unchanged.

Only after all above PASS: enable pg_stat_statements on local owned PG17, restart
same PG, create local extension/ANALYZE, recheck all legacy local fingerprints,
versioned mapping set, exact RLS/policies/history. All unchanged. After all load/
policies/outages, repeat all data hashes and security/history: **PASS unchanged**.

### Environment and interpretation

Same immutable PART13_BASE_SHA and prior real Part12 CI Gate evidence. Docker
reports12 CPUs/16,705,351,680 bytes available; explicit API/DB NanoCpus/Memory limits0
(no extra container cap). WSL/local hardware shared with Docker, sampler and k6,
not a provisioned VPS. Same official pinned k6/image digest and reviewed unchanged
Go image. Non-root UID10001, read-only rootfs, tmpfs, cap-drop/no-new-privileges PASS.
No real Gemini keys/Upstash credentials inherited. Test-only capacity limits
general1000/2000,Voice100/200; concurrency4 unchanged. Dedicated policy processes
use source defaults general20/40,Voice2/4. No runtime/index/pool/timeout tuning.

Profiles discover valid values from restored catalog; limit24/later page24,
actual search token, category/filter and detail ID. Mixed reads approximately
list30%,search20%,filter15%,detail15%,categories5%,dashboard10%,alternate sorts5%.
Cold startup observation is separate; warm profiles introduce no new cache.

### Measured request/latency results

All rows: exit0, checks100%, unexpected errors0,5xx0,dropped iterations0,
container restart0. Latency in ms, includes measured endpoint HTTP duration.
"Scheduled" is measured requests divided by configured load-phase seconds;
"whole" is actual k6 counter rate over its reported whole test duration. These
are distinct: whole rates include all non-load/termination/accounting overhead;
exact decomposition of that overhead was not measured. No fabricated actual RPS.
Boundary scheduling can yield one extra iteration. Clarification is0.5flows/s,
two measured requests/flow (30 complete flows,60 requests).

| Profile | Offered RPS / seconds | Requests | Scheduled / whole RPS | p50 | p95 | p99 | max | Checks passed | DB max total/active |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cold smoke | 1 /30 | 31 | 1.033/0.980 | 6.191 | 8.245 | 11.688 | 13.145 | 34 | 1/0 |
| Read5 | 5 /60 | 300 | 5.000/4.687 | 5.855 | 7.153 | 8.470 | 9.827 | 345 | 1/1 |
| Read10 | 10 /120 | 1201 | 10.008/9.417 | 6.062 | 7.367 | 8.795 | 14.236 | 1381 | 1/1 |
| Read20 | 20 /180 | 3601 | 20.006/18.809 | 6.047 | 7.169 | 8.273 | 1966.130 | 4141 | 1/1 |
| Read40 | 40 /120 | 4800 | 40.000/38.158 | 5.847 | 7.055 | 8.133 | 14.007 | 5520 | 1/1 |
| Soak20 | 20 /300 | 6000 | 20.000/18.832 | 5.905 | 7.730 | 10.414 | 37.089 | 6900 | 1/1 |
| Dashboard | 5 /60 | 301 | 5.017/4.696 | 5.279 | 7.948 | 10.045 | 2002.235 | 301 | 1/0 |
| List price_asc | 5 /30 | 150 | 5.000/4.708 | 6.582 | 8.362 | 11.666 | 13.266 | 150 | 1/0 |
| price_desc | 5 /30 | 151 | 5.033/4.736 | 6.538 | 7.568 | 8.723 | 9.522 | 151 | 1/0 |
| name_asc | 5 /30 | 150 | 5.000/4.705 | 6.695 | 7.612 | 8.612 | 8.710 | 150 | 1/0 |
| Category | 5 /30 | 151 | 5.033/5.028 | 5.013 | 6.189 | 6.756 | 7.058 | 151 | 1/0 |
| Search | 5 /30 | 150 | 5.000/4.704 | 3.481 | 3.956 | 4.475 | 5.242 | 150 | 1/0 |
| Dynamic filter | 5 /30 | 150 | 5.000/4.703 | 6.497 | 7.657 | 9.418 | 9.924 | 150 | 1/0 |
| Voice direct | 1 /60 | 61 | 1.017/0.956 | 16.444 | 19.123 | 19.828 | 19.898 | 122 | 1/0 |
| Voice clarification | 0.5flows /60 | 60 | 1.000/0.941 wire RPS | 16.957 | 21.780 | 25.251 | 27.135 | 120 | 1/0 |

Direct Voice alternates cheapest/search;201/result and clarification201→continue201
state transitions checked. Detail identity/nonempty products/status/JSON/shape
checks included. Discovery/setup/health are not counted as measured application
requests; their SQL calls may appear in aggregate query stats.

**Highest stable tested scheduled local read step40RPS**:4800 requests completed,
no drops/errors/restart/exhaustion; whole-run achieved38.158requests/s. No claim
of maximum possible throughput, guaranteed steady wall-clock40RPS, future VPS/
production capacity or SLA. 20RPS soak p99 remains10.414ms, no continuous latency
degradation inferred across aggregate profiles; no per-window p99 trace collected.

Tail caveat: isolated maxima1966.130ms (Read20) and2002.235ms (dashboard) retained,
not hidden. Safe mid-run log audit after Read20:9796 access entries,max server
duration17ms,no entries>100ms; corresponding Read20 top DB query max10.707ms.
Thus its large client-observed tail was outside recorded handler duration; exact
transport/WSL/scheduling cause remains unknown. Dashboard DB aggregate max8.053ms
does not explain its2s client maximum, but no corresponding per-request log was
retained, so do not assert its exact cause. Neither recurred in Read40/soak tails.
No runtime optimization or DB/index change justified by the observed aggregates.

### Sampled resource results

Each cell min/avg/max; CPU Docker percent, memory decimal MB converted from Docker
stats (not process RSS). Periodic samples and final sample, not continuous maxima.

| Profile | API CPU% | API memory MB | DB CPU% | DB memory MB |
| --- | --- | --- | --- | --- |
| Cold | 0/0.562/2.55 | 3.380/7.457/9.003 | 0.02/0.751/6.35 | 33.009/35.848/38.294 |
| Read5 | 0/1.032/3.25 | 8.610/10.328/11.283 | 0/1.480/3.19 | 37.078/38.700/39.867 |
| Read10 | 0/2.126/5.20 | 9.809/11.052/11.912 | 0/2.967/4.41 | 37.864/39.085/39.930 |
| Read20 | 0/3.951/7.77 | 10.305/11.706/12.373 | 0/6.893/8.85 | 38.556/39.760/40.968 |
| Read40 | 0/7.193/10.39 | 10.187/12.067/12.761 | 0/13.174/15.48 | 38.609/39.889/40.758 |
| Soak20 | 0/4.104/7.07 | 11.429/12.360/14.565 | 0/7.206/10.74 | 38.682/39.967/41.618 |
| Dashboard | 0/0.937/2.95 | 11.702/12.634/13.359 | 0/2.244/3.12 | 38.661/39.731/40.936 |
| List | 0/1.277/3.46 | 12.247/12.701/13.359 | 0/2.234/3.41 | 38.713/39.715/40.527 |
| price_desc | 0/1.393/3.47 | 10.643/12.444/13.757 | 0/2.144/2.94 | 38.451/39.368/39.856 |
| name_asc | 0.01/1.519/3.53 | 11.062/12.489/13.443 | 0/2.232/3.19 | 38.850/39.651/40.150 |
| Category | 0/1.773/4.17 | 10.643/12.563/13.306 | 0/1.078/1.55 | 38.682/39.607/40.160 |
| Search | 0/0.996/3.09 | 10.496/12.109/12.520 | 0/0.896/1.33 | 38.514/39.974/40.611 |
| Filter | 0/1.682/3.88 | 11.524/12.348/13.139 | 0/1.628/2.33 | 38.409/39.694/40.213 |
| Voice direct | 0/1.129/3.82 | 10.863/12.120/12.897 | 0/0.881/1.39 | 38.430/39.918/40.968 |
| Voice clarification | 0/0.490/2.63 | 10.496/12.171/13.212 | 0/0.104/1.64 | 38.682/39.741/40.465 |

Soak API start/end/max11.545/12.017/14.565MB; DB40.286/39.584/41.618MB.
No obvious monotonic memory/connection leak; sampled API connections max1/active1
throughout all profiles, below unchanged max4. No API restart during any capacity,
Voice or outage profile. Fresh policy processes intentional and separately bounded.

### Safe query aggregates

Reset pg_stat_statements before each profile; top3 by total time below.
Tuple queryid/calls/mean_ms/max_ms/total_ms/rows. No SQL/search/product/session
values. Remaining top8 raw numeric aggregates stay ignored outside review archive.

| Profile | Top query aggregates |
| --- | --- |
| Cold | -3858156219080729261/26/2.389/4.510/62.123/343; 3298846225061368085/2/3.672/3.883/7.345/2; -5446670030342656795/12/0.509/0.650/6.113/333 |
| Read5 | -3858156219080729261/197/2.341/5.253/461.101/2442; 3298846225061368085/30/3.522/4.004/105.662/30; -5446670030342656795/94/0.476/1.152/44.763/2547 |
| Read10 | -3858156219080729261/783/2.366/10.084/1852.684/9711; 3298846225061368085/120/3.569/7.935/428.243/120; -5446670030342656795/364/0.453/1.150/165.051/9837 |
| Read20 | -3858156219080729261/2343/2.354/10.707/5515.274/29031; 3298846225061368085/360/3.536/6.526/1272.846/360; -5446670030342656795/1084/0.451/1.221/489.393/29277 |
| Read40 | -3858156219080729261/3122/2.339/10.247/7303.706/38667; 3298846225061368085/480/3.513/6.173/1686.083/480; -5446670030342656795/1444/0.454/1.368/655.016/38997 |
| Soak20 | -3858156219080729261/3902/2.442/34.544/9527.612/48327; 3298846225061368085/600/3.664/9.509/2198.621/600; -5446670030342656795/1804/0.461/1.522/832.248/48717 |
| Dashboard | 3298846225061368085/301/3.810/8.053/1146.945/301; -3858156219080729261/2/2.473/4.423/4.946/27; -5446670030342656795/4/0.706/1.069/2.823/117 |
| List | -3858156219080729261/152/4.169/9.933/633.714/3627; -82305348787691305/152/0.125/0.286/18.975/3642; -6845649019159041448/155/0.025/0.073/3.930/155 |
| price_desc | -3352244027736094549/151/4.075/6.501/615.273/3624; -82305348787691305/153/0.123/0.326/18.794/3651; -3858156219080729261/2/2.138/3.906/4.276/27 |
| name_asc | 8914530825696705836/150/4.219/6.091/632.837/3600; -82305348787691305/152/0.125/0.277/18.958/3627; -3858156219080729261/2/2.333/4.225/4.666/27 |
| Category | -3858156219080729261/153/0.441/3.940/67.516/3651; -5446670030342656795/155/0.262/0.524/40.626/3892; -82305348787691305/153/0.124/0.334/19.009/3651 |
| Search | -3858156219080729261/152/1.348/4.068/204.915/327; -82305348787691305/152/0.045/0.122/6.859/327; -6845649019159041448/155/0.024/0.061/3.721/155 |
| Filter | -5446670030342656795/304/0.456/0.849/138.538/8217; -3858156219080729261/152/0.394/3.882/59.839/477; -82305348787691305/152/0.049/0.113/7.420/477 |
| Voice direct | -5446670030342656795/370/0.339/0.862/125.479/9084; -3858156219080729261/63/0.369/4.362/23.278/118; -6845649019159041448/432/0.015/0.153/6.293/432 |
| Voice clarification | -5446670030342656795/334/0.358/1.181/119.521/7857; -3858156219080729261/32/0.466/4.100/14.919/57; -6845649019159041448/395/0.016/0.053/6.261/395 |

Query IDs are local normalized identifiers, not portable operation contracts.
Isolated dashboard identifies3298846225061368085; sorts/list identify their dominant
IDs. No concerning execution-time bottleneck at these steps; no index proposal.

### Policy/outage/privacy — PASS

- General defaults: low request200, burst80 yields only200/429 including429;
  recovery200, same container ID/StartedAt/RestartCount.
- Fresh separate Voice policy process: low complete201, burst12 includes201/429
  only, recovered201, live/ready200, same identity. Source defaults2/4/concurrency4
  not changed and limiter policy is not counted as normal capacity errors.
- Fake Redis stop: catalog/live/ready200; direct fallback201/result; incomplete
  clarification503 (no memory fallback). Same fake restarted; new clarification/
  continue201/result, API unchanged.
- Gemini absent/fallback: approved direct/search/clarification flow PASS, catalog/
  health unaffected. External Gemini latency/capacity **NOT MEASURED**; no provider
  network/status experiment or real keys. Existing accepted unit coverage retained.
- DB stopped: three bounded live200/ready503/catalog500 sequences. Same DB started,
  readiness/catalog200 without API restart. Intentional500 excluded from load rates.
- Privacy marker/exact synthetic coordinates absent from API logs; actual functional
  clarification session IDs checked absent. No raw logs/session/voice/backup values
  persisted in results/report. Generated output contains safe aggregates only.

### Quality, cleanup and archive

Unchanged accepted Go source: prior Part13 full unit/race/vet/pinned staticcheck
PASS retained; real hosted Part12 quality/security evidence retained. No runtime
source changed, so no unnecessary repeated matrix. Current Node helper tests5/5,
syntax checks for all Part13 Node sources, diff check and protected-source diff
PASS. Safe summary helper executed on actual completed results. Full measured
runner exit0. Timer error propagation/cleanup safety preserved.

All exact owned k6/API/fake/PG containers, anonymous volumes and network removed;
existing restore trap cleaned plaintext. Original immutable backup/private keyring
unchanged outside repo. No production/real providers/Railway/VPS/Cloudflare,
deployment, N+1, schema/runtime change, commit/push.

Report/baseline now reflect representative evidence and preserve all blockers.
Permanent production-part-13 archive rebuilt; safe regular unique members, all
source/report byte-match, six runbooks, bounded secret scan and exclusions verified.
No env/key/backup/dump/raw performance/build/test artifacts. Remaining limitations:
historical mapping serializer unavailable (reviewed equivalent proof used), two
rare client tail outliers/whole-run overhead not fully attributed, local shared
hardware only; no external provider, browser/CDN/network/production SLA evidence.

**READY_FOR_EXTERNAL_REVIEW — stop; no commit/push/deploy.**
