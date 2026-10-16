// Local-only PoC: original notifier against httptest, never a supplied URL/DB.
package main

import (
	"adilbaga/backend-go/internal/revalidation"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync/atomic"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "clock" {
		boot, err := revalidation.BootID()
		if err != nil {
			os.Exit(1)
		}
		mono, err := revalidation.MonotonicNS()
		if err != nil {
			os.Exit(1)
		}
		_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"bootId": boot, "monoNs": mono})
		return
	}
	if len(os.Args) != 5 || os.Args[1] != "notify" {
		os.Exit(2)
	}
	status, err := strconv.Atoi(os.Args[2])
	if err != nil || (status != 0 && status != 200 && status != 204 && status != 401) {
		os.Exit(2)
	}
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		if status == 0 {
			<-r.Context().Done()
			return
		}
		w.WriteHeader(status)
	}))
	defer server.Close()
	client, err := revalidation.New(server.URL+"/internal/revalidate", "part16-synthetic-test-secret-00000000", "test")
	if err != nil {
		os.Exit(1)
	}
	var receipt revalidation.Attempt
	attemptID := os.Getenv("C2_EVENT_ATTEMPT_ID")
	if revalidation.ValidAttemptID(attemptID) {
		client.WithTrace(func(a revalidation.Attempt) { receipt = a })
	}
	published := false
	outcome, err := revalidation.PublishThenNotify(context.Background(), true, func(context.Context) error { published = true; return nil }, client.Notify)
	if err != nil {
		os.Exit(1)
	}
	relay := "skipped"
	if revalidation.ValidAttemptID(attemptID) {
		relay = revalidation.Relay(os.Args[3], revalidation.Event(os.Args[4], attemptID, receipt))
	}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"outcome": outcome, "published": published, "requests": requests.Load(), "relay": relay, "status": receipt.Status, "errorClass": receipt.ErrorClass})
}
