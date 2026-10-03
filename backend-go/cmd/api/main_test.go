package main

import (
	"bytes"
	"context"
	"net/http"
	"testing"

	"adilbaga/backend-go/internal/observability"
)

func TestCanceledServeShutsDown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := &http.Server{Addr: "127.0.0.1:0", Handler: http.NotFoundHandler()}
	if err := serve(ctx, s, observability.New(&bytes.Buffer{}, "info")); err != nil {
		t.Fatal(err)
	}
}

func TestRunMissingConfig(t *testing.T) {
	if err := run(context.Background(), func(string) string { return "" }); err == nil {
		t.Fatal("missing config accepted")
	}
}
