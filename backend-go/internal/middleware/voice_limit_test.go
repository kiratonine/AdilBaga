package middleware

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestVoiceConcurrency(t *testing.T) {
	entered := make(chan struct{}, 2)
	release := make(chan struct{})
	h := VoiceGate(10000, 100, 2)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { entered <- struct{}{}; <-release; w.WriteHeader(201) }))
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/voice/start", nil))
		}()
	}
	<-entered
	<-entered
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/api/voice/start", nil))
	if w.Code != 429 {
		t.Fatal("queued or exceeded concurrency")
	}
	close(release)
	wg.Wait()
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/api/voice/start", nil))
	if w.Code != 201 {
		t.Fatal("token not released")
	}
}
func TestVoiceRate(t *testing.T) {
	h := VoiceGate(.001, 1, 1)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(201) }))
	for _, want := range []int{201, 429} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("POST", "/api/voice/start", nil))
		if w.Code != want {
			t.Fatal("rate gate")
		}
	}
}
