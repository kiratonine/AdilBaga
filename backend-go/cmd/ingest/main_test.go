package main

import (
	"flag"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPart32ReadyBeforeStageAndBoundRelay(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("main.go"))
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	ready, stage := strings.Index(source, "revalidation.RequestReady("), strings.Index(source, "engine.Stage(")
	if ready < 0 || stage < ready {
		t.Fatal("missing real pre-Stage READY exchange")
	}
	if !strings.Contains(source, "staged.Baseline()") || !strings.Contains(source, "readyTicket.BindBaseline(") {
		t.Fatal("missing locked baseline binding")
	}
}

func TestConfigurationFailureStructuredPrivacy(t *testing.T) {
	oldArgs, oldFlags, oldStderr := os.Args, flag.CommandLine, os.Stderr
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		os.Args, flag.CommandLine, os.Stderr = oldArgs, oldFlags, oldStderr
		_ = r.Close()
		_ = w.Close()
	}()
	os.Args = []string{"ingest", "--bundle", "harmless"}
	flag.CommandLine = flag.NewFlagSet("ingest", flag.ContinueOnError)
	os.Stderr = w
	t.Setenv("APP_ENV", "test")
	const secret = "invalid-private-credential-c7aed213571b7af3"
	t.Setenv("INGEST_DATABASE_URL", secret)
	if run() == nil {
		t.Fatal("missing invalid config failure")
	}
	_ = w.Close()
	raw, _ := io.ReadAll(r)
	if strings.Contains(string(raw), secret) || !strings.Contains(string(raw), `"error_code":"ingestion_configuration_failed"`) || !strings.Contains(string(raw), `"mode":"dry_run"`) {
		t.Fatal("unsafe or missing structured ingestion failure")
	}
}

func TestApplyRevalidationPreflightBeforeConnection(t *testing.T) {
	oldArgs, oldFlags := os.Args, flag.CommandLine
	defer func() { os.Args, flag.CommandLine = oldArgs, oldFlags }()
	t.Setenv("APP_ENV", "test")
	t.Setenv("FRONTEND_REVALIDATE_URL", "")
	t.Setenv("REVALIDATE_HMAC_SECRET", "")
	t.Setenv("INGEST_DATABASE_URL", "invalid-test-only-value")
	for _, apply := range []bool{false, true} {
		os.Args = []string{"ingest", "--bundle", "unused"}
		if apply {
			os.Args = append(os.Args, "--apply")
		}
		flag.CommandLine = flag.NewFlagSet("ingest", flag.ContinueOnError)
		err := run()
		want := "INGEST_DATABASE_URL missing or invalid"
		if apply {
			want = "revalidation configuration invalid"
		}
		if err == nil || err.Error() != want {
			t.Fatal("notification preflight/dry-run behavior changed")
		}
	}
}

func TestC2AttemptIDEnvironment(t *testing.T) {
	for _, tc := range []struct {
		name, value   string
		absent, valid bool
	}{
		{"absent", "", true, false}, {"empty", "", false, false},
		{"uppercase", strings.Repeat("A", 32), false, false},
		{"nonhex", strings.Repeat("g", 32), false, false},
		{"short", strings.Repeat("a", 31), false, false},
		{"long", strings.Repeat("a", 33), false, false},
		{"newline", strings.Repeat("a", 32) + "\n", false, false},
		{"valid", "0123456789abcdef0123456789abcdef", false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("C2_EVENT_ATTEMPT_ID", tc.value)
			if tc.absent {
				if err := os.Unsetenv("C2_EVENT_ATTEMPT_ID"); err != nil {
					t.Fatal(err)
				}
			}
			want := ""
			if tc.valid {
				want = tc.value
			}
			if c2AttemptID() != want {
				t.Fatal("attempt env acceptance changed")
			}
		})
	}
}
