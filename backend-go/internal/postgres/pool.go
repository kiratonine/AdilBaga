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
	return openReadOnly(ctx, databaseURL, false)
}

// OpenProductionReadOnly admits only the reviewed API identity on each physical
// connection, including reconnects. Pool creation stays lazy during DB outages.
func OpenProductionReadOnly(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	return openReadOnly(ctx, databaseURL, true)
}

func openReadOnly(ctx context.Context, databaseURL string, production bool) (*pgxpool.Pool, error) {
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
		if err := initializeReadOnlySession(ctx, conn); err != nil {
			return err
		}
		if production {
			return initializeProductionIdentity(ctx, conn)
		}
		return nil
	}
	// Pool creation is lazy: a temporary outage must not prevent liveness.
	pool, err := pgxpool.NewWithConfig(ctx, c)
	if err != nil {
		return nil, errors.New("PostgreSQL pool initialization failed")
	}
	return pool, nil
}

const productionIdentitySQL = `SELECT
 current_user='aktau_api_runtime' AND session_user=current_user
 AND r.rolcanlogin AND r.rolinherit
 AND NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
 AND NOT(g.rolcanlogin OR g.rolsuper OR g.rolcreatedb OR g.rolcreaterole OR g.rolreplication OR g.rolbypassrls)
 AND g.rolinherit AND pg_has_role(r.oid,g.oid,'USAGE')
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=g.oid)
 AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1
 AND EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid AND roleid=g.oid
            AND NOT admin_option AND inherit_option AND NOT set_option)
 AND NOT EXISTS(SELECT 1 FROM pg_roles x WHERE x.oid<>r.oid AND pg_has_role(r.oid,x.oid,'SET'))
 AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner IN (r.oid,g.oid))
 AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner IN (r.oid,g.oid))
 AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datdba IN (r.oid,g.oid))
 FROM pg_roles r JOIN pg_roles g ON g.rolname='aktau_api_reader' WHERE r.rolname=current_user`

func initializeProductionIdentity(ctx context.Context, conn sessionConnection) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var safe bool
	if err := conn.QueryRow(ctx, productionIdentitySQL).Scan(&safe); err != nil || !safe {
		return errors.New("PostgreSQL runtime identity validation failed")
	}
	return nil
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
