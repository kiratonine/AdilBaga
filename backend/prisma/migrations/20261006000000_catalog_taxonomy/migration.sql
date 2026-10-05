-- Catalog taxonomy for SCRUM-7. Data-only, idempotent, no DDL.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.categories SET name = 'Молоко и сливки' WHERE slug = 'milk';
UPDATE public.categories SET name = 'Сахар' WHERE slug = 'sugar';

INSERT INTO public.categories (id, slug, name, "filterSchema") VALUES
 ('cat-milk','milk','Молоко и сливки','{"filters":[{"key":"volumeMl","label":"Объём","type":"multi-select"},{"key":"fatPercent","label":"Жирность","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-bread','bread','Хлеб и выпечка','{"filters":[{"key":"weightGrams","label":"Вес","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-eggs','eggs','Яйца','{"filters":[{"key":"packageCount","label":"Количество","type":"multi-select"}]}'),
 ('cat-sugar','sugar','Сахар','{"filters":[{"key":"weightGrams","label":"Вес","type":"multi-select"}]}'),
 ('cat-oil','oil','Растительные масла','{"filters":[{"key":"volumeMl","label":"Объём","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-dairy','dairy','Кисломолочные продукты и сыры','{"filters":[{"key":"fatPercent","label":"Жирность","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-meat','meat','Мясо и птица','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-vegetables','vegetables','Овощи, фрукты, зелень','{"filters":[]}'),
 ('cat-groats','groats','Крупы, макароны, мука','{"filters":[{"key":"weightGrams","label":"Вес","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
