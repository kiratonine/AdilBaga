package postgres

import (
	"adilbaga/backend-go/internal/observability"
	"context"
	"github.com/jackc/pgx/v5"
	"time"
)

type queryStarted struct{}
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
	m.registry.Dependency("db", "query", class, time.Since(start))
}
