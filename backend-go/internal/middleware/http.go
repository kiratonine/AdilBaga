package middleware

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

const (
	MaxBodyBytes   = 1 << 20
	MaxURIBytes    = 16 << 10
	RequestTimeout = 15 * time.Second
)

type contextKey int

const (
	requestIDKey contextKey = iota
	clientIPKey
)

func RequestIDValue(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey).(string)
	return value
}
func ClientIPValue(ctx context.Context) string {
	value, _ := ctx.Value(clientIPKey).(string)
	return value
}

func WriteError(w http.ResponseWriter, status int) {
	message := http.StatusText(status)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		StatusCode int    `json:"statusCode"`
		Message    string `json:"message"`
		Error      string `json:"error"`
	}{status, message, message})
}

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if len(r.Header.Values("X-Request-ID")) != 1 || !safeID(id) {
			var data [16]byte
			if _, err := rand.Read(data[:]); err != nil {
				WriteError(w, 500)
				return
			}
			id = hex.EncodeToString(data[:])
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, id)))
	})
}

func safeID(id string) bool {
	if len(id) == 0 || len(id) > 64 {
		return false
	}
	for _, c := range id {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

func AccessLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			status := ww.Status()
			if status == 0 {
				status = 200
			}
			logger.InfoContext(r.Context(), "http_request", "request_id", RequestIDValue(r.Context()), "method", r.Method, "path", r.URL.Path, "status", status, "duration_ms", time.Since(start).Milliseconds(), "client_ip", ClientIPValue(r.Context()))
		})
	}
}

func Recover(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			defer func() {
				if recover() != nil {
					logger.ErrorContext(r.Context(), "http_error", "request_id", RequestIDValue(r.Context()), "path", r.URL.Path, "error_class", "panic")
					if ww.Status() == 0 {
						WriteError(ww, 500)
					}
				}
			}()
			next.ServeHTTP(ww, r)
		})
	}
}

func Timeout(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), RequestTimeout)
		defer cancel()
		ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r.WithContext(ctx))
		if ctx.Err() != nil && ww.Status() == 0 {
			WriteError(ww, 503)
		}
	})
}

func Limits(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uri := r.RequestURI
		if uri == "" {
			uri = r.URL.RequestURI()
		}
		if len(uri) > MaxURIBytes {
			WriteError(w, 414)
			return
		}
		if r.ContentLength > MaxBodyBytes {
			WriteError(w, 413)
			return
		}
		if r.Body != nil && r.Body != http.NoBody {
			// Bounded pre-read also rejects chunked bodies before a route ignores them.
			body := http.MaxBytesReader(w, r.Body, MaxBodyBytes)
			data, err := io.ReadAll(body)
			_ = body.Close()
			if err != nil {
				var oversized *http.MaxBytesError
				if errors.As(err, &oversized) {
					WriteError(w, 413)
				} else {
					WriteError(w, 400)
				}
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(data))
		}
		next.ServeHTTP(w, r)
	})
}

func CORS(origins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		allowed[origin] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Add("Vary", "Origin")
			origin := r.Header.Get("Origin")
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}
			if len(r.Header.Values("Origin")) != 1 || !allowed[origin] {
				WriteError(w, 403)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			if r.Method == "OPTIONS" {
				w.Header().Add("Vary", "Access-Control-Request-Method")
				w.Header().Add("Vary", "Access-Control-Request-Headers")
				method := r.Header.Get("Access-Control-Request-Method")
				if method != "GET" && method != "POST" && method != "OPTIONS" {
					WriteError(w, 403)
					return
				}
				for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
					switch strings.ToLower(strings.TrimSpace(header)) {
					case "", "accept", "content-type", "x-request-id":
					default:
						WriteError(w, 403)
						return
					}
				}
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, X-Request-ID")
				w.WriteHeader(204)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
