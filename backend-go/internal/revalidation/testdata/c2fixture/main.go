// Local HTTP fixture oracle only. Reads the same real Go C2Project repository
// into a fixture body; it cannot mint Node custody or perform notification.
package main

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"time"

	"adilbaga/backend-go/internal/postgres"
)

func main() {
	dsn := os.Getenv("C2_PROJECTION_DATABASE_URL")
	u, err := url.Parse(dsn)
	if err != nil || u.User == nil || u.Scheme != "postgres" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") ||
		u.Port() == "" || u.Path != "/part16_c2" || u.User.Username() != "aktau_api_runtime" ||
		u.RawQuery != "sslmode=disable" || u.Fragment != "" || len(os.Args) != 5 {
		os.Exit(2)
	}
	password, _ := u.User.Password()
	if password != "ci-local-only" {
		os.Exit(2)
	}
	request := postgres.C2Request{Phase: postgres.C2PhaseAfter, Snapshot: os.Args[1], Previous: os.Args[2], Witness: os.Args[3], Slug: os.Args[4]}
	if !postgres.C2ValidUUID(request.Snapshot) || !postgres.C2ValidUUID(request.Previous) || request.Snapshot == request.Previous ||
		!postgres.C2ValidID(request.Witness) || !postgres.C2ValidSlug(request.Slug) {
		os.Exit(2)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := postgres.OpenProductionReadOnly(ctx, dsn)
	if err != nil {
		os.Exit(1)
	}
	defer pool.Close()
	state, err := postgres.C2Project(ctx, pool, request)
	if err != nil {
		os.Exit(1)
	}
	if json.NewEncoder(os.Stdout).Encode(state) != nil {
		os.Exit(1)
	}
}
