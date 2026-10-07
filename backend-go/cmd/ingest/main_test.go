package main

import (
	"flag"
	"io"
	"os"
	"strings"
	"testing"
)

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
