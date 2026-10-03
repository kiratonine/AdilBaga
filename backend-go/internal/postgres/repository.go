package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"math"

	"adilbaga/backend-go/internal/catalog"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB allows roundtrip counting in tests without a DI framework.
type DB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}
type Repository struct{ db DB }

func NewRepository(db DB) *Repository { return &Repository{db: db} }

var _ catalog.CategoryRepository = (*Repository)(nil)
var _ catalog.ProductRepository = (*Repository)(nil)

// Repository errors never expose SQL parameters, URLs or server error details.
func databaseError(err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "57014" {
		return context.DeadlineExceeded
	}
	return errors.New("catalog database operation failed")
}
func primitive(raw json.RawMessage, allowNull bool) bool {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return false
	}
	switch x := v.(type) {
	case nil:
		return allowNull
	case string, bool:
		return true
	case float64:
		return !math.IsInf(x, 0) && !math.IsNaN(x)
	default:
		return false
	}
}
func equalPrimitive(a, b json.RawMessage) bool {
	var av, bv any
	if json.Unmarshal(a, &av) != nil || json.Unmarshal(b, &bv) != nil || !primitive(a, false) || !primitive(b, false) {
		return false
	}
	return av == bv
}
func scalarAttributes(raw []byte) map[string]json.RawMessage {
	out := make(map[string]json.RawMessage)
	var value map[string]json.RawMessage
	if json.Unmarshal(raw, &value) != nil {
		return out
	}
	for k, v := range value {
		if primitive(v, true) {
			out[k] = v
		}
	}
	return out
}
