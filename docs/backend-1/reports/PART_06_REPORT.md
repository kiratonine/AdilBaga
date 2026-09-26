# Backend 1 Part 06 — final demo hardening

Status: **BLOCKED — external review**, not COMPLETE. Code and Docker integration are verified; two live Gemini keys failed the mandatory smoke, so the Supabase refresh gate was not passed.

## Baseline and scope

- Branch: `integrate/full-stack`.
- HEAD: `d4bef020b3225852557bd13f3000e8d030e257af`.
- Initial working tree: clean; `rtk git fetch origin` succeeded. Existing integration source was preserved; no reset/rebase/merge/commit/push.
- Baseline build PASS and Backend fixture regression 17/17 PASS.
- **Emergency Backend 2 scope takeover authorized by project owner for eggs-only data fix.** No schema/migrations, parser features, matching thresholds, dataset expansion or public DTO changes.

## Eggs fix

The earlier eggs fix was already committed in this baseline. Historical V2 contained 19 eggs, including 11 confectionery rows; the baseline and final snapshot contain **8 real eggs, zero confectionery eggs**. Part 06 additionally puts the egg-specific confectionery guard before dairy detection (so an egg “из молочного шоколада” cannot become `milk`), covers `kidsbox`/`кидсбокс`, and adds the remaining required regression cases. Non-egg category changes were excluded from the final rebuild.

Historical confectionery rows now in `other`:

- Шоколадное яйцо РОБЛОКСЕРЫ Шоки-Токи Двойное яйцо с подарком;
- Шок Яйцо Kinder Surprise (three source rows);
- Шок яйцо Кидсбокс LOL Surprise;
- Шок яйцо МИ-МИ-МИШКИ Десерт с под;
- Шок Яйцо Kinder Joy стандарт;
- KUROMI ШОКИ ТОКИ Двойное яйцо с подарком;
- МИЛАНА ХАМЕТОВА Шоколадное яйцо с подарком;
- Синий Трактор Шоки-Токи яйцо с сюрпризом из молоч.шокол.;
- ТурбоЗавры Шоки-Токи яйцо с сюрпризом из молоч.шокол.

Both real DINA `Extra/10` and `С2/10(...)` have `packageCount=10`; quail `20ШТ` has 20; piece eggs have 1. Confectionery `/24` and `/36` do not become egg package counts. Seed allowlist is now exactly **[1, 10, 20]**, verified against actual attributes and real HTTP filters.

Offline rebuild: `rtk proxy pnpm exec tsx scripts/rebuild_snapshot_from_raw.ts`. No websites were refetched. Raw count **863 → 863**, canonical count **849 → 849**, six populated approved categories, **14 validated cross-store groups**. Final `rawProducts` and `canonicalProducts` were deep-compared to baseline and are identical (only snapshot generation metadata changed). Milk V2/Nemoloko semantics and the 15 seed location definitions are preserved.

## Gemini failover

Configured keys are trimmed, empties skipped, duplicates removed in first-occurrence order: `GEMINI_API_KEY` → `GEMINI_API_KEY2` → `GEMINI_API_KEY3`. Each NLP request starts again with the first configured key. One request body/model/prompt/schema is used for every attempt. A shared abort signal supplies **one 8000 ms overall budget**, not 8000 ms per key. HTTP/network/body/text/JSON failures try the next key while time remains; first valid provider JSON stops the chain. Exhaustion throws only a sanitized error; existing NlpService validation and deterministic fallback remain unchanged.

Seven deterministic failover tests PASS: first/second/third key success, exhaustion with sanitized error plus fallback, key2-only/empty/duplicate configuration, malformed/missing/invalid JSON, and a hung first request exhausting the shared deadline. Same-body/shared-signal and restart-from-key1 assertions are included. No global fetch monkeypatch or real keys in unit tests; Nest DI is unchanged.

Manual `rtk pnpm test:gemini-keys` sent one minimal request per configured key, using the configured model, and printed only names and outcomes:

| Env name | Live result |
| --- | --- |
| GEMINI_API_KEY | **FAIL** |
| GEMINI_API_KEY2 | **PASS** |
| GEMINI_API_KEY3 | **FAIL** |

Utility exited 1. Provider body/error details were not emitted, so a precise quota/network/provider cause is not asserted. No keys were changed, substituted or retried to manufacture PASS. Owner was notified; local `.env` was not edited.

## Disposable Docker PostgreSQL

Container `adilbaga-part06-postgres`, image `postgres:16-alpine`, loopback port 55432. No Docker infrastructure added to repo. Existing migration `20260923000000_init` deployed successfully; no new migration created. Existing seed ran only against this disposable database. After a scope correction, the final snapshot was reseeded locally and verified again.

After validation, the task-owned NestJS process on `:3001` and this Docker container were stopped. The container/database is retained for review; no existing `:3000` process or unrelated container was stopped.

| Entity | Final Docker count | Supabase BEFORE (read-only) |
| --- | ---: | ---: |
| Store | 3 | 3 |
| StoreLocation | 15 | 15 |
| Category | 6 | 6 |
| RawProduct | 863 | 863 |
| CanonicalProduct | 849 | 849 |
| ProductMapping | 863 | 863 |
| Offer | 863 | 863 |
| Products in eggs | 8 | 19 |

