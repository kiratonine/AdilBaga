---
name: grocery-data-pipeline
description: >-
  Manages PostgreSQL database schemas with Prisma, executes seeds for Aktau store locations, dynamic filter schemas, and produces data quality reports.
  Use when creating or updating Prisma schemas, writing seed scripts, configuring category filters, or generating data quality reports.
---

# Grocery Data Pipeline & Database Management

This skill outlines database schema management, seeding procedures, and data verification for Adil Bağa.

## 1. Prisma Schema Guidelines

File location: `backend/prisma/schema.prisma`
- All primary keys: `@id @default(uuid())` or `@id @default(dbgenerated("gen_random_uuid()"))`.
- Foreign keys: standard Prisma `@relation` fields with explicit foreign key column names.
- Prices: stored as integer tenge (`Int`), never floating point.
- Attributes and payloads: stored as `Json` (PostgreSQL `JSONB`).
- Indexes:
  - `Category(slug)` [unique]
  - `Store(code)` [unique]
  - `CanonicalProduct(categoryId)`
  - `Offer(canonicalProductId)`
  - `Offer(storeId)`
  - `Offer(price)`

---

## 2. StoreLocation Aktau Seed

Coordinates must be strictly within the Aktau urban boundary (~Lat: 43.60-43.72, Lon: 51.10-51.25):

### Verified Dina Locations:
- **Гипермаркет 301 «Дина»**: Актау, мкр. Акку, 33 (43.683094, 51.157194)
- **Супермаркет 303 «Дина» (ТЦ "Shum")**: Актау, 4 мкр., 74 (43.637827, 51.165376)
- **Минимаркет 304 «Дина» (ТД "Атлант")**: Актау, 4 мкр., 36 (43.633559, 51.160610)
- **Супермаркет 3201 «Дина» (Royal House)**: Актау, 19 мкр., 5 (43.675328, 51.155875)
- **Минимаркет 3301 «Дина»**: Актау, 27 мкр., 31/3 (43.668143, 51.162442)

### Verified Dana Locations:
- **Дана Гипермаркет**: Актау, 17 мкр., 1 (43.664200, 51.154100)
- **Дана Супермаркет**: Актау, 14 мкр., 38 (43.649100, 51.158200)
- **Дана 28 мкр**: Актау, 28 мкр., 45 (43.673000, 51.169000)

### Verified Fix Price Locations:
- **Fix Price ТРК «Актау»**: Актау, 16 мкр., 4 (43.655200, 51.164300)
- **Fix Price 28 мкр**: Актау, 28 мкр., 5 (43.671500, 51.171200)

---

## 3. Dynamic Category Filter Schema

Each `Category` record holds `filterSchema` (JSONB) providing metadata for the frontend filter UI and backend validation:

```json
{
  "milk": {
    "filters": [
      {
        "key": "volumeMl",
        "label": "Объём",
        "type": "multi-select",
        "options": [500, 900, 1000]
      },
      {
        "key": "fatPercent",
        "label": "Жирность",
        "type": "multi-select",
        "options": [1.5, 2.5, 3.2, 6.0]
      }
    ]
  },
  "bread": {
    "filters": [
      {
        "key": "breadType",
        "label": "Тип",
        "type": "multi-select",
        "options": ["white", "rye", "baguette", "flatbread"]
      },
      {
        "key": "sliced",
        "label": "Нарезка",
        "type": "boolean"
      }
    ]
  }
}
```

---

## 4. Data Quality Report Standard

After finalizing ingestion, normalization, and matching, produce a summary report:

```text
=== ADIL BAĞA DATA QUALITY REPORT ===
Snapshot Date: <ISO DATE>

Raw Products Ingested:
  - Dina: <count>
  - Dana: <count>
  - Fix Price: <count>
  Total Raw: <count>

Canonical Products Formed: <count>
Total Active Offers: <count>

Multi-Store Overlap:
  - Matched in 2 stores: <count>
  - Matched in 3 stores: <count>
  - Unique to 1 store: <count>

Data Integrity:
  - Missing Images: <count>
  - Unresolved Candidate Pairs: <count>
  - Max Price Discrepancy: <Product Name> (Min: <X> ₸, Max: <Y> ₸, Spread: <Z>%)
=====================================
```
