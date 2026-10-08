INSERT INTO stores (id,code,name) VALUES ('dina','DINA','Dina'),('dana','DANA','Dana'),('fix','FIX_PRICE','Fix Price');
INSERT INTO categories (id,slug,name,"filterSchema") VALUES
('milk','milk','Молоко','{"filters":[{"key":"brand","label":"Brand","type":"multi-select","options":["A","B","stale"]},{"key":"volumeMl","label":"Volume","type":"multi-select","options":[500,1000,"1000",999]},{"key":"organic","label":"Organic","type":"boolean"},{"key":"stale","label":"Stale","type":"multi-select","options":[1]},{"key":"broken","label":"Broken","type":"multi-select"}]}'),
('oil','oil','Масло','{"filters":[]}'),('empty','empty','Empty',NULL);
INSERT INTO store_locations(id,"storeId",name,address,latitude,longitude) VALUES
('loc-dina','dina','Fixture Dina','Synthetic fixture address',43.6,51.1),
('loc-dana','dana','Fixture Dana','Synthetic fixture address',43.7,51.2);
INSERT INTO snapshots(id,status,"publishedAt","sourceStats") VALUES ('fixture-internal-v1','published','2026-10-05 11:00:00','{"fixture":true}');
INSERT INTO source_runs(id,"snapshotId","storeId",status,"capturedAt","productCount") VALUES
('fixture-dina','fixture-internal-v1','dina','succeeded','2026-10-05 11:00:00',1),
('fixture-dana','fixture-internal-v1','dana','succeeded','2026-10-04 11:00:00',1),
('fixture-fix','fixture-internal-v1','fix','succeeded','2026-10-04 11:00:00',1);
INSERT INTO raw_products (id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") VALUES
('r1','dina','1','Fixture',100,'fixture-internal-v1'),('r2','dana','2','Fixture',200,'fixture-internal-v1'),('r3','fix','3','Fixture',300,'fixture-internal-v1');
INSERT INTO canonical_products (id,name,brand,"categoryId",attributes) VALUES
('p1','Молоко Альфа','A','milk','{"volumeMl":1000,"organic":true,"nested":{},"nil":null}'),
('p2','МОЛОКО Бета','B','milk','{"volumeMl":500,"organic":false}'),
('p3','Молоко Ёж','A','milk','{"volumeMl":"1000","organic":true}'),
('p4','Масло','A','oil','{"volumeMl":1000}'),
('zero','Нулевая цена','A','milk','{"volumeMl":999}'),
('out','Нет в наличии','stale','milk','{"volumeMl":999}'),
('none','Нет offers','A','milk','{"volumeMl":999}');
INSERT INTO offers (id,"canonicalProductId","rawProductId","storeId",price,"oldPrice","inStock","snapshotAt","snapshotId") VALUES
('o1','p1','r1','dina',120,150,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o2','p1','r2','dana',100,NULL,true,'2026-10-02 11:00:00','fixture-internal-v1'),
('o3','p1','r3','fix',0,NULL,true,'2026-10-04 11:00:00','fixture-internal-v1'),
('o4','p1','r1','dina',1,NULL,false,'2026-10-05 11:00:00','fixture-internal-v1'),
('o5','p2','r1','dina',100,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o6','p3','r2','dana',200,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o7','p4','r3','fix',50,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o8','zero','r1','dina',0,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o9','out','r2','dana',80,NULL,false,'2026-10-01 10:00:00','fixture-internal-v1');
