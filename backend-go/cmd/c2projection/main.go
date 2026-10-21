// One-shot C2 projection (Part 16, schema v2). Read-only PostgreSQL only: no
// HTTP, no writes, no scheduler. Operator-run, never part of daily sync.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"regexp"
	"time"

	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Set only at build time: -ldflags "-X main.sourceSHA=<40 hex>".
var sourceSHA string

const (
	exitOK       = 0
	exitFailure  = 1
	exitUsage    = 2
	exitIdentity = 3
	exitChain    = 4
)

var (
	hex32 = regexp.MustCompile(`^[0-9a-f]{32}$`)
	hex40 = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

type options struct {
	phase, attempt, frontendSHA       string
	snapshot, previous, witness, slug string
}

type provenance struct {
	Kind             string `json:"kind"`
	EvidenceID       string `json:"evidenceId"`
	CanonicalStateID string `json:"canonicalStateId"`
	SourceSHA        string `json:"sourceSha"`
	FrontendSHA      string `json:"frontendSha"`
	Semantics        string `json:"semantics"`
	SnapshotStatus   string `json:"snapshotStatus"`
	ConsistentRead   bool   `json:"consistentRead"`
}
type projection struct {
	Version            int             `json:"version"`
	Phase              string          `json:"phase"`
	AttemptID          string          `json:"attemptId"`
	SnapshotID         string          `json:"snapshotId"`
	PreviousSnapshotID *string         `json:"previousSnapshotId"`
	Provenance         provenance      `json:"provenance"`
	Body               json.RawMessage `json:"body"`
}

// Strict "-name value" pairs: no "=" forms, no positional arguments, no repeats.
func parse(args []string) (options, bool) {
	var o options
	fields := map[string]*string{"-phase": &o.phase, "-attempt": &o.attempt, "-frontend-sha": &o.frontendSHA,
		"-snapshot": &o.snapshot, "-previous": &o.previous, "-witness": &o.witness, "-slug": &o.slug}
	if len(args)%2 != 0 {
		return o, false
	}
	seen := map[string]bool{}
	for i := 0; i < len(args); i += 2 {
		target, ok := fields[args[i]]
		if !ok || seen[args[i]] {
			return o, false
		}
		seen[args[i]] = true
		*target = args[i+1]
	}
	if !hex32.MatchString(o.attempt) || !hex40.MatchString(o.frontendSHA) {
		return o, false
	}
	after := []string{"-snapshot", "-previous", "-witness", "-slug"}
	switch o.phase {
	case "before", "ready-before":
		for _, name := range after {
			if seen[name] {
				return o, false
			}
		}
		return o, len(args) == 6
	case "after":
		return o, len(args) == 14 && postgres.C2ValidUUID(o.snapshot) && postgres.C2ValidUUID(o.previous) &&
			o.snapshot != o.previous && postgres.C2ValidID(o.witness) && postgres.C2ValidSlug(o.slug)
	}
	return o, false
}

func fail(stderr io.Writer, code int, class string) int {
	_, _ = io.WriteString(stderr, "c2projection_failed:"+class+"\n")
	return code
}

func run(args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	o, ok := parse(args)
	if !ok || !hex40.MatchString(sourceSHA) {
		return fail(stderr, exitUsage, "usage")
	}
	appEnv, dsn := getenv("APP_ENV"), getenv("C2_PROJECTION_DATABASE_URL")
	if (appEnv != "production" && appEnv != "test" && appEnv != "development") || config.ValidateDatabaseURL(dsn) != nil {
		return fail(stderr, exitUsage, "environment")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	open := postgres.OpenReadOnly
	if appEnv == "production" {
		open = postgres.OpenProductionReadOnly
	}
	pool, err := open(ctx, dsn)
	if err != nil {
		return fail(stderr, exitUsage, "environment")
	}
	defer pool.Close()
	// The pool is lazy: Acquire runs AfterConnect (read-only session and, in
	// production, the reviewed runtime identity) on the physical connection.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fail(stderr, exitIdentity, "identity")
	}
	defer conn.Release()
	if conn.Ping(ctx) != nil {
		return fail(stderr, exitIdentity, "identity")
	}
	return emit(ctx, conn, o, stdout, stderr)
}

func emit(ctx context.Context, conn *pgxpool.Conn, o options, stdout, stderr io.Writer) int {
	req := postgres.C2Request{Phase: postgres.C2PhaseBefore}
	if o.phase == "after" {
		req = postgres.C2Request{Phase: postgres.C2PhaseAfter, Snapshot: o.snapshot, Previous: o.previous, Witness: o.witness, Slug: o.slug}
	}
	state, err := postgres.C2Project(ctx, conn, req)
	switch {
	case errors.Is(err, postgres.ErrC2Identity):
		return fail(stderr, exitIdentity, "identity")
	case errors.Is(err, postgres.ErrC2Chain):
		return fail(stderr, exitChain, "chain")
	case errors.Is(err, context.DeadlineExceeded):
		return fail(stderr, exitFailure, "timeout")
	case err != nil:
		return fail(stderr, exitFailure, "projection")
	}
	out, err := document(o, state)
	if o.phase == "ready-before" && err == nil {
		out, err = readyDocument(out, state)
	}
	if err != nil {
		return fail(stderr, exitFailure, "projection")
	}
	// Single write of the complete, validated document; nothing partial.
	if n, err := stdout.Write(out); err != nil || n != len(out) {
		return fail(stderr, exitFailure, "output")
	}
	return exitOK
}

// Private envelope; original v2 projection bytes/body hash are not modified.
func readyDocument(projection []byte, state postgres.C2State) ([]byte, error) {
	if state.PublishedAt.IsZero() || state.PublishedAt.Nanosecond()%int(time.Millisecond) != 0 || !postgres.C2ValidUUID(state.SnapshotID) {
		return nil, errors.New("ready baseline unavailable")
	}
	type baseline struct {
		SnapshotID  string `json:"snapshotId"`
		PublishedAt string `json:"publishedAt"`
	}
	out, err := json.Marshal(struct {
		Projection json.RawMessage `json:"projection"`
		Baseline   baseline        `json:"baseline"`
	}{
		json.RawMessage(bytes.TrimSuffix(projection, []byte{'\n'})), baseline{state.SnapshotID, state.PublishedAt.UTC().Format("2006-01-02T15:04:05.000Z")},
	})
	if err != nil || len(out)+1 >= 16<<10 {
		return nil, errors.New("ready envelope unavailable")
	}
	return append(out, '\n'), nil
}

// canonicalStateId is sha256 over the exact body bytes embedded in the output.
func document(o options, state postgres.C2State) ([]byte, error) {
	body, err := json.Marshal(state.Body)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(body)
	phase, suffix := postgres.C2PhaseBefore, "-before"
	if o.phase == "after" {
		phase, suffix = postgres.C2PhaseAfter, "-after"
	}
	out, err := json.Marshal(projection{Version: 2, Phase: phase, AttemptID: o.attempt, SnapshotID: state.SnapshotID,
		PreviousSnapshotID: state.PreviousSnapshotID, Body: body, Provenance: provenance{
			Kind: "sealed-repository-projection", EvidenceID: o.attempt + suffix, CanonicalStateID: hex.EncodeToString(sum[:]),
			SourceSHA: sourceSHA, FrontendSHA: o.frontendSHA, Semantics: "go-next-c2-v2", SnapshotStatus: "published", ConsistentRead: true}})
	if err != nil || len(out)+1 >= 16<<10 {
		return nil, errors.New("projection output unavailable")
	}
	return append(out, '\n'), nil
}

func main() {
	os.Exit(run(os.Args[1:], os.Getenv, os.Stdout, os.Stderr))
}
