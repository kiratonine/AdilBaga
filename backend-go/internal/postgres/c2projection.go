package postgres

import (
	"context"
	"errors"
	"regexp"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"github.com/jackc/pgx/v5"
)

// C2 diagnostics only (Part 16, projection schema v2). One RepeatableRead
// read-only transaction reuses the API SQL text verbatim; nothing here writes,
// opens a public route or changes an existing query.

const (
	C2PhaseBefore = "before-canonical-mutation"
	C2PhaseAfter  = "after-commit"
	// Next sitemap.ts: 50 pages x 100 products, default sort.
	c2SitemapLimit = 5000
	c2CategoryPage = 24
	c2TopDeals     = 8
)

var (
	ErrC2Identity = errors.New("c2 read-only identity rejected")
	ErrC2Chain    = errors.New("c2 snapshot chain mismatch")
	ErrC2Data     = errors.New("c2 projection data invalid")
)

var (
	c2UUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	c2ID   = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)
	c2Slug = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)
	c2ISO  = regexp.MustCompile(`^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$`)
)

func C2ValidUUID(v string) bool { return c2UUID.MatchString(v) }
func C2ValidID(v string) bool   { return c2ID.MatchString(v) }
func C2ValidSlug(v string) bool { return c2Slug.MatchString(v) }

// Effective privileges include direct, PUBLIC and inherited grants. TEMP is
// deliberately not checked: temporary tables cannot change application data.
const c2ReadOnlyACLSQL = `SELECT current_setting('transaction_read_only')='on'
 AND NOT has_database_privilege(current_user,current_database(),'CREATE')
 AND NOT EXISTS (SELECT 1 FROM pg_namespace n
   WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname<>'information_schema'
     AND has_schema_privilege(current_user,n.oid,'CREATE'))
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname<>'information_schema'
     AND c.relkind IN ('r','p','v','m','f')
     AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
          OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES')))
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname<>'information_schema'
     AND c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'UPDATE'))`

type C2Request struct {
	Phase string
	// After only: S1 from the FIFO receipt; S0, witness and slug from BEFORE.
	Snapshot, Previous, Witness, Slug string
}

type C2Candidate struct {
	ID            string  `json:"id"`
	Slug          *string `json:"slug"`
	SnapshotAt    *string `json:"snapshotAt"`
	TopEightIndex *int    `json:"topEightIndex"`
	CategoryIndex *int    `json:"categoryIndex"`
	SitemapIndex  *int    `json:"sitemapIndex"`
}
type C2CategoryPage struct {
	Slug       string   `json:"slug"`
	ProductIDs []string `json:"productIds"`
}
type C2Sitemap struct {
	CategorySlugs []string `json:"categorySlugs"`
	ProductCount  int      `json:"productCount"`
	Truncated     bool     `json:"truncated"`
}
type C2Body struct {
	DashboardAt   string           `json:"dashboardAt"`
	TopEight      []string         `json:"topEight"`
	WitnessID     *string          `json:"witnessId"`
	Candidates    []C2Candidate    `json:"candidates"`
	CategoryPages []C2CategoryPage `json:"categoryPages"`
	Sitemap       C2Sitemap        `json:"sitemap"`
}
type C2State struct {
	SnapshotID         string
	PreviousSnapshotID *string
	Body               C2Body
}

type C2Beginner interface {
	BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error)
}

type c2Row struct {
	slug, snapshotAt string
	index            int
}

