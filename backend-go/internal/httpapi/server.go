package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/dashboard"
	"adilbaga/backend-go/internal/middleware"
	"github.com/go-chi/chi/v5"
)

const (
	ReadHeaderTimeout = 5 * time.Second
	ReadTimeout       = 15 * time.Second
	WriteTimeout      = 20 * time.Second
	IdleTimeout       = 60 * time.Second
	MaxHeaderBytes    = 64 << 10
	ShutdownTimeout   = 10 * time.Second
	ReadinessTimeout  = 2 * time.Second
)

type Pinger interface{ Ping(context.Context) error }

type Dependencies struct {
	DB         Pinger
	Categories catalog.CategoryRepository
	Products   catalog.ProductRepository
	Dashboard  dashboard.Repository
	Voice      VoiceService
}

func Router(c config.Config, logger *slog.Logger, d Dependencies) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.NewIPResolver(c.TrustedProxies).Middleware, middleware.AccessLog(logger), middleware.Recover(logger), middleware.Timeout, middleware.Limits, middleware.CORS(c.CORSOrigins), middleware.NewLimiter(c.RateRPS, c.RateBurst).Middleware)
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { middleware.WriteError(w, 404) })
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) { middleware.WriteError(w, 405) })
	r.Get("/health/live", func(w http.ResponseWriter, _ *http.Request) { health(w, 200, "ok") })
	r.Get("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), ReadinessTimeout)
		defer cancel()
		if err := d.DB.Ping(ctx); err != nil {
			health(w, 503, "not_ready")
			return
		}
		health(w, 200, "ready")
	})
	r.Get("/api/categories", d.categories)
	r.Get("/api/categories/{slug}/filters", d.filters)
	r.Get("/api/products", d.products)
	r.Get("/api/products/{id}", d.product)
	r.Get("/api/dashboard", d.dashboard)
	rps, burst, concurrency := c.VoiceRateRPS, c.VoiceRateBurst, c.VoiceConcurrency
	if rps == 0 {
		rps = 2
	}
	if burst == 0 {
		burst = 4
	}
	if concurrency == 0 {
		concurrency = 4
	}
	r.Group(func(r chi.Router) {
		r.Use(middleware.VoiceGate(rps, burst, concurrency))
		r.Post("/api/voice/start", d.voiceStart)
		r.Post("/api/voice/continue", d.voiceContinue)
	})
	return r
}

func health(w http.ResponseWriter, status int, value string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Status string `json:"status"`
	}{value})
}

func Server(c config.Config, handler http.Handler, logger *slog.Logger) *http.Server {
	return &http.Server{Addr: ":" + strconv.Itoa(c.Port), Handler: handler, ReadHeaderTimeout: ReadHeaderTimeout, ReadTimeout: ReadTimeout, WriteTimeout: WriteTimeout, IdleTimeout: IdleTimeout, MaxHeaderBytes: MaxHeaderBytes, ErrorLog: slog.NewLogLogger(logger.Handler(), slog.LevelError)}
}
