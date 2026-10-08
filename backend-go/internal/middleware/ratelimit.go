package middleware

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const (
	MaxRateClients    = 8192
	RateIdleTTL       = 10 * time.Minute
	rateSweepInterval = time.Minute
)

type client struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}
type Limiter struct {
	mu        sync.Mutex
	clients   map[string]*client
	rps       rate.Limit
	burst     int
	lastSweep time.Time
}

func NewLimiter(rps float64, burst int) *Limiter {
	return &Limiter{clients: make(map[string]*client), rps: rate.Limit(rps), burst: burst}
}

func (l *Limiter) allow(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.lastSweep) >= rateSweepInterval {
		for key, value := range l.clients {
			if now.Sub(value.lastSeen) >= RateIdleTTL {
				delete(l.clients, key)
			}
		}
		l.lastSweep = now
	}
	c := l.clients[ip]
	if c == nil {
		// Fail closed at capacity instead of evicting active limiters/resetting tokens.
		if len(l.clients) >= MaxRateClients {
			return false
		}
		c = &client{limiter: rate.NewLimiter(l.rps, l.burst)}
		l.clients[ip] = c
	}
	c.lastSeen = now
	return c.limiter.AllowN(now, 1)
}

func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "OPTIONS" && r.URL.Path != "/health/live" && r.URL.Path != "/health/ready" && !l.allow(ClientIPValue(r.Context()), time.Now()) {
			WriteError(w, 429)
			return
		}
		next.ServeHTTP(w, r)
	})
}