// C2Project fails closed: any error yields no state. A missing witness in
// AFTER is data (null fields), not an error; the verdict decides.
func C2Project(ctx context.Context, db C2Beginner, req C2Request) (C2State, error) {
	var state C2State
	if req.Phase != C2PhaseBefore && req.Phase != C2PhaseAfter {
		return state, ErrC2Data
	}
	if req.Phase == C2PhaseAfter && (!C2ValidUUID(req.Snapshot) || !C2ValidUUID(req.Previous) || req.Snapshot == req.Previous || !C2ValidID(req.Witness) || !C2ValidSlug(req.Slug)) {
		return state, ErrC2Data
	}
	tx, err := db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return state, databaseError(err)
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = tx.Rollback(c)
	}()
	var readOnly bool
	if err := tx.QueryRow(ctx, c2ReadOnlyACLSQL).Scan(&readOnly); err != nil {
		return state, databaseError(err)
	}
	if !readOnly {
		return state, ErrC2Identity
	}
	reader := NewRepository(tx)
	chain, err := reader.ListRecentPublishedSnapshots(ctx, 2)
	if err != nil {
		return state, err
	}
	if len(chain) == 0 || !C2ValidUUID(chain[0].ID) {
		return state, ErrC2Chain
	}
	state.SnapshotID = chain[0].ID
	if len(chain) == 2 && C2ValidUUID(chain[1].ID) {
		state.PreviousSnapshotID = &chain[1].ID
	}
	if req.Phase == C2PhaseAfter && (state.SnapshotID != req.Snapshot || state.PreviousSnapshotID == nil || *state.PreviousSnapshotID != req.Previous) {
		return state, ErrC2Chain
	}
	// dashboardSQL picks the latest snapshot itself; inside this RR view that
	// is exactly chain[0].
	dashboard, err := reader.GetDashboard(ctx)
	if err != nil {
		return state, err
	}
	body := &state.Body
	body.DashboardAt = dashboard.Summary.SnapshotAt
	if !c2ISO.MatchString(body.DashboardAt) {
		return state, ErrC2Data
	}
	body.TopEight = []string{}
	for i, spread := range dashboard.PriceSpreads {
		if i == c2TopDeals {
			break
		}
		if !C2ValidID(spread.ProductID) {
			return state, ErrC2Data
		}
		body.TopEight = append(body.TopEight, spread.ProductID)
	}
	if body.Sitemap.CategorySlugs, err = reader.c2Categories(ctx, state.SnapshotID); err != nil {
		return state, err
	}
	rows, count, truncated, err := reader.c2Sitemap(ctx, state.SnapshotID)
	if err != nil {
		return state, err
	}
	body.Sitemap.ProductCount, body.Sitemap.Truncated = count, truncated
	ids := body.TopEight
	if req.Phase == C2PhaseAfter {
		ids = []string{req.Witness}
	}
	body.Candidates = make([]C2Candidate, 0, len(ids))
	for _, id := range ids {
		c := C2Candidate{ID: id}
		for i, top := range body.TopEight {
			if top == id {
				c.TopEightIndex = c2Int(i)
			}
		}
		if row, ok := rows[id]; ok {
			c.Slug, c.SnapshotAt = c2Str(row.slug), c2Str(row.snapshotAt)
			if row.index < count {
				c.SitemapIndex = c2Int(row.index)
			}
		}
		body.Candidates = append(body.Candidates, c)
	}
	slugs := []string{}
	if req.Phase == C2PhaseAfter {
		slugs = append(slugs, req.Slug)
	} else {
		for _, c := range body.Candidates {
			if c.Slug != nil && !c2Contains(slugs, *c.Slug) {
				slugs = append(slugs, *c.Slug)
			}
		}
	}
	body.CategoryPages = make([]C2CategoryPage, 0, len(slugs))
	for _, slug := range slugs {
		page, err := reader.c2CategoryPage(ctx, state.SnapshotID, slug)
		if err != nil {
			return state, err
		}
		body.CategoryPages = append(body.CategoryPages, C2CategoryPage{Slug: slug, ProductIDs: page})
		for i := range body.Candidates {
			c := &body.Candidates[i]
			if c.Slug == nil || *c.Slug != slug {
				continue
			}
			for j, id := range page {
				if id == c.ID {
					c.CategoryIndex = c2Int(j)
				}
			}
		}
	}
	if req.Phase == C2PhaseAfter {
		body.WitnessID = c2Str(req.Witness)
	} else {
		body.WitnessID = C2SelectWitness(*body)
	}
	return state, nil
}

