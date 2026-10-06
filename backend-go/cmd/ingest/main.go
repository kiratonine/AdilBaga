// One-shot prepared bundle ingestion. No scraper, scheduler, queue or API pool.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"math"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/ingestion"
	"adilbaga/backend-go/internal/observability"
	"github.com/jackc/pgx/v5"
)

func run() (resultErr error) {
	start := time.Now()
	mode, phase := "dry_run", "configuration"
	var report ingestion.Report
	logger := observability.New(os.Stderr, "info")
	defer func() {
		class, code := "success", ""
		if resultErr != nil {
			class = "failure"
			code = "ingestion_" + phase + "_failed"
		}
		args := []any{"mode", mode, "phase", phase, "outcome_class", class, "error_code", code, "duration_ms", time.Since(start).Milliseconds(), "raw_count", report.RawCount, "canonical_count", report.CanonicalCount, "reused_count", report.ReusedCanonical, "new_count", report.NewCanonical, "matched_count", report.MatchedAcrossStores}
		if resultErr != nil {
			logger.Error("ingestion_complete", args...)
		} else {
			logger.Info("ingestion_complete", args...)
		}
	}()
	file := flag.String("bundle", "", "prepared bundle path")
	apply := flag.Bool("apply", false, "explicitly stage and publish; default is read-only validation")
	recluster := flag.Bool("recluster", false, "one-time re-matching: resolve canonical merges/splits deterministically")
	flag.Parse()
	if *apply {
		mode = "apply"
	}
	if *file == "" || flag.NArg() != 0 {
		return errors.New("bundle file required")
	}
	appEnv := os.Getenv("APP_ENV")
	if appEnv != "development" && appEnv != "test" && appEnv != "production" {
		return errors.New("APP_ENV invalid")
	}
	if *apply && appEnv == "production" && os.Getenv("INGEST_PRODUCTION_APPLY_CONFIRM") != "1" {
		return errors.New("production ingestion apply not confirmed")
	}
	value := os.Getenv("INGEST_DATABASE_URL")
	if value == "" || config.ValidateDatabaseURL(value) != nil {
		return errors.New("INGEST_DATABASE_URL missing or invalid")
	}
	drop, err := strconv.ParseFloat(os.Getenv("INGEST_MAX_STORE_DROP_PERCENT"), 64)
	if err != nil || math.IsNaN(drop) || math.IsInf(drop, 0) || drop < 0 || drop > 100 {
		return errors.New("INGEST_MAX_STORE_DROP_PERCENT must be explicit in range 0..100")
	}
	input, err := os.Open(*file)
	if err != nil {
		return errors.New("bundle file unavailable")
	}
	defer input.Close()
	phase = "validation"
	bundle, err := ingestion.Decode(input)
	if err != nil {
		return err
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	ctx, deadline := context.WithTimeout(ctx, 5*time.Minute)
	defer deadline()
	phase = "connection"
	conn, err := pgx.Connect(ctx, value)
	if err != nil {
		return errors.New("ingestion connection unavailable")
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = conn.Close(c)
	}()
	// Refuse owner/migration/API credentials, including indirect role escalation.
	var safe bool
	err = conn.QueryRow(ctx, `SELECT rolcanlogin AND rolinherit AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
 AND pg_has_role(current_user,'aktau_ingest_writer','USAGE') AND NOT pg_has_role(current_user,'aktau_ingest_writer','SET')
 AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1
 AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner=r.oid)
 AND NOT has_schema_privilege(current_user,'public','CREATE') FROM pg_roles r WHERE rolname=current_user`).Scan(&safe)
	if err != nil || !safe {
		return errors.New("restricted ingestion credential required")
	}
	if _, err = conn.Exec(ctx, `SET TIME ZONE 'UTC'; SET statement_timeout='30s'; SET lock_timeout='5s'`); err != nil {
		return errors.New("ingestion session policy unavailable")
	}
	if !*apply {
		if _, err = conn.Exec(ctx, `SET default_transaction_read_only=on`); err != nil {
			return errors.New("dry-run read-only policy unavailable")
		}
	}
	engine, err := ingestion.New(conn, drop, *recluster)
	if err != nil {
		return err
	}
	if *apply {
		phase = "staging"
		staged, err := engine.Stage(ctx, bundle)
		if err != nil {
			return err
		}
		defer staged.Close()
		phase = "publication"
		if err = staged.Publish(ctx); err != nil {
			return err
		}
		report = staged.Report
	} else {
		phase = "validation"
		report, err = engine.DryRun(ctx, bundle)
		if err != nil {
			return err
		}
	}
	// Counts/classes only: no source names, payloads, URLs, canonical/session IDs.
	raw, err := json.Marshal(struct {
		Applied bool             `json:"applied"`
		Metrics ingestion.Report `json:"metrics"`
	}{*apply, report})
	if err != nil {
		return errors.New("summary unavailable")
	}
	if _, err = os.Stdout.Write(append(raw, '\n')); err != nil {
		return errors.New("summary unavailable")
	}
	return nil
}
func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}
