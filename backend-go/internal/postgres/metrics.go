package postgres

import (
	"context"
	"errors"
	"strings"
	"time"

	"adilbaga/backend-go/internal/observability"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type queryStarted struct{}
type acquireStarted struct{}
type queryMetrics struct{ registry *observability.Registry }

func (m queryMetrics) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	// Never inspect or retain SQL or arguments, including private initializer SQL.
	return context.WithValue(ctx, queryStarted{}, time.Now())
}
func (m queryMetrics) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	start, ok := ctx.Value(queryStarted{}).(time.Time)
	if !ok {
		return
	}
	class := "success"
	if data.Err != nil {
		class = "failure"
	}
	duration := time.Since(start)
	m.registry.Dependency("db", "query", class, duration)
	if stage := observability.CatalogPhase(ctx); stage != "" {
		observability.RecordCatalogPhase(ctx, stage, catalogDBReason(ctx, stage, data.Err), duration)
	}
}

func (m queryMetrics) TraceAcquireStart(ctx context.Context, _ *pgxpool.Pool, _ pgxpool.TraceAcquireStartData) context.Context {
	if !observability.CatalogRequestActive(ctx) {
		return ctx
	}
	return context.WithValue(ctx, acquireStarted{}, time.Now())
}

func (m queryMetrics) TraceAcquireEnd(ctx context.Context, _ *pgxpool.Pool, data pgxpool.TraceAcquireEndData) {
	if start, ok := ctx.Value(acquireStarted{}).(time.Time); ok {
		observability.RecordCatalogPhase(ctx, observability.PoolAcquire, catalogDBReason(ctx, observability.PoolAcquire, data.Err), time.Since(start))
	}
}

func catalogDBReason(ctx context.Context, stage string, err error) string {
	if err == nil {
		return "success"
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch {
		case pgErr.Code == "57014":
			// Match known PostgreSQL messages locally. Localized or unknown
			// messages retain only the SQLSTATE-derived cancellation class.
			switch pgErr.Message {
			case "canceling statement due to statement timeout":
				return "statement_timeout"
			case "canceling statement due to user request":
				return "sql_cancel"
			default:
				return "sql_cancel_unknown"
			}
		case strings.HasPrefix(pgErr.Code, "08"):
			return "db_unavailable"
		}
	}
	var connectError *pgconn.ConnectError
	switch {
	case errors.As(err, &connectError):
		return "db_unavailable"
	case errors.Is(err, context.DeadlineExceeded) && errors.Is(ctx.Err(), context.DeadlineExceeded):
		if stage == observability.PoolAcquire {
			return "pool_wait_deadline"
		}
		return "request_deadline"
	case errors.Is(err, context.DeadlineExceeded):
		return "db_unavailable"
	case errors.Is(err, context.Canceled) && errors.Is(ctx.Err(), context.Canceled):
		return "client_cancel"
	default:
		return "other"
	}
}
