-- Catalog taxonomy for SCRUM-7. Data-only, idempotent, no DDL.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.categories SET name = 'Молоко и сливки' WHERE slug = 'milk';
UPDATE public.categories SET name = 'Прочие товары' WHERE slug = 'other';

INSERT INTO public.categories (id, slug, name, "filterSchema") VALUES
 ('cat-bread','bread','Хлеб и выпечка','{"filters":[{"key":"weightGrams","label":"Вес","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-eggs','eggs','Яйца','{"filters":[{"key":"packageCount","label":"Количество","type":"multi-select"}]}'),
 ('cat-sugar','sugar','Сахар и соль','{"filters":[{"key":"weightGrams","label":"Вес","type":"multi-select"}]}'),
 ('cat-oil','oil','Растительные масла','{"filters":[{"key":"volumeMl","label":"Объём","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-dairy','dairy','Кисломолочные продукты и сыры','{"filters":[{"key":"fatPercent","label":"Жирность","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-meat','meat','Мясо и птица','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-fish','fish','Рыба и морепродукты','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-sausages','sausages','Колбасы и деликатесы','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-vegetables','vegetables','Овощи, фрукты, зелень','{"filters":[]}'),
 ('cat-groats','groats','Крупы, макароны, мука','{"filters":[{"key":"weightGrams","label":"Вес","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-canned','canned','Консервы','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-sauces','sauces','Соусы и специи','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-sweets','sweets','Сладости и снеки','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-tea-coffee','tea-coffee','Чай и кофе','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-drinks','drinks','Напитки и вода','{"filters":[{"key":"volumeMl","label":"Объём","type":"multi-select"},{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-frozen','frozen','Замороженные продукты','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-baby','baby','Детские товары','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-household','household','Бытовая химия','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-hygiene','hygiene','Гигиена и косметика','{"filters":[{"key":"brand","label":"Бренд","type":"multi-select"}]}'),
 ('cat-home','home','Товары для дома','{"filters":[]}')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
