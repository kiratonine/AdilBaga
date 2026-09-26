# Targeted eggs data-quality fix — external review

Status: **SNAPSHOT READY FOR REVIEW; LIVE DB NOT UPDATED**.

## Scope and method

Fixed egg-shaped confectionery classification in `NormalizerService`: shared chocolate/confectionery markers now map those products to `confectionery` → public `other`, while chicken/quail eggs remain `eggs`. DINA `/N` package notation is parsed only after `productType=eggs`; ordinary `шт`/`пак` behavior remains unchanged. Added focused matching tests and snapshot audit assertions. Rebuilt `data/snapshots/final_dataset.json` **offline from its existing 863 raw products** using `backend/scripts/rebuild_snapshot_from_raw.ts`; no scraper, seed, migration, pipeline, or live DB write was run.

## Snapshot audit

| Measure | Before | After |
| --- | ---: | ---: |
| Raw products | 863 | 863 |
| Canonical products | 849 | 849 |
| Public `eggs` | 19 | 8 |
| Public `other` | 595 | 606 |
| Confectionery in `eggs` | 11 | 0 |
| Validated cross-store groups | 14 | 14 |

Raw products are byte-equivalent after JSON parsing; `milk` (51), `sugar` (59), and `oil` (48) canonical groups are unchanged. All six approved categories remain populated. Five real DINA egg products remain in `eggs`, including `Яйцо Ramazan Extra/10` and `Яйцо куриное Ақкөл Құс С2/10(...)`, both now `packageCount=10`. DANA quail eggs `20ШТ` remain `packageCount=20`. Chocolate `20г/24` remains in `other` with no egg package count.

Snapshot-derived fixed basket totals are unchanged: DINA **2230 ₸** (568+853+809), DANA **1963 ₸** (560+483+920), FIX_PRICE **2050 ₸** (650+580+820). The existing Siri milk 1 L / 3.2% snapshot audit passed. `backend/prisma/seed.ts` was not edited and still declares 15 StoreLocation entries; the audit suite's older location fixture checks only 12 of them, so it is not a live DB location verification.

## Checks performed

- `rtk pnpm test:matching`: **28/28 PASS**, including six requested confectionery/egg/package regressions and the additional `С2/10(...)` case.
- `rtk pnpm test:audit`: **52/52 PASS**, including zero confectionery eggs, DINA 10-packs, quail 20-pack, six categories, 14 cross-store matches, milk/Siri, and price consistency.
- `rtk pnpm build`: **PASS**.
- `rtk pnpm test`: **17/17 PASS** (fixture-backed Backend 1 API/voice regression; not live Siri/iPhone).
- Initial frozen-lockfile install failed because the pre-existing backend lockfile does not match `package.json` (`tsx`, `dotenv`, `zod`, `@types/node`). Dependencies were installed locally with `rtk proxy pnpm install --no-frozen-lockfile --lockfile=false`; no lockfile change was made. `rtk proxy` was used for raw diagnostic output and to invoke the offline TypeScript rebuild.

## Review/deploy boundary

The working tree already contained an uncommitted frontend merge before this fix; those staged files were preserved. This report and snapshot are for external review only. Supabase still has the previous dataset; a separate approved DB refresh and real HTTP verification will be required before deploy. No commit, push, seed, migration, parser run, or deployment was performed.
