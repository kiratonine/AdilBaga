-- LOCAL ONLY: overlay for a nine-visible-category vocabulary comparison.
-- Load after catalog.sql; do not change the shared deterministic fixture.
INSERT INTO categories(id,slug,name,"filterSchema")
SELECT 'voice-'||n,'voice-'||n,'Synthetic category '||n,
'{"filters":[{"key":"weightGrams","label":"Weight","type":"multi-select","options":[1000,2000]}]}'::jsonb
FROM generate_series(1,7) n;
INSERT INTO canonical_products(id,name,"categoryId",attributes)
SELECT 'voice-product-'||n,'Synthetic product '||n,'voice-'||n,'{"weightGrams":1000}'::jsonb
FROM generate_series(1,7) n;
INSERT INTO offers(id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId")
SELECT 'voice-offer-'||n,'voice-product-'||n,'r1','dina',100,true,'2026-10-05 11:00:00','fixture-internal-v1'
FROM generate_series(1,7) n;
