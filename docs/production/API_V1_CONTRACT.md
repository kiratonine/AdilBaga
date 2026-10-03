# Aktau Market API v1 — frozen reference contract

Source of truth: [contracts/openapi.yaml](../../contracts/openapi.yaml).
Version: **1.0.0**, OpenAPI **3.1.0**. Production Part 02; external review required
before Go implementation. No `/api/v1` prefix and no generated SDK.
Planned origin: `https://api.aktau.market`; public brand remains `Adil Bağa`.

## Endpoints and wire shape

| Method/path | Success | Shape |
| --- | --- | --- |
| GET /api/categories | 200 | Category[]: id, slug, name; slug ASC |
| GET /api/categories/{slug}/filters | 200 | category + filters; multi-select requires nonempty options, boolean does not |
| GET /api/products | 200 | ProductCard[], no total/envelope |
| GET /api/products/{id} | 200 | ProductCard, same shape as list |
| GET /api/dashboard | 200 | summary, priceSpreads, locations, **baskets** |
| POST /api/voice/start | 201 | clarification/result union |
| POST /api/voice/continue | 201 | same union; missing/expired session 404 |

All responses are JSON. Public endpoints are currently anonymous. Category/product
IDs and sessionId are opaque strings; unknown product IDs return 404 even if not
UUID-shaped. No speculative fields or new search/voice text length limits.

ProductCard: id/name/brand/category{slug,name}/imageUrl/attributes/minPrice/offers/
snapshotAt. brand and imageUrl are nullable. Attributes hold string/number/boolean/
null. Each offer has storeCode/storeName/price/oldPrice; oldPrice nullable;
storeCode enum `DINA | DANA | FIX_PRICE`. Only usable in-stock positive-price
offers are exposed, ordered price ASC; minPrice equals their minimum. snapshotAt
is max usable offer snapshotAt (UTC ISO datetime), not request time. RawProduct
fields and Offer.inStock are NOT part of v1. Images are nullable strings, without
a newly invented URL validation requirement.

## Product queries

Public default **limit=24**, range **1..100**, `limit=101` → 400.
Offset defaults 0, range **0..9007199254740991** (`Number.MAX_SAFE_INTEGER`),
matching the reference parser's existing safe-integer check. `offset=9007199254740992`
returns 400; this corrects the schema, not a new runtime bound. Internal repository queries
used by dashboard/voice remain unchanged and may omit limit.
category/search are single trimmed strings; empty means absent; search is a
case-insensitive name substring. Unknown category without dynamic filters → [].
Default sort `price_asc`; also `price_desc`, `name_asc`. Price sorts use minPrice;
ties id ASC. Name sort uses Russian locale-compatible comparison, then id ASC.
Pagination happens after filtering/sorting. Standard query repeats → 400.

Dynamic filters are discovered from `/api/categories/{slug}/filters`; keys are not
globally fixed. FilterDefinition is a discriminated union: multi-select requires
key/label/type=multi-select/options, with a nonempty array of string/number/boolean
options; boolean requires key/label/type=boolean, without mandatory options.
No keys/options are invented by the contract. Repeated URL keys select multiple options:

```text
/api/products?category=milk&volumeMl=500&volumeMl=1000&fatPercent=3.2
```

OR within volumeMl; AND with fatPercent. No JSON/wrapper `filters` parameter.
Values are serialized as strings and parsed using each definition's option types;
booleans `true/false`, numeric options decimal. Unknown keys/options, malformed
values, or dynamic filters without category → 400. Brand is matched separately
against canonical brand, not attributes. Actual keys/options come from the real
schema, not this example. OpenAPI `x-dynamic-filters` describes the protocol.

## Dashboard and analytical baskets

Summary: canonicalProducts/stores/matchedAcrossStores/snapshotAt. Price spreads:
productId/name/minPrice/maxPrice/differencePercent; percentage rounded to two
decimals, DESC then productId ASC. Locations: storeCode/storeName/name/address/
latitude/longitude. No speculative id/category/image/store-name fields.

Required baskets: storeCode/storeName/total/items. Item:
categorySlug/categoryName/productId/name/price. Missing means productId/name/price
all null, not 0. Total sums found prices only. Backend selects the cheapest offer
of the concrete chain. Current fixed configuration milk1l/sugar1kg/oil1l uses
exact attributes and no category fallback; not a user cart/checkout. Slot slugs
remain strings, not a closed schema enum that would bar reviewed future configs.

## Voice

start: nonblank text, latitude/longitude (JSON numbers OR compatible numeric JSON
strings). Explicit Number conversion then finite/range check: latitude ±90,
longitude ±180. continue: opaque nonblank sessionId + nonblank text. Extra request
properties are rejected by the existing validation pipe.

Clarification: status=needs_clarification, sessionId, question, missingFields.
Result: status=result, mode=single|list, speech, items. single ≤1; list ≤3;
zero matches is a successful empty result. Item: name/price/store/address/
distanceMeters/imageUrl; last three nullable. Results ordered by price. Gemini
only interprets NLP; deterministic repositories select prices/products/store,
Haversine selects nearest chain location. Approximate session TTL 10 minutes;
completion deletes it. Missing/expired/completed session →404; session dependency
unavailable →503. Session payloads/coordinates/text must not be logged.

## Errors, compatibility and future Go parity

Envelope: `{statusCode: integer, message: string | string[], error?: string}`.
400 validation and 404 missing resources/session are current; 503 current voice
session failure. 500 compatible internal error, without secrets/stack/provider
payload. 429 is a **reserved compatible envelope**, not implemented rate limiting.
No new error code/requestId field. Reference Cache-Control is not explicitly
configured; framework ETag behavior is not a frozen application cache policy.

Clients ignore unknown additive response fields. Additive evolution still requires
review; removing fields, changing nullability/types/semantics, or narrowing input
needs explicit versioning/review. Do not silently change v1 to simplify Go.
Contract black-box tests are implementation-agnostic via CONTRACT_API_BASE_URL;
fixture profile includes voice, live profile is GET-only. See contracts/README.md.

Frontend Offer.inStock? is retained ONLY as an existing optional mock/SEO consumer
extension used by structured-data tests. It is not returned or guaranteed by v1,
and its presence must not be required. Unused speculative PriceSpread fields and
StoreLocation.id were removed from frontend types. No functional frontend rewrite.
