package postgres

import (
	"context"
	"encoding/json"
	"strings"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/observability"
)

// No SQL identifier/expression comes from the caller. Filter keys remain JSONB
// data even after allowlist validation; sort selects trusted static fragments.
const productFilterPrefixSQL = `WITH selected AS (
 SELECT p.id,p.name,p.brand,c.slug,c.name AS category_name,p."imageUrl",p.attributes,
 MIN(o.price) AS min_price,MAX(o."snapshotAt" AT TIME ZONE 'UTC') AS snapshot_at
 FROM public.canonical_products p JOIN public.categories c ON c.id=p."categoryId"
 JOIN public.offers o ON o."canonicalProductId"=p.id AND o."inStock" AND o.price>0
 WHERE o."snapshotId"=$7 AND ($1::text='' OR c.slug=$1) AND NOT EXISTS (SELECT 1 FROM unnest($2::text[]) AS search(pattern)
  WHERE NOT (p.name ILIKE search.pattern ESCAPE E'\\' OR coalesce(p.brand,'') ILIKE search.pattern ESCAPE E'\\'))
 AND NOT EXISTS (SELECT 1 FROM jsonb_each($3::jsonb) f WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(f.value) option WHERE `

// Use PostgreSQL 17's built-in simple Unicode collation for case conversion.
// JSON string extraction and equality keep percent signs and underscores literal.
const productBaseSQL = productFilterPrefixSQL + `CASE WHEN f.key='brand' THEN
   jsonb_typeof(option.value)='string' AND lower(p.brand COLLATE pg_catalog."pg_c_utf8") =
    lower((option.value #>> '{}') COLLATE pg_catalog."pg_c_utf8")
   ELSE option.value=p.attributes->f.key END` + productFilterSuffixSQL

const exactBrandProductSQL = productFilterPrefixSQL + `option.value =
   CASE WHEN f.key='brand' THEN to_jsonb(p.brand) ELSE p.attributes->f.key END` + productFilterSuffixSQL

const productFilterSuffixSQL = `))
 AND ($4::text='' OR p.id=$4)
 GROUP BY p.id,c.slug,c.name)
 SELECT id,name,brand,slug,category_name,"imageUrl",attributes,min_price,snapshot_at FROM selected `
const offersSQL = `SELECT o."canonicalProductId",s.code,s.name,o.price,o."oldPrice"
FROM public.offers o JOIN public.stores s ON s.id=o."storeId"
WHERE o."snapshotId"=$2 AND o."canonicalProductId"=ANY($1::text[]) AND o."inStock" AND o.price>0 ORDER BY o.price ASC`

// Each token is a literal substring; PostgreSQL uses backslash as the
// explicit LIKE escape character. An empty array imposes no restriction.
func searchPatterns(search string) []string {
	tokens := strings.Fields(search)
	patterns := make([]string, 0, len(tokens))
	escape := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	for _, token := range tokens {
		patterns = append(patterns, "%"+escape.Replace(token)+"%")
	}
	return patterns
}

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
func (r *Repository) productFilterSchema(ctx context.Context, category, snapshotID string) (catalog.FilterSchema, error) {
	schema, err := r.filterSchemaAt(ctx, category, snapshotID)
	if err == catalog.ErrNotFound {
		return schema, catalog.ErrInvalidQuery
	}
	return schema, err
}

func (r *Repository) validateFilterValues(q catalog.ProductQuery, schema catalog.FilterSchema) error {
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
			if key == "brand" && !r.exactBrandFilters {
				var brand string
				if found.Type != "multi-select" || json.Unmarshal(v, &brand) != nil || !catalog.BrandAllowed(brand, found.Options) {
					return catalog.ErrInvalidQuery
				}
				continue
			}
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
func normalizeProductQuery(q catalog.ProductQuery) (catalog.ProductQuery, string, error) {
	q.Category = strings.TrimSpace(q.Category)
	q.Search = strings.TrimSpace(q.Search)
	if q.Limit == 0 {
		q.Limit = 24
	}
	if q.Limit < 1 || q.Limit > 100 || q.Offset < 0 || q.Offset > 9007199254740991 {
		return q, "", catalog.ErrInvalidQuery
	}
	order, err := sortSQL(q.Sort)
	return q, order, err
}

func (r *Repository) ListProducts(ctx context.Context, q catalog.ProductQuery) ([]catalog.Product, error) {
	q, order, err := normalizeProductQuery(q)
	if err != nil {
		return nil, err
	}
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return nil, err
	}
	defer end()
	if len(q.Filters) != 0 {
		if q.Category == "" {
			return nil, catalog.ErrInvalidQuery
		}
		schema, err := reader.productFilterSchema(ctx, q.Category, snapshotID)
		if err != nil {
			return nil, err
		}
		if err := reader.validateFilterValues(q, schema); err != nil {
			return nil, err
		}
	}
	return reader.products(ctx, q, order, "", snapshotID)
}

// ListProductsWithFilters obtains effective options and products in one view.
func (r *Repository) ListProductsWithFilters(ctx context.Context, category string, build func(catalog.FilterSchema) (catalog.ProductQuery, error)) ([]catalog.Product, error) {
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return nil, err
	}
	defer end()
	schema, err := reader.productFilterSchema(ctx, category, snapshotID)
	if err != nil {
		return nil, err
	}
	q, err := build(schema)
	if err != nil {
		return nil, err
	}
	q, order, err := normalizeProductQuery(q)
	if err != nil {
		return nil, err
	}
	if q.Category != category {
		return nil, catalog.ErrInvalidQuery
	}
	if err := reader.validateFilterValues(q, schema); err != nil {
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
	query := productBaseSQL
	if r.exactBrandFilters {
		query = exactBrandProductSQL
	}
	rows, err := r.db.Query(observability.WithCatalogPhase(ctx, observability.Products), query+order+` LIMIT $5 OFFSET $6`, q.Category, searchPatterns(q.Search), string(raw), id, q.Limit, q.Offset, snapshotID)
	if err != nil {
		return nil, databaseError(err)
	}
	out := make([]catalog.Product, 0)
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
		out = append(out, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, databaseError(err)
	}
	if err := r.attachOffers(ctx, out, snapshotID); err != nil {
		return nil, err
	}
	return out, nil
}

// attachOffers fills Offers (usable, price ASC) for already selected products of one snapshot.
func (r *Repository) attachOffers(ctx context.Context, out []catalog.Product, snapshotID string) error {
	if len(out) == 0 {
		return nil
	}
	ids := make([]string, 0, len(out))
	indices := make(map[string]int, len(out))
	for i := range out {
		out[i].Offers = make([]catalog.Offer, 0)
		indices[out[i].ID] = i
		ids = append(ids, out[i].ID)
	}
	offers, err := r.db.Query(observability.WithCatalogPhase(ctx, observability.Offers), offersSQL, ids, snapshotID)
	if err != nil {
		return databaseError(err)
	}
	defer offers.Close()
	for offers.Next() {
		var pid string
		var o catalog.Offer
		if err := offers.Scan(&pid, &o.StoreCode, &o.StoreName, &o.Price, &o.OldPrice); err != nil {
			return databaseError(err)
		}
		i := indices[pid]
		out[i].Offers = append(out[i].Offers, o)
	}
	if offers.Err() != nil {
		return databaseError(offers.Err())
	}
	return nil
}
