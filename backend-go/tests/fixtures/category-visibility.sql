-- Test-only overlay on the disposable part04_fixture catalog; never production.
INSERT INTO categories(id,slug,name) VALUES
('scrum7-z','scrum7-current-z','Current Z'),
('scrum7-a','scrum7-current-a','Current A'),
('scrum7-stale','scrum7-stale','Previous snapshot only'),
('scrum7-out','scrum7-out','Out of stock only'),
('scrum7-zero','scrum7-zero','Zero price only'),
('scrum7-negative','scrum7-negative','Negative price only'),
('scrum7-unpublished','scrum7-unpublished','Unpublished only'),
('scrum7-other','other','Legacy empty other');
INSERT INTO snapshots(id,status,"startedAt","publishedAt") VALUES
('scrum7-old','published','2099-01-01',
 (SELECT "publishedAt"-interval '1 day' FROM snapshots WHERE id='fixture-internal-v1')),
('scrum7-building','building','2099-01-02',NULL);
INSERT INTO raw_products(id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") VALUES
('scrum7-old-raw','dina','scrum7-old','Old',1,'scrum7-old'),
('scrum7-building-raw','dina','scrum7-building','Building',1,'scrum7-building');
INSERT INTO canonical_products(id,name,"categoryId") VALUES
('scrum7-z','Current Z','scrum7-z'),('scrum7-a','Current A','scrum7-a'),
('scrum7-stale','Old','scrum7-stale'),('scrum7-out','Out','scrum7-out'),
('scrum7-zero','Zero','scrum7-zero'),('scrum7-negative','Negative','scrum7-negative'),
('scrum7-unpublished','Building','scrum7-unpublished');
INSERT INTO offers(id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId") VALUES
('scrum7-z','scrum7-z','r1','dina',1,true,'2026-10-01','fixture-internal-v1'),
('scrum7-a','scrum7-a','r1','dina',1,true,'2026-10-01','fixture-internal-v1'),
('scrum7-out','scrum7-out','r1','dina',1,false,'2026-10-01','fixture-internal-v1'),
('scrum7-zero','scrum7-zero','r1','dina',0,true,'2026-10-01','fixture-internal-v1'),
('scrum7-negative','scrum7-negative','r1','dina',-1,true,'2026-10-01','fixture-internal-v1'),
('scrum7-stale','scrum7-stale','scrum7-old-raw','dina',1,true,'2099-01-01','scrum7-old'),
('scrum7-unpublished','scrum7-unpublished','scrum7-building-raw','dina',1,true,'2099-01-02','scrum7-building');
