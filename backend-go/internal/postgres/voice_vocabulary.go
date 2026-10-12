package postgres

import (
	"context"

	"adilbaga/backend-go/internal/catalog"
)

// Reuse public category visibility/order exactly; only the selected columns differ.
const voiceVocabularySQL = `SELECT c.id,c.slug,c.name,c."filterSchema" FROM (` + listCategoriesSQL + `) visible
JOIN public.categories c ON c.id=visible.id ORDER BY c.slug ASC`

var _ catalog.VoiceVocabularyRepository = (*Repository)(nil)

// One snapshot read + one metadata query, independent of the category count.
// The transaction ends before NLP; live validation resolves a fresh snapshot.
func (r *Repository) ListVoiceVocabulary(ctx context.Context) (catalog.VoiceVocabulary, error) {
	out := catalog.VoiceVocabulary{Categories: []catalog.Category{}, Schemas: []catalog.FilterSchema{}}
	reader, snapshotID, end, err := r.snapshotReader(ctx)
	if err != nil {
		return out, err
	}
	defer end()
	rows, err := reader.db.Query(ctx, voiceVocabularySQL, snapshotID)
	if err != nil {
		return out, databaseError(err)
	}
	defer rows.Close()
	for rows.Next() {
		var c catalog.Category
		var raw []byte
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &raw); err != nil {
			return catalog.VoiceVocabulary{}, databaseError(err)
		}
		defs := definitions(raw)
		usable := make([]catalog.FilterDefinition, 0, len(defs))
		for _, d := range defs {
			// Empty multi-selects cannot infer a primitive or validate a value.
			if d.Type == "boolean" || len(d.Options) > 0 {
				usable = append(usable, d)
			}
		}
		out.Categories = append(out.Categories, c)
		out.Schemas = append(out.Schemas, catalog.FilterSchema{Category: c.Slug, Filters: usable})
	}
	if rows.Err() != nil {
		return catalog.VoiceVocabulary{}, databaseError(rows.Err())
	}
	return out, nil
}
