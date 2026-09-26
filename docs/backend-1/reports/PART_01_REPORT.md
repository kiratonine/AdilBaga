# Backend 1 — Part 01 report

## A. Repository inspection

At start, the repository contained only `AGENTS.md`, `TODO/PART_01.md`, and the five source-of-truth documents under `docs/`. There was no `backend/`, `package.json`, lockfile, scripts directory, test setup, `.gitignore`, report directory, or `.git` directory. `rtk git status --short --branch` returned `Not a git repository`; branch `feat/backend-1` cannot be confirmed here. Node 20.20.2 and pnpm 10.32.1 were available. This Part created a single NestJS backend package using pnpm.

## B. Implemented

Added a minimal NestJS application with one `/api` global prefix, typed public contracts, three repository interfaces and fixture adapters, and a mock voice transport path. No DB, Gemini, Redis, parser, matching, or store-site dependency is used at runtime.

## C. Changed files

- `.gitignore` — ignores `TODO/`, archive output, env files, dependencies, and generated artifacts.
- `backend/package.json`, `backend/pnpm-lock.yaml`, `backend/tsconfig.json` — pnpm package, build/test/archive commands, strict TypeScript configuration.
- `backend/src/contracts/catalog.ts`, `backend/src/contracts/voice.ts` — category, filter, product, offer, dashboard, and voice shapes.
- `backend/src/repositories.ts`, `backend/src/fixtures/repositories.ts` — repository interfaces/tokens and small mock adapters.
- `backend/src/app.module.ts`, `backend/src/create-app.ts`, `backend/src/main.ts` — Nest wiring, validation, global API prefix, server bootstrap.
- `backend/src/voice/voice-start.dto.ts`, `backend/src/voice/voice.controller.ts`, `backend/src/voice/voice.service.ts` — validated request and isolated deterministic POC response.
- `backend/test/voice-start.test.ts` — one focused HTTP contract test.
- `scripts/create-clean-archive.mjs` — reusable clean review archive creation.
- `docs/backend-1/reports/PART_01_REPORT.md` — this report.

## D. Contracts

`ProductRepository`, `CategoryRepository`, and `DashboardRepository` are application interfaces, with Nest injection tokens separate from their fixture implementations. `ProductCardDto` includes category, nullable image, attributes, `minPrice`, sorted offers with nullable `oldPrice`, and `snapshotAt`. `ProductQuery` describes future search, sort, pagination, and dynamic filters. Voice types cover start, continue, clarification, and result. The only public route implemented in this Part is `POST /api/voice/start`; the other agreed paths are reserved for later Parts. No material source-of-truth contract conflict was found.

## E. Fixtures

One `milk` category, two canonical milk products, and Dina/Dana offers exercise the DTO shapes. One image and one old price are null. The date and prices are illustrative fixture values, not verified Aktau snapshot data. Fixture repositories do not yet implement catalog filtering or sorting; that belongs to Part 02.

## F. Voice POC

Request: `{"text":"найди самое дешевое молоко","latitude":43.6,"longitude":51.1}`. Response: `{"status":"result","mode":"single","speech":"Запрос получен. Голосовой сценарий подключен.","items":[]}`. The service does not interpret the request, select prices/stores, or ask clarifications. Validation rejects blank text, malformed numeric coordinates, and out-of-range coordinates with structured HTTP 400 responses.

Actual local curl after server startup: HTTP 201 with the response above. Invalid curl with blank text and string latitude: HTTP 400 JSON with `statusCode`, `error`, and validation messages. The first two curl attempts ran before the server finished listening and returned connection failure; retries after the port opened passed.

Real iPhone Shortcut status: **NOT RUN**. Manual steps on the demo iPhone:

1. Make the backend reachable from the iPhone on the same network; use the computer's reachable address and open port 3000. The backend listens on `0.0.0.0`; network/firewall reachability is not yet verified.
2. Create Shortcut named `Продукты`: `Dictate Text` → `Get Current Location` → extract its latitude and longitude → `Get Contents of URL` with POST to `http://<reachable-host>:3000/api/voice/start`, JSON body keys `text` (dictated text), `latitude` and `longitude` (numeric values).
3. Read response JSON `speech` → `Speak Text`; optionally pass the same text to `Show Notification` for this transport POC. Run via Siri, including a locked-phone trial. Confirm Siri speaks the response. A real-device PASS must be recorded only after this check.

## G. Clean archive

Script: `scripts/create-clean-archive.mjs`; command: `rtk pnpm archive:clean` from `backend/`. Output: `artifacts/backend-1-part-01-review.tar.gz`. Listing via `rtk proxy tar -tzf artifacts/backend-1-part-01-review.tar.gz` confirms source, docs, package manifest/lockfile, tests and script are present; `.git`, `TODO`, `.env` files, credentials, `node_modules`, `dist`, build/test artifacts, and `artifacts` are absent. `.env.example` is allowed by the script if added later. `rtk proxy` was used because RTK has no dedicated tar listing command.

## H. Validation

- `rtk pnpm install` — **PASS**; pnpm lockfile generated. Registry requests retried after two timeouts and completed.
- `rtk pnpm build` — **PASS**; strict TypeScript compile completed.
- `rtk pnpm test` — **PASS**; one HTTP test passed for `/api/voice/start`.
- `rtk pnpm start` — **PASS**; server listened on `0.0.0.0:3000` after a startup delay.
- `rtk curl -i -X POST http://127.0.0.1:3000/api/voice/start ...` (valid JSON) — **PASS** after startup; HTTP 201, structured JSON, non-empty `speech`.
- Same curl with blank text and malformed latitude — **PASS** after startup; HTTP 400 structured JSON, no crash.
- `rtk pnpm archive:clean` — **PASS**; archive generated.
- `rtk proxy tar -tzf artifacts/backend-1-part-01-review.tar.gz` — **PASS**; full listing inspected for required files and exclusions.

## I. Integration impact

Frontend requires no change. Its documented product category shape is included in the typed DTO. Backend 2 files/schema/migrations were not changed; fixture adapters can later be replaced by a DB adapter behind the same interfaces. The voice start route and request/result shape match the shared contract. The POC does not provide catalog, dashboard, or final Siri behavior.

## J. Remaining issues

- This directory is not a Git repository, so the expected branch and tracked/ignored state cannot be verified with Git. `.gitignore` contains `TODO/` and `artifacts/` rules for when repository metadata is present.
- Real iPhone Siri/Shortcut and phone-to-backend network reachability remain untested.
- Catalog/dashboard endpoints and actual data behavior are outside Part 01.

## K. Status

READY_FOR_EXTERNAL_REVIEW
