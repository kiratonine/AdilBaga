# Performance baseline — local representative Part13

Status: **READY_FOR_EXTERNAL_REVIEW**. Date:2026-10-06.
Immutable runtime source: `b9ef53347c42c35143a9930801d38e030f27bd80`.
Local WSL2 linux/amd64,12 logical CPUs,16,705,351,680 RAM bytes, Docker29.1.3;
Go1.27.1, official k6v2.3.0, PostgreSQL17 Alpine. No extra explicit API/DB CPU/
memory container caps. Shared local environment, **not VPS/production capacity**.

## Representative integrity

Same accepted immutable encrypted Part11 backup, no production access. Two fresh
owned plain PG17 restores exit0 after reviewed empty-public DROP RESTRICT prep.
All10 counts match: stores3,locations15,categories6,raw863,canonical849,mappings863,
offers863,snapshot1,source_runs3,Prisma migrations3. Nine legacy hashes match.
Historical mapping serialization unavailable; legacy hash retained, not changed.
Separately reviewed equivalent binary-safe double-restore pm-audit-v1 matches A/B:

- Count863.
- Non-float fields: `b0250d2f99e88c9e1f29d8a91f9a6f3c`.
- Exact float8send bytes: `00fc971e240d5d0288cf814005767262`.
- Full canonical encoding: `d1f78d4cc4ba26353ba3a440badd56d8`.

Exact expression/version/delimiters in scripts/perf/product-mappings-audit.sql,
README and PART_13_REPORT.md. Three exact migrations/history, application RLS9/
FORCE0,reader6/writer17 policies,published1/succeeded3,SELECT6-only local runtime/
private3 denial PASS. Profiling enabled only after integrity; all hashes/security/
history unchanged after instrumentation and all load.

## Measured profiles

All15 representative profiles exit0; checks100%,unexpected errors/5xx/dropped0,
API restart0. All sampled connection maxima1, pool max4 unchanged. Latency in ms.
Scheduled RPS=requests/configured load seconds. Whole RPS is actual k6 counter rate
over reported whole test duration, including non-load/termination/accounting
overhead; exact decomposition not measured. One extra boundary iteration possible.

| Profile | Offered RPS /seconds | Requests | Scheduled/whole RPS | p50 | p95 | p99 | max |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| Cold smoke | 1 /30 | 31 | 1.033/0.980 | 6.191 | 8.245 | 11.688 | 13.145 |
| Read5 | 5 /60 | 300 | 5.000/4.687 | 5.855 | 7.153 | 8.470 | 9.827 |
| Read10 | 10 /120 | 1201 | 10.008/9.417 | 6.062 | 7.367 | 8.795 | 14.236 |
| Read20 | 20 /180 | 3601 | 20.006/18.809 | 6.047 | 7.169 | 8.273 | 1966.130 |
| Read40 | 40 /120 | 4800 | 40.000/38.158 | 5.847 | 7.055 | 8.133 | 14.007 |
| Soak20 | 20 /300 | 6000 | 20.000/18.832 | 5.905 | 7.730 | 10.414 | 37.089 |
| Dashboard | 5 /60 | 301 | 5.017/4.696 | 5.279 | 7.948 | 10.045 | 2002.235 |
| List price_asc | 5 /30 | 150 | 5.000/4.708 | 6.582 | 8.362 | 11.666 | 13.266 |
| price_desc | 5 /30 | 151 | 5.033/4.736 | 6.538 | 7.568 | 8.723 | 9.522 |
| name_asc | 5 /30 | 150 | 5.000/4.705 | 6.695 | 7.612 | 8.612 | 8.710 |
| Category | 5 /30 | 151 | 5.033/5.028 | 5.013 | 6.189 | 6.756 | 7.058 |
| Search | 5 /30 | 150 | 5.000/4.704 | 3.481 | 3.956 | 4.475 | 5.242 |
| Filter | 5 /30 | 150 | 5.000/4.703 | 6.497 | 7.657 | 9.418 | 9.924 |
| Voice direct | 1 /60 | 61 | 1.017/0.956 | 16.444 | 19.123 | 19.828 | 19.898 |
| Voice clarification | 0.5flows /60 | 60 | 1.000/0.941 wire RPS | 16.957 | 21.780 | 25.251 | 27.135 |

Mixed reads:list30%,search20%,filter15%,detail15%,categories5%,dashboard10%,other
sorts5%,limit24/later pages. Values discovered from actual restored catalog.
Clarification30 complete flows includes start+continue; direct alternates cheapest/
search. Voice max concurrency4, fake Redis only, no Gemini keys.

