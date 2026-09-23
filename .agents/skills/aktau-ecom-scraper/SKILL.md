---
name: aktau-ecom-scraper
description: >-
  Scrapes and ingests grocery product catalogs from Dina Market, Dana Market, and Fix Price specifically for Aktau, Kazakhstan.
  Use when writing, running, or debugging scrapers, GraphQL queries for Dina, HTML parsers for Dana, or Cloudflare challenge workarounds for Fix Price.
---

# Aktau E-Commerce Grocery Scraper Skill

This skill guides the collection and ingestion of retail grocery data for the city of Aktau, Mangystau, Kazakhstan.

## 1. Dina Market Ingestion (`dinamarket.kz`)

- **Protocol**: GraphQL HTTP POST.
- **Endpoint**: `https://backend.dinamarket.kz/api/v1.1/customer/graph`
- **Aktau Store Verification**:
  - `shop_id: "28"` — Гипермаркет 301 «Дина», Актау, 33 мкр (Акку, 33). Lat: 43.683094, Lon: 51.157194.
  - `shop_id: "30"` — Супермаркет 303 «Дина», ТЦ "Shum", 4 мкр, 74. Lat: 43.637827, Lon: 51.165376.
  - `shop_id: "31"` — Минимаркет 304 «Дина», ТД "Атлант", 4 мкр, 36. Lat: 43.633559, Lon: 51.160610.
  - `shop_id: "44"` — Супермаркет 3201 «Дина», Royal House, 19 мкр, 5. Lat: 43.675328, Lon: 51.155875.
  - `shop_id: "45"` / `47` — 27 мкр, 31/3. Lat: 43.668143, Lon: 51.162442.

### GraphQL Query Example:
```graphql
query getProducts($shopId: ID!, $page: Int, $limit: Int) {
  products(shop_id: $shopId, _page: $page, _limit: $limit) {
    edges {
      id
      xid
      name
      slug
      price
      oldPrice
      price_type
      isWeightProduct
      count_multiplier
      stock {
        amount
      }
    }
  }
}
```

---

## 2. Dana Market Ingestion (`dana-market.kz`)

- **Protocol**: HTTP GET with standard browser User-Agent.
- **Engine**: Cheerio / HTML parsing. Bitrix Aspro template.
- **Catalog Base**: `https://dana-market.kz/catalog/`
- **Key Category Paths**:
  - Milk: `/catalog/produkty_pitaniya_/molochnye_produkty/moloko/`
  - Bread: `/catalog/produkty_pitaniya_/khlebobulochnye_izdeliya/khleb_lepyeshki_/`
  - Eggs: `/catalog/produkty_pitaniya_/molochnye_produkty/yaytsa/`
  - Sugar: `/catalog/produkty_pitaniya_/bakaleya/sakhar_sol/`
  - Oil: `/catalog/produkty_pitaniya_/bakaleya/rasitelnye_masla/`

### HTML Selectors:
- Product card: `div.catalog-block-view__item[data-id]`, `div.catalog_item_wrapp`
- Product ID: `data-id` attribute
- Title: `.item-title a`
- Detail URL: `.item-title a[href]`
- Price: `.price_value` (extract integer digits)
- Image: `.image_wrapper_block img` (take `src` or `data-src`)

---

## 3. Fix Price Ingestion (`fix-price.kz`)

- **Domain**: `https://fix-price.kz/ru/catalog`
- **Protection**: Cloudflare Managed Challenge (returns HTTP 403 on standard scripts).
- **Rule for Hackathon**:
  - Do NOT spend hours attempting to reverse Cloudflare.
  - Use Playwright with real browser session or capture browser network snapshot with Aktau locality selected.
  - Save as fixed snapshot in `data/snapshots/fixprice_aktau.json`.

---

## 4. Ingestion Output Standard
All scrapers must output records adhering to `RawImportedProduct`:
```typescript
interface RawImportedProduct {
  storeCode: 'DINA' | 'DANA' | 'FIX_PRICE';
  sourceProductId: string;
  sourceUrl?: string;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  oldPrice?: number;
  imageUrl?: string;
  rawPayload?: Record<string, unknown>;
}
```
Store these directly into the `RawProduct` table with full `rawPayload` retained for re-processing.
