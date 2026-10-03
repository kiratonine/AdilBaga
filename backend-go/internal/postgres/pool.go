// Package postgres provides read-only connectivity and catalog repositories.
package postgres

import (
	"context"
	"errors"
	"time"

	"adilbaga/backend-go/internal/config"
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
	// Pool creation is lazy: a temporary outage must not prevent liveness.
	pool, err := pgxpool.NewWithConfig(ctx, c)
	if err != nil {
		return nil, errors.New("PostgreSQL pool initialization failed")
	}
	return pool, nil
}
