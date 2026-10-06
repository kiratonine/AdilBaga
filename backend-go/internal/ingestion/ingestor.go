package ingestion

import (
	"adilbaga/backend-go/internal/observability"
	"context"
	"encoding/json"
	"errors"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

// Dedicated session connection, never an API read-only pool or Redis lock.
const AdvisoryLockKey int64 = 0x414b54415508

type Ingestor struct {
	conn    *pgx.Conn
	maxDrop float64
	// recluster включает разовую детерминированную политику слияний/разделений canonical
	recluster bool
}

func New(conn *pgx.Conn, maxDrop float64, recluster bool) (*Ingestor, error) {
	if conn == nil || math.IsNaN(maxDrop) || math.IsInf(maxDrop, 0) || maxDrop < 0 || maxDrop > 100 {
		return nil, errors.New("ingestion configuration invalid")
	}
	return &Ingestor{conn: conn, maxDrop: maxDrop, recluster: recluster}, nil
}
func (e *Ingestor) lock(ctx context.Context) error {
	var ok bool
	if e.conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", AdvisoryLockKey).Scan(&ok) != nil {
		return errors.New("ingestion lock unavailable")
	}
	if !ok {
		return errors.New("ingestion already running")
	}
	return nil
}
func (e *Ingestor) unlock() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var released bool
	if e.conn.QueryRow(ctx, "SELECT pg_advisory_unlock($1)", AdvisoryLockKey).Scan(&released) != nil || !released {
		_ = e.conn.Close(ctx)
	}
}

type baseline struct {
	ID          string
	PublishedAt *time.Time
	Counts      map[string]int
	Identities  map[Identity][]string
	Categories  map[string]string
	Stores      map[string]string
}

func (e *Ingestor) baseline(ctx context.Context) (baseline, error) {
	b := baseline{Counts: map[string]int{}, Identities: map[Identity][]string{}, Categories: map[string]string{}, Stores: map[string]string{}}
	var at time.Time
	err := e.conn.QueryRow(ctx, `SELECT id,"publishedAt" FROM snapshots WHERE status='published' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC,id DESC LIMIT 1`).Scan(&b.ID, &at)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return b, errors.New("ingestion baseline unavailable")
	}
	if err == nil {
		b.PublishedAt = &at
	}
	rows, err := e.conn.Query(ctx, `SELECT code::text,id FROM stores`)
	if err != nil {
		return b, errors.New("ingestion stores unavailable")
	}
	for rows.Next() {
		var code, id string
		if rows.Scan(&code, &id) != nil {
			rows.Close()
			return b, errors.New("ingestion stores invalid")
		}
		b.Stores[code] = id
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return b, errors.New("ingestion stores unavailable")
	}
	for _, code := range stores {
		if b.Stores[code] == "" {
			return b, errors.New("required store unavailable")
		}
	}
	rows, err = e.conn.Query(ctx, `SELECT slug,id FROM categories`)
	if err != nil {
		return b, errors.New("ingestion categories unavailable")
	}
	for rows.Next() {
		var slug, id string
		if rows.Scan(&slug, &id) != nil {
			rows.Close()
			return b, errors.New("ingestion categories invalid")
		}
		b.Categories[slug] = id
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return b, errors.New("ingestion categories unavailable")
	}
	if b.ID != "" {
		rows, err = e.conn.Query(ctx, `SELECT st.code::text,r."sourceProductId",m."canonicalProductId" FROM raw_products r JOIN stores st ON st.id=r."storeId" LEFT JOIN product_mappings m ON m."rawProductId"=r.id WHERE r."snapshotId"=$1`, b.ID)
		if err != nil {
			return b, errors.New("ingestion identity baseline unavailable")
		}
		seen := map[Identity]bool{}
		for rows.Next() {
			var key Identity
			var id *string
			if rows.Scan(&key.StoreCode, &key.SourceProductID, &id) != nil {
				rows.Close()
				return b, errors.New("ingestion identity baseline invalid")
			}
			if !seen[key] {
				b.Counts[key.StoreCode]++
				seen[key] = true
			}
			if id != nil {
				b.Identities[key] = append(b.Identities[key], *id)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return b, errors.New("ingestion identity baseline unavailable")
		}
	}
	return b, nil
}

func (e *Ingestor) DryRun(ctx context.Context, b Bundle) (Report, error) {
	start := time.Now()
	report, err := e.dryRun(ctx, b)
	observeIngestion("dry_run", start, err)
	return report, err
}
func observeIngestion(phase string, start time.Time, err error) {
	class := "success"
	if err != nil {
		class = "failure"
	}
	observability.Default.Dependency("ingestion", phase, class, time.Since(start))
}
func (e *Ingestor) dryRun(ctx context.Context, b Bundle) (Report, error) {
	if err := b.Validate(); err != nil {
		return Report{}, err
	}
	if err := e.lock(ctx); err != nil {
		return Report{}, err
	}
	defer e.unlock()
	previous, err := e.baseline(ctx)
	if err != nil {
		return Report{}, err
	}
	_, report, err := resolve(b, previous.Identities, previous.Counts, previous.Categories, e.maxDrop, e.recluster)
	return report, err
}

