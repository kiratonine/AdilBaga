-- CI-only overlay for the ephemeral staging fixture, never shared integration data.
BEGIN;
UPDATE categories
SET "filterSchema" = jsonb_set("filterSchema", '{filters}',
  "filterSchema"->'filters' ||
  '[{"key":"fatPercent","label":"Fat","type":"multi-select","options":[3.2]}]'::jsonb)
WHERE id = 'milk' AND slug = 'milk';

UPDATE canonical_products
SET attributes = jsonb_set(attributes, '{fatPercent}', '3.2'::jsonb)
WHERE id = 'p1' AND "categoryId" = 'milk';

DO $$
BEGIN
  IF (SELECT count(*) FROM categories c,
      jsonb_array_elements(c."filterSchema"->'filters') f
      WHERE c.id = 'milk' AND c.slug = 'milk'
        AND f->>'key' = 'fatPercent'
        AND f->>'type' = 'multi-select'
        AND f->'options' = '[3.2]'::jsonb) <> 1
    OR NOT EXISTS (SELECT 1 FROM canonical_products
      WHERE id = 'p1' AND "categoryId" = 'milk'
        AND attributes->'volumeMl' = '1000'::jsonb
        AND attributes->'fatPercent' = '3.2'::jsonb) THEN
    RAISE EXCEPTION 'CI voice overlay invariant failed';
  END IF;
END $$;
COMMIT;
