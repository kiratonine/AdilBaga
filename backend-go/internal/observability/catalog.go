package observability

import (
	"context"
	"sync/atomic"
	"time"
)

const (
	PoolAcquire = "pool_acquire"
	Snapshot    = "snapshot"
	Metadata    = "metadata"
	Discovery   = "discovery"
	Products    = "products"
	Offers      = "offers"
)

type catalogRequestKey struct{}
type catalogPhaseKey struct{}

type CatalogFailure struct {
	Stage    string
	Reason   string
	Duration time.Duration
}

type CatalogRequest struct {
	registry *Registry
	failure  atomic.Pointer[CatalogFailure]
}

func WithCatalogRequest(ctx context.Context, registry *Registry) (context.Context, *CatalogRequest) {
	state := &CatalogRequest{registry: registry}
	return context.WithValue(ctx, catalogRequestKey{}, state), state
}

func (r *CatalogRequest) Failure() (CatalogFailure, bool) {
	if failure := r.failure.Load(); failure != nil {
		return *failure, true
	}
	return CatalogFailure{}, false
}

func CatalogRequestActive(ctx context.Context) bool {
	_, ok := ctx.Value(catalogRequestKey{}).(*CatalogRequest)
	return ok
}

func WithCatalogPhase(ctx context.Context, stage string) context.Context {
	if !CatalogRequestActive(ctx) {
		return ctx
	}
	return context.WithValue(ctx, catalogPhaseKey{}, stage)
}

func CatalogPhase(ctx context.Context) string {
	stage, _ := ctx.Value(catalogPhaseKey{}).(string)
	return stage
}

func RecordCatalogPhase(ctx context.Context, stage, reason string, duration time.Duration) {
	request, ok := ctx.Value(catalogRequestKey{}).(*CatalogRequest)
	if !ok {
		return
	}
	stage = oneOf(stage, PoolAcquire, Snapshot, Metadata, Discovery, Products, Offers)
	reason = oneOf(reason, "success", "statement_timeout", "sql_cancel", "sql_cancel_unknown", "pool_wait_deadline", "request_deadline", "client_cancel", "db_unavailable")
	// BeginTx can propagate an error already captured by the acquire tracer.
	if reason != "success" && !request.failure.CompareAndSwap(nil, &CatalogFailure{Stage: stage, Reason: reason, Duration: duration}) {
		return
	}
	request.registry.observe("catalog_db|"+stage+"|"+reason, reason != "success", duration)
}
