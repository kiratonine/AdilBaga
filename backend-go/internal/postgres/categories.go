package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"adilbaga/backend-go/internal/catalog"
	"github.com/jackc/pgx/v5"
)

const listCategoriesSQL = `SELECT c.id,c.slug,c.name FROM public.categories c
WHERE EXISTS (SELECT 1 FROM public.canonical_products p
  JOIN public.offers o ON o."canonicalProductId"=p.id
  WHERE p."categoryId"=c.id AND o."snapshotId"=$1 AND o."inStock" AND o.price>0)
ORDER BY c.slug ASC`

// Only categories with a usable offer in the latest published snapshot are public.
func (r *Repository) ListCategories(ctx context.Context) ([]catalog.Category, error) {
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return nil, err
	}
	defer end()
	rows, err := reader.db.Query(ctx, listCategoriesSQL, snapshotID)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := make([]catalog.Category, 0)
	for rows.Next() {
		var c catalog.Category
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name); err != nil {
			return nil, databaseError(err)
		}
		out = append(out, c)
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	return out, nil
}

func definitions(raw []byte) []catalog.FilterDefinition {
	out := make([]catalog.FilterDefinition, 0)
	var schema struct {
		Filters []json.RawMessage `json:"filters"`
	}
	if json.Unmarshal(raw, &schema) != nil {
		return out
	}
	for _, item := range schema.Filters {
		var d struct {
			Key     *string           `json:"key"`
			Label   *string           `json:"label"`
			Type    string            `json:"type"`
			Options []json.RawMessage `json:"options"`
		}
		if json.Unmarshal(item, &d) != nil || d.Key == nil || d.Label == nil {
			continue
		}
		f := catalog.FilterDefinition{Key: *d.Key, Label: *d.Label, Type: d.Type}
		switch d.Type {
		case "boolean":
			out = append(out, f)
		case "multi-select":
			if d.Options == nil {
				continue
			}
			for _, v := range d.Options {
				if primitive(v, false) {
					f.Options = append(f.Options, v)
				}
			}
			out = append(out, f)
		}
	}
	return out
}

const discoverySQL = `SELECT DISTINCT k.key,v.value
FROM public.canonical_products p
CROSS JOIN unnest($2::text[]) AS k(key)
CROSS JOIN LATERAL (SELECT CASE WHEN k.key='brand' THEN to_jsonb(p.brand) ELSE p.attributes->k.key END AS value) v
WHERE p."categoryId"=$1 AND jsonb_typeof(v.value) IN ('string','number','boolean')
AND EXISTS (SELECT 1 FROM public.offers o WHERE o."snapshotId"=$3 AND o."canonicalProductId"=p.id AND o."inStock" AND o.price>0)`

func (r *Repository) GetFilterSchema(ctx context.Context, slug string) (catalog.FilterSchema, error) {
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return catalog.FilterSchema{}, err
	}
	defer end()
	return reader.filterSchemaAt(ctx, slug, snapshotID)
}
func (r *Repository) filterSchemaAt(ctx context.Context, slug, snapshotID string) (catalog.FilterSchema, error) {
	out := catalog.FilterSchema{Category: slug, Filters: make([]catalog.FilterDefinition, 0)}
	var id string
	var raw []byte
	err := r.db.QueryRow(ctx, `SELECT id,"filterSchema" FROM public.categories WHERE slug=$1`, slug).Scan(&id, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, catalog.ErrNotFound
	}
	if err != nil {
		return out, databaseError(err)
	}
	defs := definitions(raw)
	if len(defs) == 0 {
		return out, nil
	}
	keys := make([]string, 0, len(defs))
	for _, d := range defs {
		keys = append(keys, d.Key)
	}
	rows, err := r.db.Query(ctx, discoverySQL, id, keys, snapshotID)
	if err != nil {
		return out, databaseError(err)
	}
	defer rows.Close()
	actual := make(map[string][]json.RawMessage)
	for rows.Next() {
		var key string
		var value []byte
		if err := rows.Scan(&key, &value); err != nil {
			return out, databaseError(err)
		}
		actual[key] = append(actual[key], json.RawMessage(value))
	}
	if rows.Err() != nil {
		return out, databaseError(rows.Err())
	}
	for _, d := range defs {
		if len(actual[d.Key]) == 0 {
			continue
		}
		if d.Type == "boolean" {
			out.Filters = append(out.Filters, d)
			continue
		}
		options := make([]json.RawMessage, 0)
		for _, option := range d.Options {
			for _, v := range actual[d.Key] {
				if equalPrimitive(option, v) {
					options = append(options, option)
					break
				}
			}
		}
		if len(options) > 0 {
			d.Options = options
			out.Filters = append(out.Filters, d)
		}
	}
	return out, nil
}
