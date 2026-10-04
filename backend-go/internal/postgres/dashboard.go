package postgres

import (
	"adilbaga/backend-go/internal/dashboard"
	"context"
	"encoding/json"
)

var _ dashboard.Repository = (*Repository)(nil)

// One roundtrip, final aggregates only. No Product DTO hydration or N+1.
const dashboardSQL = `WITH usable AS MATERIALIZED (
 SELECT p.id,p.name,p."categoryId",p.attributes,o."storeId",o.price,o."snapshotAt"
 FROM public.canonical_products p JOIN public.offers o ON o."canonicalProductId"=p.id
 WHERE o."inStock" AND o.price>0
), aggregates AS (
 SELECT id,name,min(price) min_price,max(price) max_price,
 count(DISTINCT "storeId") chains,max("snapshotAt") snapshot_at
 FROM usable GROUP BY id,name
), spreads AS (
 SELECT id,name,min_price,max_price,
 floor(((max_price-min_price)::float8/min_price)*10000+0.5)/100 difference
 FROM aggregates WHERE chains>=2
), slots(ord,slug,name,key,value) AS (
 VALUES (1,'milk','Молочные продукты','volumeMl','1000'::jsonb),
 (2,'sugar','Сахар и соль','weightGrams','1000'::jsonb),
 (3,'oil','Растительные масла','volumeMl','1000'::jsonb)
), candidates AS (
 SELECT u."storeId",slots.ord,u.id,u.name,u.price,
 row_number() OVER (PARTITION BY u."storeId",slots.ord ORDER BY u.price,u.id COLLATE "C") choice
 FROM usable u JOIN public.categories c ON c.id=u."categoryId"
 JOIN slots ON slots.slug=c.slug AND u.attributes->slots.key=slots.value
), baskets AS (
 SELECT s.code,s.name,sum(coalesce(best.price,0)) total,
 jsonb_agg(jsonb_build_object('categorySlug',slots.slug,'categoryName',slots.name,
 'productId',best.id,'name',best.name,'price',best.price) ORDER BY slots.ord) items
 FROM public.stores s CROSS JOIN slots
 LEFT JOIN candidates best ON best."storeId"=s.id AND best.ord=slots.ord AND best.choice=1
 GROUP BY s.id,s.code,s.name
)
SELECT jsonb_build_object(
 'summary',jsonb_build_object('canonicalProducts',(SELECT count(*) FROM aggregates),
 'stores',(SELECT count(*) FROM public.stores),
 'matchedAcrossStores',(SELECT count(*) FROM spreads),
 'snapshotAt',coalesce((SELECT to_char(max(snapshot_at),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM aggregates),'')),
 'priceSpreads',coalesce((SELECT jsonb_agg(jsonb_build_object('productId',id,'name',name,
 'minPrice',min_price,'maxPrice',max_price,'differencePercent',difference)
 ORDER BY difference DESC,id COLLATE "ru-x-icu") FROM spreads),'[]'::jsonb),
 'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('storeCode',s.code,'storeName',s.name,
 'name',l.name,'address',l.address,'latitude',l.latitude,'longitude',l.longitude)
 ORDER BY s.code,l.name,l.id) FROM public.store_locations l JOIN public.stores s ON s.id=l."storeId"),'[]'::jsonb),
 'baskets',coalesce((SELECT jsonb_agg(jsonb_build_object('storeCode',code,'storeName',name,'total',total,'items',items)
 ORDER BY CASE code WHEN 'DINA' THEN 1 WHEN 'DANA' THEN 2 WHEN 'FIX_PRICE' THEN 3 END)
 FROM baskets),'[]'::jsonb))`

func (r *Repository) GetDashboard(ctx context.Context) (dashboard.Dashboard, error) {
	var result dashboard.Dashboard
	var raw []byte
	if err := r.db.QueryRow(ctx, dashboardSQL).Scan(&raw); err != nil {
		return result, databaseError(err)
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return result, databaseError(err)
	}
	return result, nil
}
