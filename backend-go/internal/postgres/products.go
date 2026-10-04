package postgres

import (
	"context"
	"encoding/json"
	"strings"

	"adilbaga/backend-go/internal/catalog"
)

// No SQL identifier/expression comes from the caller. Filter keys remain JSONB
// data even after allowlist validation; sort selects trusted static fragments.
const productBaseSQL = `WITH selected AS (
 SELECT p.id,p.name,p.brand,c.slug,c.name AS category_name,p."imageUrl",p.attributes,
 MIN(o.price) AS min_price,MAX(o."snapshotAt" AT TIME ZONE 'UTC') AS snapshot_at
 FROM public.canonical_products p JOIN public.categories c ON c.id=p."categoryId"
 JOIN public.offers o ON o."canonicalProductId"=p.id AND o."inStock" AND o.price>0
 WHERE o."snapshotId"=$7 AND ($1::text='' OR c.slug=$1) AND ($2::text='' OR p.name ILIKE '%'||$2||'%')
 AND NOT EXISTS (SELECT 1 FROM jsonb_each($3::jsonb) f WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(f.value) option WHERE option.value =
   CASE WHEN f.key='brand' THEN to_jsonb(p.brand) ELSE p.attributes->f.key END))
 AND ($4::text='' OR p.id=$4)
 GROUP BY p.id,c.slug,c.name)
 SELECT id,name,brand,slug,category_name,"imageUrl",attributes,min_price,snapshot_at FROM selected `
const offersSQL = `SELECT o."canonicalProductId",s.code,s.name,o.price,o."oldPrice"
FROM public.offers o JOIN public.stores s ON s.id=o."storeId"
WHERE o."snapshotId"=$2 AND o."canonicalProductId"=ANY($1::text[]) AND o."inStock" AND o.price>0 ORDER BY o.price ASC`

func sortSQL(sort catalog.Sort) (string, error) {
	switch sort {
	case "", catalog.PriceAsc:
		return `ORDER BY min_price ASC,id COLLATE "ru-x-icu" ASC`, nil
	case catalog.PriceDesc:
		return `ORDER BY min_price DESC,id COLLATE "ru-x-icu" ASC`, nil
	case catalog.NameAsc:
		return `ORDER BY name COLLATE "ru-x-icu" ASC,id COLLATE "ru-x-icu" ASC`, nil
	default:
		return "", catalog.ErrInvalidQuery
	}
}
func (r *Repository) validateFilters(ctx context.Context, q catalog.ProductQuery, snapshotID string) error {
	if len(q.Filters) == 0 {
		return nil
	}
	if q.Category == "" {
		return catalog.ErrInvalidQuery
	}
	schema, err := r.filterSchemaAt(ctx, q.Category, snapshotID)
	if err != nil {
		if err == catalog.ErrNotFound {
			return catalog.ErrInvalidQuery
		}
		return err
	}
	for key, values := range q.Filters {
		var found *catalog.FilterDefinition
		for i := range schema.Filters {
			if schema.Filters[i].Key == key {
				found = &schema.Filters[i]
				break
			}
		}
		if found == nil || len(values) == 0 {
			return catalog.ErrInvalidQuery
		}
		for _, v := range values {
			if !primitive(v, false) {
				return catalog.ErrInvalidQuery
			}
			if found.Type == "boolean" {
				var b bool
				if json.Unmarshal(v, &b) != nil {
					return catalog.ErrInvalidQuery
				}
				continue
			}
			matches := false
			for _, option := range found.Options {
				if equalPrimitive(v, option) {
					matches = true
					break
				}
			}
			if !matches {
				return catalog.ErrInvalidQuery
			}
		}
	}
	return nil
}
func (r *Repository) ListProducts(ctx context.Context, q catalog.ProductQuery) ([]catalog.Product, error) {
	q.Category = strings.TrimSpace(q.Category)
	q.Search = strings.TrimSpace(q.Search)
	if q.Limit == 0 {
		q.Limit = 24
	}
	if q.Limit < 1 || q.Limit > 100 || q.Offset < 0 || q.Offset > 9007199254740991 {
		return nil, catalog.ErrInvalidQuery
	}
	order, err := sortSQL(q.Sort)
	if err != nil {
		return nil, err
	}
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return nil, err
	}
	defer end()
	if err := reader.validateFilters(ctx, q, snapshotID); err != nil {
		return nil, err
	}
	return reader.products(ctx, q, order, "", snapshotID)
}
func (r *Repository) GetProductByID(ctx context.Context, id string) (catalog.Product, error) {
	if id == "" {
		return catalog.Product{}, catalog.ErrNotFound
	}
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return catalog.Product{}, err
	}
	defer end()
	products, err := reader.products(ctx, catalog.ProductQuery{Limit: 1}, `ORDER BY id COLLATE "ru-x-icu" ASC`, id, snapshotID)
	if err != nil {
		return catalog.Product{}, err
	}
	if len(products) == 0 {
		return catalog.Product{}, catalog.ErrNotFound
	}
	return products[0], nil
}
func (r *Repository) products(ctx context.Context, q catalog.ProductQuery, order, id, snapshotID string) ([]catalog.Product, error) {
	filters := q.Filters
	if filters == nil {
		filters = make(catalog.DynamicFilter)
	}
	raw, err := json.Marshal(filters)
	if err != nil {
		return nil, catalog.ErrInvalidQuery
	}
	rows, err := r.db.Query(ctx, productBaseSQL+order+` LIMIT $5 OFFSET $6`, q.Category, q.Search, string(raw), id, q.Limit, q.Offset, snapshotID)
	if err != nil {
		return nil, databaseError(err)
	}
	out := make([]catalog.Product, 0)
	ids := make([]string, 0)
	indices := make(map[string]int)
	for rows.Next() {
		var p catalog.Product
		var attributes []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.Brand, &p.Category.Slug, &p.Category.Name, &p.ImageURL, &attributes, &p.MinPrice, &p.SnapshotAt); err != nil {
			rows.Close()
			return nil, databaseError(err)
		}
		p.Attributes = scalarAttributes(attributes)
		p.SnapshotAt = p.SnapshotAt.UTC()
		p.Offers = make([]catalog.Offer, 0)
		indices[p.ID] = len(out)
		ids = append(ids, p.ID)
		out = append(out, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, databaseError(err)
	}
	if len(out) == 0 {
		return out, nil
	}
	offers, err := r.db.Query(ctx, offersSQL, ids, snapshotID)
	if err != nil {
		return nil, databaseError(err)
	}
	defer offers.Close()
	for offers.Next() {
		var pid string
		var o catalog.Offer
		if err := offers.Scan(&pid, &o.StoreCode, &o.StoreName, &o.Price, &o.OldPrice); err != nil {
			return nil, databaseError(err)
		}
		i := indices[pid]
		out[i].Offers = append(out[i].Offers, o)
	}
	if offers.Err() != nil {
		return nil, databaseError(offers.Err())
	}
	return out, nil
}
