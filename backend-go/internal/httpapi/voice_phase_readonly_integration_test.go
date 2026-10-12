//go:build integration

package httpapi

import (
	"context"
	"os"
	"testing"
	"time"

	"adilbaga/backend-go/internal/gemini"
	"adilbaga/backend-go/internal/postgres"
)

// Explicit opt-in only. Never fall back to DATABASE_URL, owner or ingest env.
// This profile has no DB mutations, provider traffic, Redis or public HTTP.
func TestReadOnlyVoicePhaseProfile(t *testing.T) {
	url := os.Getenv("VOICE_PHASE_READONLY_DATABASE_URL")
	if url == "" || os.Getenv("VOICE_PHASE_READONLY_CONFIRM") != "1" {
		t.Skip("explicit restricted read-only diagnostic inputs absent")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := postgres.OpenProductionReadOnly(ctx, url)
	if err != nil {
		t.Fatal("restricted read-only pool configuration failed")
	}
	defer pool.Close()
	// Ping establishes a physical connection and invokes the unchanged production
	// role/session policy gate. URL/driver errors must not enter diagnostic output.
	if pool.Ping(ctx) != nil {
		t.Fatal("restricted read-only identity/session/authentication gate failed")
	}
	repo := postgres.NewRepository(pool)
	for _, tc := range []struct {
		name    string
		timeout time.Duration
	}{{"fast_local_parser", 0}, {"simulated_8s_provider_timeout", gemini.Timeout}} {
		t.Run(tc.name, func(t *testing.T) {
			trace, status := runVoicePhase(t, context.Background(), repo, repo, repo, tc.timeout)
			if status != 201 && status != 500 && status != 503 {
				t.Fatal("unexpected read-only diagnostic status")
			}
			categories, filters := 0, 0
			for _, event := range trace.events {
				if event.Stage == "category_loading" {
					categories++
				}
				if event.Stage == "filter_schema_discovery" {
					filters++
				}
			}
			if categories != 1 || filters == 0 {
				t.Fatal("incomplete read-only phase evidence")
			}
			// Profile PASS means the observation is complete/privacy-safe, not that
			// status500/503 is acceptable application behavior.
			t.Logf("read_only_phase_observation_complete=true http_status=%d schema_calls=%d", status, filters)
		})
	}
}
