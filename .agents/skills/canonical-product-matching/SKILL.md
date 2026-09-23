---
name: canonical-product-matching
description: >-
  Normalizes grocery product data and matches identical SKUs across multiple retail store catalogs.
  Use when writing normalization logic, extracting volume/weight/fat attributes, generating fingerprints, or implementing AI-assisted matching for e-commerce products.
---

# Canonical Product Matching Skill

This skill governs data cleaning, feature extraction, and entity resolution across grocery supermarket datasets.

## 1. Deterministic Normalization Rules

Always apply deterministic cleaning before matching:
1. **Case & Unicode Normalization**:
   - `str.toLowerCase().trim()`
   - Replace `ё` with `е`.
   - Replace commas in numbers with periods (`3,2%` -> `3.2%`, `0,5 л` -> `0.5 л`).
   - Collapse repeated whitespace.
2. **Volume Extraction**:
   - Match `(\d+(?:\.\d+)?)\s*(?:л|l|литр\w*)` -> convert to milliliters (`val * 1000`).
   - Match `(\d+(?:\.\d+)?)\s*(?:мл|ml)` -> keep in milliliters.
3. **Weight Extraction**:
   - Match `(\d+(?:\.\d+)?)\s*(?:кг|kg|килограмм\w*)` -> convert to grams (`val * 1000`).
   - Match `(\d+(?:\.\d+)?)\s*(?:г|g|грамм\w*)` -> keep in grams.
4. **Fat Percentage**:
   - Match `(\d+(?:\.\d+)?)\s*(?:%|процент\w*)` -> store as float (e.g. `3.2`, `2.5`, `6.0`).
5. **Brand Canonicalization Dictionary**:
   - `фудмастер`, `фуд мастер`, `foodmaster`, `food master` -> `FoodMaster`
   - `петропавловское`, `петропавловск` -> `Петропавловское`
   - `айна` -> `Айна`
   - `шедевр` -> `Шедевр`
   - `цесна` -> `Цесна`
   - `кунделик` -> `Күнделік`

---

## 2. Match Candidate Generation

Do NOT run $O(N^2)$ cross comparisons across unrelated products.
1. Group items strictly by category (`milk`, `bread`, `eggs`, `sugar`, `oil`).
2. Require compatible brand: same extracted brand or at least one brand unknown.
3. Require compatible size:
   - Volume: `abs(volA - volB) < 10`
   - Weight: `abs(weightA - weightB) < 10`
   - Fat percentage: `abs(fatA - fatB) < 0.1`

> [!CRITICAL]
> Different sizes are **different SKUs**! A 500ml milk and 1000ml milk must NEVER be matched into the same `CanonicalProduct`.

---

## 3. Fingerprint Generation

Format: `category|normalizedBrand|unitAmount|fatPercent|variant`
Example:
- `milk|foodmaster|1000ml|3.2pct`
- `bread|bekker|450g|rye_sliced`

If two products from different stores share the exact same fingerprint, they are immediately matched with `matchConfidence: 1.0` and `matchMethod: deterministic`.

---

## 4. AI-Assisted Verification (Gemini)

For candidate pairs that share category and brand but differ slightly in naming:

### Prompt Contract:
```text
Compare these two grocery products from Kazakhstan supermarkets:
Product A: "{product_a_name}" (Store: {store_a})
Product B: "{product_b_name}" (Store: {store_b})

Return STRICT JSON only:
{
  "sameProduct": true,
  "confidence": 0.98,
  "reason": "Both are FoodMaster 3.2% ultra-pasteurized milk 1L"
}
```

### Threshold Decision Policy:
- `confidence >= 0.95`: Automatic match -> associate with same `CanonicalProduct`.
- `0.80 <= confidence < 0.95`: Marked as `reviewStatus: pending` for manual inspection.
- `confidence < 0.80`: Reject match -> each product gets its own `CanonicalProduct`.