type Staged struct {
	engine   *Ingestor
	id       string
	previous baseline
	groups   []resolved
	raws     map[Identity]string
	captures map[string]time.Time
	Report   Report
	done     bool
	closed   bool
}

func (s *Staged) SnapshotID() string { return s.id }
func (s *Staged) fail(code string) error {
	s.Report.FailureCode = code
	raw, _ := json.Marshal(s.Report)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := s.engine.conn.Exec(ctx, `UPDATE snapshots SET status='failed',"qualityReport"=$2::jsonb WHERE id=$1 AND status IN ('building','validating')`, s.id, string(raw))
	s.done = true
	if err != nil {
		return errors.New("failed snapshot retention unavailable")
	}
	return errors.New(code)
}

// Abandoning a staged run fails it, never publishes it. Loss of its dedicated
// connection also releases the session lock automatically.
func (s *Staged) Close() {
	if s.closed {
		return
	}
	s.closed = true
	if !s.done {
		_ = s.fail("publication_abandoned")
	}
	s.engine.unlock()
}

func (e *Ingestor) Stage(ctx context.Context, b Bundle) (*Staged, error) {
	start := time.Now()
	staged, err := e.stage(ctx, b)
	observeIngestion("stage", start, err)
	return staged, err
}
func (e *Ingestor) stage(ctx context.Context, b Bundle) (*Staged, error) {
	if err := b.Validate(); err != nil {
		return nil, err
	}
	if err := e.lock(ctx); err != nil {
		return nil, err
	}
	previous, err := e.baseline(ctx)
	if err != nil {
		e.unlock()
		return nil, err
	}
	id, err := opaqueID()
	if err != nil {
		e.unlock()
		return nil, err
	}
	s := &Staged{engine: e, id: id, previous: previous, raws: map[Identity]string{}, captures: map[string]time.Time{}}
	fallback, _ := timestamp(b.GeneratedAt)
	for _, code := range stores {
		s.captures[code] = fallback
	}
	for _, source := range b.Sources {
		s.captures[source.StoreCode], _ = timestamp(source.CapturedAt)
	}
	tx, err := e.conn.Begin(ctx)
	if err != nil {
		e.unlock()
		return nil, errors.New("snapshot staging unavailable")
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = tx.Rollback(c)
	}()
	precision := "legacy-generatedAt"
	if len(b.Sources) > 0 {
		precision = "prepared-source-run"
	}
	sourceMeta, _ := json.Marshal(map[string]any{"captureTimeSource": precision})
	if _, err = tx.Exec(ctx, `INSERT INTO snapshots(id,"sourceStats") VALUES($1,$2::jsonb)`, id, string(sourceMeta)); err != nil {
		e.unlock()
		return nil, errors.New("snapshot staging unavailable")
	}
	counts := map[string]int{}
	for _, p := range b.RawProducts {
		counts[p.StoreCode]++
	}
	for _, code := range stores {
		sourceID, err := opaqueID()
		if err != nil {
			e.unlock()
			return nil, err
		}
		state := "succeeded"
		errorCount := 0
		var summary *string
		for _, input := range b.Sources {
			if input.StoreCode == code {
				errorCount = input.ErrorCount
			}
		}
		if counts[code] == 0 {
			state = "failed"
			errorCount++
			message := "required_source_missing"
			summary = &message
		}
		if _, err = tx.Exec(ctx, `INSERT INTO source_runs(id,"snapshotId","storeId",status,"finishedAt","capturedAt","productCount","errorCount","errorSummary","sourceStats") VALUES($1,$2,$3,$4,timezone('UTC',clock_timestamp()),$5,$6,$7,$8,$9::jsonb)`, sourceID, id, previous.Stores[code], state, s.captures[code], counts[code], errorCount, summary, string(sourceMeta)); err != nil {
			e.unlock()
			return nil, errors.New("source staging unavailable")
		}
	}
	for _, p := range b.RawProducts {
		rawID, err := opaqueID()
		if err != nil {
			e.unlock()
			return nil, err
		}
		payload, err := json.Marshal(p.RawPayload)
		if err != nil {
			e.unlock()
			return nil, reject()
		}
		if _, err = tx.Exec(ctx, `INSERT INTO raw_products(id,"snapshotId","storeId","sourceProductId","sourceUrl","rawName","rawBrand","rawCategory","rawPrice","rawOldPrice","rawImageUrl","rawPayload") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, rawID, id, previous.Stores[p.StoreCode], p.SourceProductID, p.SourceURL, p.Name, p.Brand, p.Category, p.Price, p.OldPrice, p.ImageURL, string(payload)); err != nil {
			e.unlock()
			return nil, errors.New("raw staging unavailable")
		}
		s.raws[p.Identity()] = rawID
	}
	if tx.Commit(ctx) != nil {
		e.unlock()
		return nil, errors.New("snapshot staging unavailable")
	}
	s.groups, s.Report, err = resolve(b, previous.Identities, previous.Counts, previous.Categories, e.maxDrop, e.recluster)
	if err != nil {
		failure := s.fail(s.Report.FailureCode)
		s.Close()
		return nil, failure
	}
	report, _ := json.Marshal(s.Report)
	if _, err = e.conn.Exec(ctx, `UPDATE snapshots SET status='validating',"qualityReport"=$2::jsonb WHERE id=$1`, id, string(report)); err != nil {
		failure := s.fail("snapshot_validation_unavailable")
		s.Close()
		return nil, failure
	}
	return s, nil
}

func (s *Staged) Publish(ctx context.Context) error {
	start := time.Now()
	err := s.publish(ctx)
	observeIngestion("publish", start, err)
	return err
}
func (s *Staged) publish(ctx context.Context) error {
	if s.done || s.closed {
		return errors.New("snapshot not publishable")
	}
	tx, err := s.engine.conn.Begin(ctx)
	if err != nil {
		return s.fail("publication_failed")
	}
	rollback := func() {
		c, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = tx.Rollback(c)
	}
	defer rollback()
	fail := func() error { rollback(); return s.fail("publication_failed") }
	var current string
	err = tx.QueryRow(ctx, `SELECT id FROM snapshots WHERE status='published' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC,id DESC LIMIT 1`).Scan(&current)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fail()
	}
	if current != s.previous.ID {
		return fail()
	}
	for _, v := range s.groups {
		attributes, err := json.Marshal(v.Group.Attributes)
		if err != nil {
			return fail()
		}
		if v.Reused {
			tag, err := tx.Exec(ctx, `UPDATE canonical_products SET name=$2,brand=$3,"categoryId"=$4,"imageUrl"=$5,attributes=$6::jsonb WHERE id=$1`, v.ID, v.Group.Name, v.Group.Brand, s.previous.Categories[v.Group.Category], v.Group.ImageURL, string(attributes))
			if err != nil || tag.RowsAffected() != 1 {
				return fail()
			}
		} else {
			if _, err := tx.Exec(ctx, `INSERT INTO canonical_products(id,name,brand,"categoryId","imageUrl",attributes) VALUES($1,$2,$3,$4,$5,$6::jsonb)`, v.ID, v.Group.Name, v.Group.Brand, s.previous.Categories[v.Group.Category], v.Group.ImageURL, string(attributes)); err != nil {
				return fail()
			}
		}
		for _, m := range v.Group.Members {
			mappingID, err := opaqueID()
			if err != nil {
				return fail()
			}
			offerID, err := opaqueID()
			if err != nil {
				return fail()
			}
			if _, err = tx.Exec(ctx, `INSERT INTO product_mappings(id,"rawProductId","canonicalProductId","matchMethod","matchConfidence","reviewStatus") VALUES($1,$2,$3,$4,$5,$6)`, mappingID, s.raws[m.Raw.Identity()], v.ID, m.Method, *m.Confidence, m.Review); err != nil {
				return fail()
			}
			if _, err = tx.Exec(ctx, `INSERT INTO offers(id,"snapshotId","canonicalProductId","rawProductId","storeId",price,"oldPrice","inStock","snapshotAt") VALUES($1,$2,$3,$4,$5,$6,$7,true,$8)`, offerID, s.id, v.ID, s.raws[m.Raw.Identity()], s.previous.Stores[m.Raw.StoreCode], m.Raw.Price, m.Raw.OldPrice, s.captures[m.Raw.StoreCode]); err != nil {
				return fail()
			}
		}
	}
	tag, err := tx.Exec(ctx, `UPDATE snapshots SET status='published',"publishedAt"=greatest(timezone('UTC',clock_timestamp())::timestamp(3),coalesce($2::timestamp+interval '1 millisecond','-infinity'::timestamp)) WHERE id=$1 AND status='validating'`, s.id, s.previous.PublishedAt)
	if err != nil || tag.RowsAffected() != 1 {
		return fail()
	}
	if tx.Commit(ctx) != nil {
		return s.fail("publication_failed")
	}
	s.done = true
	return nil
}
