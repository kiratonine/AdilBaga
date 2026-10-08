package integration

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"
)

// This test-only handler retains no record/message/attributes besides an exact
// allowlisted class. WithAttrs/WithGroup intentionally discard ambient metadata.
type outcomeCapture struct {
	mu      sync.Mutex
	classes []string
}

func (*outcomeCapture) Enabled(context.Context, slog.Level) bool { return true }
func (h *outcomeCapture) Handle(_ context.Context, r slog.Record) error {
	r.Attrs(func(a slog.Attr) bool {
		if a.Key != "provider_outcome_class" || a.Value.Kind() != slog.KindString {
			return true
		}
		switch a.Value.String() {
		case "success", "rate_limited", "server_error", "network_error", "timeout", "auth_error", "bad_request", "invalid_output", "fallback":
			h.mu.Lock()
			h.classes = append(h.classes, a.Value.String())
			h.mu.Unlock()
		}
		return true
	})
	return nil
}
func (h *outcomeCapture) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *outcomeCapture) WithGroup(string) slog.Handler      { return h }
func (h *outcomeCapture) summary() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return "outcomes=[" + strings.Join(h.classes, ",") + "]"
}
func TestVoiceDiagnosticPrivacy(t *testing.T) {
	h := &outcomeCapture{}
	logger := slog.New(h).With("token", "private-token-sentinel").WithGroup("private-url-sentinel")
	logger.Info("private-prompt-sentinel", "provider_outcome_class", "timeout", "body", "private-body-sentinel")
	logger.Info("private-key-sentinel", "provider_outcome_class", "private-untrusted-sentinel")
	logger.Info("private-text-sentinel", "provider_outcome_class", 123)
	if h.summary() != "outcomes=[timeout]" {
		t.Fatal("diagnostics retained non-allowlisted data")
	}
}
