// Package postgres provides read-only connectivity and catalog repositories.
package postgres

import (
	"context"
	"errors"
	"time"

	"adilbaga/backend-go/internal/config"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func OpenReadOnly(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	if err := config.ValidateDatabaseURL(databaseURL); err != nil {
		return nil, err
	}
	c, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("DATABASE_URL is invalid")
	}
	c.MaxConns = 4
	c.MinConns = 0
	c.ConnConfig.ConnectTimeout = 2 * time.Second
	c.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	c.ConnConfig.RuntimeParams["statement_timeout"] = "5000"
	// Startup parameters are best effort through a session pooler. Verify the
	// policy on each physical connection before pgxpool can hand it to a caller.
	c.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return initializeReadOnlySession(ctx, conn)
	}
	// Pool creation is lazy: a temporary outage must not prevent liveness.
	pool, err := pgxpool.NewWithConfig(ctx, c)
	if err != nil {
		return nil, errors.New("PostgreSQL pool initialization failed")
	}
	return pool, nil
}

type sessionConnection interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func initializeReadOnlySession(ctx context.Context, conn sessionConnection) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	// Do not wrap driver errors: they may contain private connection details.
	failure := errors.New("PostgreSQL session policy initialization failed")
	if _, err := conn.Exec(ctx, "SET default_transaction_read_only = on; SET statement_timeout = 5000"); err != nil {
		return failure
	}
	var readOnly, timeout string
	if err := conn.QueryRow(ctx, "SHOW default_transaction_read_only").Scan(&readOnly); err != nil {
		return failure
	}
	if err := conn.QueryRow(ctx, "SHOW statement_timeout").Scan(&timeout); err != nil {
		return failure
	}
	duration, err := time.ParseDuration(timeout)
	if readOnly != "on" || err != nil || duration != 5*time.Second {
		return failure
	}
	return nil
}