**Highest stable tested scheduled local step40RPS**, whole-run achieved38.158RPS.
No untested maximum/steady wall-clock40RPS guarantee or production SLA inferred.
Soak6000 requests,p99=10.414ms,no obvious monotonic memory/connection leak.

## Resources and safe query aggregates

CPU avg/max percent; memory avg/max decimal MB, sampled Docker stats not process RSS.
Full min/avg/max,checks and top3 query aggregates for every profile in PART_13_REPORT.md.

| Profile | API CPU% | API memory MB | DB CPU% | DB memory MB |
| --- | --- | --- | --- | --- |
| Cold | 0.562/2.55 | 7.457/9.003 | 0.751/6.35 | 35.848/38.294 |
| Read5 | 1.032/3.25 | 10.328/11.283 | 1.480/3.19 | 38.700/39.867 |
| Read10 | 2.126/5.20 | 11.052/11.912 | 2.967/4.41 | 39.085/39.930 |
| Read20 | 3.951/7.77 | 11.706/12.373 | 6.893/8.85 | 39.760/40.968 |
| Read40 | 7.193/10.39 | 12.067/12.761 | 13.174/15.48 | 39.889/40.758 |
| Soak20 | 4.104/7.07 | 12.360/14.565 | 7.206/10.74 | 39.967/41.618 |
| Dashboard | 0.937/2.95 | 12.634/13.359 | 2.244/3.12 | 39.731/40.936 |
| List | 1.277/3.46 | 12.701/13.359 | 2.234/3.41 | 39.715/40.527 |
| price_desc | 1.393/3.47 | 12.444/13.757 | 2.144/2.94 | 39.368/39.856 |
| name_asc | 1.519/3.53 | 12.489/13.443 | 2.232/3.19 | 39.651/40.150 |
| Category | 1.773/4.17 | 12.563/13.306 | 1.078/1.55 | 39.607/40.160 |
| Search | 0.996/3.09 | 12.109/12.520 | 0.896/1.33 | 39.974/40.611 |
| Filter | 1.682/3.88 | 12.348/13.139 | 1.628/2.33 | 39.694/40.213 |
| Voice direct | 1.129/3.82 | 12.120/12.897 | 0.881/1.39 | 39.918/40.968 |
| Voice clarification | 0.490/2.63 | 12.171/13.212 | 0.104/1.64 | 39.741/40.465 |

Soak API memory start/end/max11.545/12.017/14.565MB;DB40.286/39.584/41.618MB;
connections max total/active1/1. No per-window p99 trace; distributions bounded
across completed aggregate profiles. Dominant mixed-read queryid-3858156219080729261
at40RPS:3122calls/mean2.339ms/max10.247ms/total7303.706ms/38667rows.
Dashboard queryid3298846225061368085:301calls/mean3.810ms/max8.053ms/
total1146.945ms/301rows. No SQL/arguments. No demonstrated runtime/index bottleneck.

## Caveats, policy/outage and provenance

Read20 max1966.130ms and dashboard max2002.235ms retained. Safe mid-run access
audit9796 entries,max handler17ms,no>100ms;Read20 DB max10.707ms. Its outlier is
outside recorded handler duration; exact transport/environment cause unknown.
Dashboard DB max8.053ms does not explain its2s client maximum, but no corresponding
per-request log retained. Read40/soak did not repeat these maxima. Whole-run vs
scheduled-rate overhead is a measurement caveat, not hidden behind nominal RPS.
Do not create an automatic CI performance budget/SLO from this one local run.

General defaults20/40 and Voice2/4/concurrency4:bounded429/recovery PASS. Capacity
overrides explicit/test-only. Fake Redis outage:catalog/live/ready200,direct201,
clarification503;recovery PASS without API restart. Gemini absent fallback PASS;
external Gemini latency/capacity **NOT MEASURED**, no real Upstash.
DB outage live200/ready503/catalog500, same DB/API recovery200 PASS. Privacy exact
markers/functional session IDs absent;post-load fingerprints/security unchanged.
Owned resources/plaintext cleaned, original backup/keyring untouched outside repo.

Tier A shared fixture+CI overlay remains functional only, never substituted for
representative evidence. Real hosted Part12 CI Gate PASS on exact runtime baseline;
all original blockers preserved in PART_13_REPORT.md. Prior full Go unit/race/vet/
staticcheck PASS retained for unchanged runtime;Node5/5/all helper syntax PASS.
No production,real providers,deploy,runtime/default/index changes,commit/push.
STOP for external review.