Docker `migrate deploy`, `db:seed`, `db:verify`: **PASS**. Real NestJS HTTP at `127.0.0.1:3001`, explicitly PostgreSQL mode (no fixtures):

- Categories: exactly six approved slugs.
- Eggs: eight real products; no chocolate/Kinder/Шоки-Токи/surprise/present items; both DINA 10-packs preserved.
- Eggs filters: `[1,10,20]`; actual product filtering was checked for all three values.
- Milk 1000 ml / 3.2%: actual milk/Nemoloko only; TOP-1 Молоко Мумуня, **627 ₸**.
- Dashboard: 3 stores, 15 locations, 14 cross-store matches, 3 baskets in fixed milk/sugar/oil order.
- Basket totals unchanged: DINA **2230 ₸**, DANA **1963 ₸**, FIX_PRICE **2050 ₸**.
- Voice direct and clarification → continue: real result, `mode=single`, **627 ₸**, address `г. Актау, 4 микрорайон, 74`, Haversine **609 m**, speech present. Existing real Upstash configuration was used. This proves HTTP/session/backend flow, not a successful live Gemini parse for every voice call: provider fallback may handle these requests.

## Supabase gate

Read-only sanity safely confirmed the target is Supabase without emitting URL/password, and recorded the BEFORE counts above. **Controlled live seed: NOT RUN**, because all three key checks were not PASS. Live AFTER counts, post-refresh HTTP and post-refresh voice: **NOT RUN**. Supabase remains on the earlier dataset with 19 eggs. No live migration/db push performed.

## Checks

| Check | Result |
| --- | --- |
| Backend pnpm install | PASS; repaired pre-existing package.json/lockfile mismatch for already-declared dotenv/zod/tsx/@types/node; no new dependency introduced |
| db:generate | PASS (Prisma 5.22.0) |
| Backend build | PASS |
| Matching | **34/34 PASS** |
| Audit | **52/52 PASS** (older location fixture covers 12; actual Docker DB separately verifies all 15) |
| Backend fixture API/voice + failover tests | **24/24 PASS** |
| Frontend typecheck | PASS, Node 24.10.0 |
| oxlint | PASS |
| Frontend mock unit, required threads pool | **FAILED TO START**, twice: worker-response timeout; no tests executed |
| Frontend mock unit, diagnostic forks pool | **77/77 PASS**, 15 files; same Node, maxWorkers=1, no-isolate |
| Frontend build | PASS |
| Real HTTP E2E against final Docker DB | **14/14 PASS**, desktop+iPhone viewports, categories/search/filter/detail/dashboard/map/basket labels |
| Real HTTP E2E against refreshed Supabase | **NOT RUN**, gate blocked |
| git diff --check | PASS |

The Docker E2E used `E2E_API=http VITE_API_BASE_URL=http://127.0.0.1:3001 PW_CHANNEL=chrome` with Node 24.10.0; it is explicitly not the requested post-refresh Supabase `:3000` run. Frontend source and `.env` were not modified. No mocks were used in HTTP E2E. RTK/proxy was used for supported commands and raw diagnostics; shell built-ins were used only for environment setup.

## Changed files / integration impact

- `backend/src/modules/normalization/normalizer.service.ts`, `backend/src/modules/matching/matcher.test.ts`: eggs-only semantic guards/regressions.
- `backend/prisma/seed.ts`: eggs filter allowlist only.
- `data/snapshots/final_dataset.json`: reproducible offline rebuild metadata; raw/canonical data preserved from the already-fixed baseline.
- `backend/src/voice/nlp/gemini-nlp-parser.ts`, `nlp.service.ts`: bounded ordered key failover and updated comment; prompt/schema/business selection unchanged.
- `backend/test/gemini-failover.test.ts`, `voice-start.test.ts`: deterministic failover tests and explicit clearing of all three keys in fixture HTTP tests.
- `backend/scripts/verify_gemini_keys.ts`, `backend/package.json`, `backend/.env.example`: safe opt-in live smoke and additive key placeholders.
- `backend/pnpm-lock.yaml`: synchronized with already-declared dependencies by required install.
- `scripts/create-clean-archive.mjs`: `backend-1-part-06` target.
- This report only; existing Backend 2 reports retained as history.

Public API/DTO unchanged; runtime product/store/price selection stays deterministic in repositories. Gemini remains NLP-only; Upstash remains voice-session-only. No schema, migration, frontend feature or basket composition change.

## Review handoff

Archive: `artifacts/backend-1-part-06-review.tar.gz`; source/docs/tests/current snapshot included, exclusions and absence of actual local env secret values checked.

Remaining blockers: two live Gemini key failures; required Vitest threads pool startup failure (suite passes with forks); Supabase refresh/post-refresh validation pending the gate. Do not deploy based on Docker-only PASS.

Physical Siri rehearsal: **PENDING OWNER**.
Deploy: **NOT RUN**. Commit/push: **NOT RUN**.
