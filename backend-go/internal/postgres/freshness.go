package postgres

import (
	"adilbaga/backend-go/internal/observability"
	"context"
	"time"
)

type SourceFreshness struct {
	StoreCode           string
	LastSuccessfulSync  time.Time
	SnapshotPublishedAt time.Time
}

const freshnessSQL = `WITH current_snapshot AS (
 SELECT id,"publishedAt" FROM public.snapshots
 WHERE status='published' AND "publishedAt" IS NOT NULL
 ORDER BY "publishedAt" DESC,id DESC LIMIT 1
)
 SELECT st.code,sr."capturedAt",s."publishedAt"
 FROM current_snapshot s JOIN public.source_runs sr ON sr."snapshotId"=s.id
 JOIN public.stores st ON st.id=sr."storeId"
 WHERE sr.status='succeeded' AND sr."capturedAt" IS NOT NULL
 ORDER BY st.code`

// Operator/history use only: API role intentionally cannot read source_runs.
func (r *Repository) SourceFreshness(ctx context.Context) ([]SourceFreshness, error) {
	rows, err := r.db.Query(ctx, freshnessSQL)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := make([]SourceFreshness, 0)
	for rows.Next() {
		var f SourceFreshness
		if err := rows.Scan(&f.StoreCode, &f.LastSuccessfulSync, &f.SnapshotPublishedAt); err != nil {
			return nil, databaseError(err)
		}
		out = append(out, f)
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	for _, f := range out {
		observability.Default.Age(f.StoreCode, time.Now(), f.LastSuccessfulSync)
	}
	return out, nil
}
func IsStale(now, lastSuccessfulSync time.Time, maxAge time.Duration) bool {
	return maxAge <= 0 || lastSuccessfulSync.IsZero() || now.Sub(lastSuccessfulSync) > maxAge
}