// C2SelectWitness: smallest byte-wise ID among BEFORE candidates qualified on
// all three lists. Pinned for the whole attempt; AFTER never re-selects.
func C2SelectWitness(body C2Body) *string {
	var best *string
	for _, c := range body.Candidates {
		if c.Slug == nil || c.SnapshotAt == nil || c.TopEightIndex == nil || c.CategoryIndex == nil || c.SitemapIndex == nil || !c2Contains(body.Sitemap.CategorySlugs, *c.Slug) {
			continue
		}
		if best == nil || c.ID < *best {
			best = c2Str(c.ID)
		}
	}
	return best
}

func (r *Repository) c2Categories(ctx context.Context, snapshotID string) ([]string, error) {
	rows, err := r.db.Query(ctx, listCategoriesSQL, snapshotID)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id, slug, name string
		if err := rows.Scan(&id, &slug, &name); err != nil {
			return nil, databaseError(err)
		}
		if !C2ValidSlug(slug) || c2Contains(out, slug) || len(out) == 64 {
			return nil, ErrC2Data
		}
		out = append(out, slug)
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	return out, nil
}

// Same text as products(): productBaseSQL + sortSQL + LIMIT/OFFSET, wrapped so
// only identifiers leave the database and offers are never hydrated.
func c2ProductsSQL(columns string) (string, error) {
	order, err := sortSQL(catalog.PriceAsc)
	if err != nil {
		return "", err
	}
	return `SELECT ` + columns + ` FROM (` + productBaseSQL + order + ` LIMIT $5 OFFSET $6) c2_projection`, nil
}

// One bounded query for the whole sitemap traversal: 5001 rows prove whether
// Next stops after 50 full pages. Duplicate IDs or a price inversion fail closed.
func (r *Repository) c2Sitemap(ctx context.Context, snapshotID string) (map[string]c2Row, int, bool, error) {
	query, err := c2ProductsSQL(`id,slug,snapshot_at,min_price`)
	if err != nil {
		return nil, 0, false, err
	}
	rows, err := r.db.Query(ctx, query, "", "", "{}", "", c2SitemapLimit+1, 0, snapshotID)
	if err != nil {
		return nil, 0, false, databaseError(err)
	}
	defer rows.Close()
	out := map[string]c2Row{}
	n, last := 0, -1
	for rows.Next() {
		var id, slug string
		var at time.Time
		var price int
		if err := rows.Scan(&id, &slug, &at, &price); err != nil {
			return nil, 0, false, databaseError(err)
		}
		if _, seen := out[id]; seen || !C2ValidID(id) || !C2ValidSlug(slug) || price < last {
			return nil, 0, false, ErrC2Data
		}
		last = price
		// Byte-identical to httpapi productWire.
		out[id] = c2Row{slug: slug, snapshotAt: at.UTC().Format("2006-01-02T15:04:05.000Z"), index: n}
		n++
	}
	if rows.Err() != nil {
		return nil, 0, false, databaseError(rows.Err())
	}
	if n > c2SitemapLimit {
		return out, c2SitemapLimit, true, nil
	}
	return out, n, false, nil
}

func (r *Repository) c2CategoryPage(ctx context.Context, snapshotID, slug string) ([]string, error) {
	query, err := c2ProductsSQL(`id`)
	if err != nil {
		return nil, err
	}
	rows, err := r.db.Query(ctx, query, slug, "", "{}", "", c2CategoryPage, 0, snapshotID)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, databaseError(err)
		}
		if !C2ValidID(id) || c2Contains(out, id) {
			return nil, ErrC2Data
		}
		out = append(out, id)
	}
	if rows.Err() != nil {
		return nil, databaseError(rows.Err())
	}
	return out, nil
}

func c2Contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
func c2Int(v int) *int       { return &v }
func c2Str(v string) *string { return &v }
