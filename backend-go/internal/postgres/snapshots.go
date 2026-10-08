package postgres

import (
	"adilbaga/backend-go/internal/observability"
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrNoPublishedSnapshot = errors.New("no published snapshot")

const latestSnapshotSQL = `SELECT id,"startedAt","publishedAt" FROM public.snapshots
 WHERE status='published' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC,id DESC LIMIT 1`

type Snapshot struct {
	ID          string
	StartedAt   time.Time
	PublishedAt time.Time
}

func (r *Repository) LatestPublishedSnapshot(ctx context.Context) (Snapshot, error) {
	var s Snapshot
	err := r.db.QueryRow(ctx, latestSnapshotSQL).Scan(&s.ID, &s.StartedAt, &s.PublishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, ErrNoPublishedSnapshot
	}
	if err != nil {
		return s, databaseError(err)
	}
	observability.Default.Age("", time.Now(), s.PublishedAt)
	return s, nil
}

// One repeatable-read view protects global canonical metadata as well as the
// selected version's offers. No indefinitely cached pointer or runtime fallback.
func (r *Repository) snapshotReader(ctx context.Context) (*Repository, string, func(), error) {
	starter, ok := r.db.(interface {
		BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error)
	})
	if !ok {
		return nil, "", nil, errors.New("snapshot read transaction unavailable")
	}
	tx, err := starter.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, "", nil, databaseError(err)
	}
	end := func() {
		c, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = tx.Rollback(c)
	}
	reader := NewRepository(tx)
	s, err := reader.LatestPublishedSnapshot(ctx)
	if err != nil {
		end()
		return nil, "", nil, err
	}
	return reader, s.ID, end, nil
}

func (r *Repository) ListRecentPublishedSnapshots(ctx context.Context, limit int) ([]Snapshot, error) {
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid history limit")
	}
	rows, err := r.db.Query(ctx, `SELECT id,"startedAt","publishedAt" FROM public.snapshots WHERE status='published' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC,id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := make([]Snapshot, 0)
	for rows.Next() {
		var s Snapshot
		if err := rows.Scan(&s.ID, &s.StartedAt, &s.PublishedAt); err != nil {
			return nil, databaseError(err)
		}
		out = append(out, s)
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	return out, nil
}

type PriceHistoryEntry struct {
	SnapshotID string
	CapturedAt time.Time
	Price      int
	OldPrice   *int
}

const priceHistorySQL = `SELECT s.id,o."snapshotAt",o.price,o."oldPrice" FROM public.offers o
 JOIN public.snapshots s ON s.id=o."snapshotId" JOIN public.stores st ON st.id=o."storeId"
 WHERE s.status='published' AND s."publishedAt" IS NOT NULL AND o."canonicalProductId"=$1 AND st.code::text=$2
 ORDER BY o."snapshotAt",s."publishedAt",s.id,o.id LIMIT $3`

func (r *Repository) PriceHistory(ctx context.Context, productID, storeCode string, limit int) ([]PriceHistoryEntry, error) {
	if limit < 1 || limit > 1000 {
		return nil, errors.New("invalid history limit")
	}
	rows, err := r.db.Query(ctx, priceHistorySQL, productID, storeCode, limit)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := make([]PriceHistoryEntry, 0)
	for rows.Next() {
		var e PriceHistoryEntry
		if err := rows.Scan(&e.SnapshotID, &e.CapturedAt, &e.Price, &e.OldPrice); err != nil {
			return nil, databaseError(err)
		}
		out = append(out, e)
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	return out, nil
}
