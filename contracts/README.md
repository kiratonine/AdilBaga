# API v1 contract tooling

`openapi.yaml` is the frozen wire-contract source of truth (OpenAPI 3.1.0,
version 1.0.0). See [API_V1_CONTRACT.md](../docs/production/API_V1_CONTRACT.md).
This is a separate pnpm package, not a root workspace or generated SDK.
Use Node 24.10.0 and pnpm 10.32.1. Linter/validators have exact versions and lockfile.

```bash
cd contracts
rtk pnpm install --frozen-lockfile
rtk pnpm lint
rtk pnpm test
```

Offline tests validate seven small stable JSON examples using AJV 2020 + formats,
and enforce selected contract invariants. HTTP tests are skipped without a base URL.
Examples come from the existing explicit backend fixtures, never production dumps.
Fixture addresses are marked demo; coordinates are synthetic, not owner location.
The illustrative session ID is not a usable token. External example files are
linked from OpenAPI and checked by the offline suite.

## Reference/fixture profile

Build the existing backend first. Start it in another terminal WITHOUT loading
the developer `.env` and WITHOUT provider credentials:

```bash
cd backend
DATA_SOURCE=fixture PORT=3001 GEMINI_API_KEY= GEMINI_API_KEY2= GEMINI_API_KEY3= \
UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= rtk proxy node dist/src/main.js
```

Then:

```bash
cd contracts
CONTRACT_API_BASE_URL=http://127.0.0.1:3001 rtk pnpm test:fixture
```

GET tests check schema, examples, pagination, sorting, repeated category-dependent
filters, errors, baskets, minPrice and offer order. Fixture POST tests exercise
direct/list/empty results, coordinate strings, clarification/continue, completed
and unknown opaque sessions and invalid DTOs. No external NLP/Redis/DB needed.
Use this profile against a Go reference server loaded with equivalent fixtures.

## Live read-only profile

Start the current NestJS with its private local env (not fixture). Then:

```bash
cd contracts
CONTRACT_API_BASE_URL=http://127.0.0.1:3000 rtk pnpm test:live
```

This profile issues **GET only**; POST is explicitly prohibited by its helper.
It discovers categories/filter options/product IDs at runtime; no live dataset
count, price, SKU or location is hardcoded. It is reusable against the future Go
server by changing only `CONTRACT_API_BASE_URL`. It never runs SQL, import, seed
or migration. Logs include only test names, schema paths and safe aggregate counts.
Live voice and physical Siri are not claimed by this profile.

429/500/503 envelopes are checked offline. We do not provoke production dependency
failures or claim a live 429 check: rate limiting is not implemented by the reference.
Numeric-string coordinate range is a runtime semantic check (JSON Schema cannot
apply numeric bounds to a string); the string schema documents this limitation.

Redocly recommended rules plus invalid schema/media examples are enabled. The
license rule is disabled because no API license has been selected, not to invent one.
