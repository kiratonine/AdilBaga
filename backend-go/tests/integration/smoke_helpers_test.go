package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

const operationBudget = 15 * time.Second

func boundedContext(base context.Context, budget time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(base, budget)
}

func boundedCall[T any](base context.Context, call func(context.Context) (T, error)) (T, error) {
	ctx, cancel := boundedContext(base, operationBudget)
	defer cancel()
	value, err := call(ctx)
	if err != nil {
		return value, errors.New("repository operation " + failureClass(ctx, err))
	}
	return value, nil
}

// The first complete scan discovers the real total. A harness-only 32-page
// ceiling allows up to 3,199 products (849 today) and prevents endless full
// pages. Later scans/searches need at most total/100+1, including an empty
// sentinel page for exact multiples. This never changes public pagination.
func pageCeiling(observedTotal int) int {
	if observedTotal == 0 {
		return 32
	}
	return observedTotal/100 + 1
}

func failureClass(ctx context.Context, err error) string {
	var network net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) || (errors.As(err, &network) && network.Timeout()) {
		return "timeout"
	}
	if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
		return "canceled"
	}
	return "transport failure"
}

func referenceJSON(base context.Context, baseURL, path string, params url.Values, out any) error {
	ctx, cancel := boundedContext(base, operationBudget)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+path+"?"+params.Encode(), nil)
	if err != nil {
		return errors.New("reference URL invalid")
	}
	response, err := (&http.Client{Timeout: operationBudget}).Do(request)
	if err != nil {
		return errors.New("reference GET " + failureClass(ctx, err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("reference GET status %d", response.StatusCode)
	}
	if err := json.NewDecoder(response.Body).Decode(out); err != nil {
		if failureClass(ctx, err) != "transport failure" {
			return errors.New("reference GET " + failureClass(ctx, err))
		}
		return errors.New("reference JSON invalid")
	}
	return nil
}

func TestIndependentParityOperationBudgets(t *testing.T) {
	base := t.Context()
	// Deterministically exhaust an earlier phase's budget without sleeping or
	// waiting 120 seconds. Its deadline/cancellation must not taint the base.
	earlier, cancel := boundedContext(base, -time.Second)
	defer cancel()
	if !errors.Is(earlier.Err(), context.DeadlineExceeded) {
		t.Fatal("earlier budget must be exhausted")
	}
	_, err := boundedCall(base, func(next context.Context) (bool, error) {
		if next.Err() != nil {
			t.Fatal("next operation inherited exhausted earlier context")
		}
		if _, ok := next.Deadline(); !ok {
			t.Fatal("next operation must still be bounded")
		}
		return true, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	var result struct{ OK bool }
	if err := referenceJSON(base, server.URL, "/", nil, &result); err != nil || !result.OK {
		t.Fatal("independent next reference GET failed")
	}
	if err := referenceJSON(earlier, server.URL, "/", nil, &result); err == nil || err.Error() != "reference GET timeout" {
		t.Fatal("exhausted context must be diagnosed without raw errors")
	}
}

func TestParityPaginationCeiling(t *testing.T) {
	for total, expected := range map[int]int{0: 32, 849: 9, 900: 10, 1: 1} {
		if pageCeiling(total) != expected {
			t.Fatal("finite page ceiling/sentinel incorrect")
		}
	}
}

func TestSanitizedReferenceDiagnostics(t *testing.T) {
	for _, status := range []int{http.StatusServiceUnavailable, http.StatusOK} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte("private-response-body"))
		}))
		var value any
		err := referenceJSON(t.Context(), server.URL, "/", url.Values{"secret": {"private-query"}}, &value)
		server.Close()
		expected := "reference JSON invalid"
		if status != http.StatusOK {
			expected = "reference GET status 503"
		}
		if err == nil || err.Error() != expected {
			t.Fatal("reference diagnostics must be fixed sanitized categories")
		}
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if failureClass(ctx, errors.New("private-driver-details")) != "canceled" || failureClass(t.Context(), errors.New("private-host")) != "transport failure" {
		t.Fatal("cancellation/transport diagnostics")
	}
}
