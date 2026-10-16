package revalidation

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

func TestTracePreservesNotify(t *testing.T) {
	for _, status := range []int{200, 204, 401, 0} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var calls atomic.Int32
			release := make(chan struct{})
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				_, _ = io.Copy(io.Discard, r.Body)
				if status == 0 {
					<-release
					return
				}
				w.WriteHeader(status)
			}))
			defer server.Close()
			defer close(release)
			c, _ := New(server.URL+"/internal/revalidate", testSecret, "test")
			if status == 0 {
				c.http.Timeout = 20 * time.Millisecond
			} // test only
			emitted := 0
			var got Attempt
			c.WithTrace(func(a Attempt) { got = a; emitted++ })
			err := c.Notify(context.Background())
			if (err == nil) != (status == 200 || status == 204) || emitted != 1 || calls.Load() != 1 || got.Status != status {
				t.Fatal("notify/trace semantics changed")
			}
			expected := "none"
			if status == 401 {
				expected = "rejected"
			}
			if status == 0 {
				expected = "timeout"
			}
			if runtime.GOOS != "linux" {
				expected = "clock_unavailable"
			}
			if got.ErrorClass != expected {
				t.Fatal("wrong safe error class")
			}
		})
	}
}
func TestTracePanicDoesNotFailNotify(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer server.Close()
	c, _ := New(server.URL+"/internal/revalidate", testSecret, "test")
	c.WithTrace(func(Attempt) { panic("diagnostic failure") })
	if c.Notify(context.Background()) != nil {
		t.Fatal("trace changed notify")
	}
}
