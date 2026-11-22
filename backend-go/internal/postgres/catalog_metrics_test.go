package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"adilbaga/backend-go/internal/observability"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestCatalogDBReason(t *testing.T) {
	deadline, cancel := context.WithDeadline(t.Context(), time.Now().Add(-time.Second))
	defer cancel()
	client, cancelClient := context.WithCancel(t.Context())
	cancelClient()
	for _, tc := range []struct {
		ctx   context.Context
		stage string
		err   error
		want  string
	}{
		{t.Context(), observability.Discovery, nil, "success"},
		{t.Context(), observability.Discovery, &pgconn.PgError{Code: "57014", Message: "canceling statement due to statement timeout"}, "statement_timeout"},
		{t.Context(), observability.Offers, &pgconn.PgError{Code: "57014", Message: "canceling statement due to user request"}, "sql_cancel"},
		{t.Context(), observability.Products, &pgconn.PgError{Code: "57014", Message: "private-driver-marker"}, "sql_cancel_unknown"},
		{deadline, observability.PoolAcquire, context.DeadlineExceeded, "pool_wait_deadline"},
		{deadline, observability.Products, context.DeadlineExceeded, "request_deadline"},
		{client, observability.Products, context.Canceled, "client_cancel"},
		{client, observability.Products, errors.New("private-driver-marker"), "other"},
		{t.Context(), observability.PoolAcquire, &pgconn.ConnectError{}, "db_unavailable"},
		{t.Context(), observability.Metadata, &pgconn.PgError{Code: "08006"}, "db_unavailable"},
	} {
		if got := catalogDBReason(tc.ctx, tc.stage, tc.err); got != tc.want {
			t.Errorf("stage=%s reason=%s want=%s", tc.stage, got, tc.want)
		}
	}
}
