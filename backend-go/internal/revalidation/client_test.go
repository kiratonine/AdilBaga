package revalidation

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testSecret = "part16-synthetic-test-secret-00000000"

func TestGoldenVector(t *testing.T) {
	if Signature(testSecret, "1700000000") != "v1=ce184df67d6068a4432905181f4a60b6365d1d8dc6e119cfdbc7a84892a31e4b" {
		t.Fatal("golden mismatch")
	}
}

func TestConfiguration(t *testing.T) {
	for _, test := range []struct {
		endpoint, secret, environment string
		valid                         bool
	}{
		{"https://app.example.invalid/internal/revalidate", testSecret, "production", true},
		{"http://127.0.0.1/internal/revalidate", testSecret, "production", false},
		{"http://127.0.0.1/internal/revalidate", testSecret, "test", true},
		{"https://user:password@app.example.invalid/internal/revalidate", testSecret, "production", false},
		{"https://app.example.invalid/internal/revalidate?path=/", testSecret, "production", false},
		{"https://app.example.invalid/internal/revalidate", "", "production", false},
		{"https://app.example.invalid/internal/revalidate", "short", "production", false},
	} {
		_, err := New(test.endpoint, test.secret, test.environment)
		if (err == nil) != test.valid {
			t.Fatal("config acceptance mismatch")
		}
		if err != nil && (strings.Contains(err.Error(), testSecret) || strings.Contains(err.Error(), test.endpoint)) {
			t.Fatal("unsafe error")
		}
	}
}

func TestNotify(t *testing.T) {
	for _, status := range []int{200, 204, 401, 403, 500, 302} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			redirects := 0
			target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirects++; w.WriteHeader(204) }))
			defer target.Close()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				raw, _ := io.ReadAll(r.Body)
				stamp := r.Header.Get("X-Adilbaga-Timestamp")
				if r.Method != "POST" || r.Header.Get("Content-Type") != "application/json" || string(raw) != Body || stamp == "" || r.Header.Get("X-Adilbaga-Signature") != Signature(testSecret, stamp) || r.Header.Get("Cookie") != "" {
					t.Error("wire mismatch")
				}
				w.Header().Set("Location", target.URL)
				w.WriteHeader(status)
			}))
			defer server.Close()
			client, err := New(server.URL+"/internal/revalidate", testSecret, "test")
			if err != nil {
				t.Fatal(err)
			}
			err = client.Notify(context.Background())
			if (err == nil) != (status >= 200 && status < 300) || redirects != 0 {
				t.Fatal("status/redirect mismatch")
			}
			if err != nil && strings.Contains(err.Error(), testSecret) {
				t.Fatal("unsafe error")
			}
		})
	}
}

func TestTimeout(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-release }))
	defer server.Close()
	defer close(release)
	client, _ := New(server.URL+"/internal/revalidate", testSecret, "test")
	client.http.Timeout = 20 * time.Millisecond
	if client.Notify(context.Background()) == nil {
		t.Fatal("timeout accepted")
	}
}

func TestPublicationOrdering(t *testing.T) {
	for _, test := range []struct {
		name                           string
		apply, failPublish, failNotify bool
		outcome                        string
	}{
		{"dry-run", false, false, false, "not_requested"},
		{"failed publication", true, true, false, "not_attempted"},
		{"success", true, false, false, "success"},
		{"committed notification failure", true, false, true, "degraded"},
	} {
		t.Run(test.name, func(t *testing.T) {
			published, notified := false, false
			outcome, err := PublishThenNotify(context.Background(), test.apply, func(context.Context) error {
				if test.failPublish {
					return errors.New("publication failed")
				}
				published = true
				return nil
			}, func(ctx context.Context) error {
				if !published {
					t.Fatal("notification before commit")
				}
				if _, ok := ctx.Deadline(); !ok {
					t.Fatal("unbounded notification")
				}
				notified = true
				if test.failNotify {
					return errors.New("private transport details")
				}
				return nil
			})
			if outcome != test.outcome || (err != nil) != test.failPublish || notified != (test.apply && !test.failPublish) || published != (test.apply && !test.failPublish) {
				t.Fatal("publication semantics changed")
			}
		})
	}
}
