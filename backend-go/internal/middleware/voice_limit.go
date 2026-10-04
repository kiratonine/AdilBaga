package middleware

import "net/http"

// VoiceGate never queues requests or creates waiting goroutines. Deferred release
// also covers validation errors, cancellation and recovered panics.
func VoiceGate(rps float64, burst, concurrency int) func(http.Handler) http.Handler {
	limiter := NewLimiter(rps, burst)
	tokens := make(chan struct{}, concurrency)
	return func(next http.Handler) http.Handler {
		return limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			select {
			case tokens <- struct{}{}:
				defer func() { <-tokens }()
				next.ServeHTTP(w, r)
			default:
				WriteError(w, 429)
			}
		}))
	}
}
