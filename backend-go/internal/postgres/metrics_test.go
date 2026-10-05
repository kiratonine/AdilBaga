package postgres

import (
	"adilbaga/backend-go/internal/observability"
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestQueryMetricsDoNotRetainSQLOrError(t *testing.T) {
	r := observability.NewRegistry()
	tracer := queryMetrics{registry: r}
	for _, err := range []error{nil, errors.New("private-error-879318f1")} {
		ctx := tracer.TraceQueryStart(context.Background(), nil, pgx.TraceQueryStartData{SQL: "private-query-879318f1", Args: []any{"private-argument-879318f1"}})
		tracer.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{Err: err})
	}
	s := r.Snapshot()
	if len(s.Series) != 2 || s.Series["db|query|success"].Count != 1 || s.Series["db|query|failure"].Failures != 1 {
		t.Fatal("query instrumentation mismatch")
	}
}
