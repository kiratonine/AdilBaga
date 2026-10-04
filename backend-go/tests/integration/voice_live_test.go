//go:build integration

package integration

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/gemini"
	"adilbaga/backend-go/internal/httpapi"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/postgres"
	"adilbaga/backend-go/internal/redis"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

func providerInput() voice.Input {
	return voice.Input{Text: "найди самое дешёвое молоко один литр 3.2 процента", Categories: []catalog.Category{{Slug: "milk", Name: "Молоко"}}, Schemas: []catalog.FilterSchema{{Category: "milk", Filters: []catalog.FilterDefinition{
		{Key: "volumeMl", Label: "Объём", Type: "multi-select", Options: []json.RawMessage{[]byte("500"), []byte("1000")}},
		{Key: "fatPercent", Label: "Жирность", Type: "multi-select", Options: []json.RawMessage{[]byte("2.5"), []byte("3.2")}},
	}}}}
}
func TestLiveGeminiStructuredParse(t *testing.T) {
	if os.Getenv("LIVE_GEMINI_CONFIRM") != "1" {
		t.Skip("explicit live Gemini opt-in required")
	}
	keys := gemini.Keys(os.Getenv("GEMINI_API_KEY"), os.Getenv("GEMINI_API_KEY2"), os.Getenv("GEMINI_API_KEY3"))
	if len(keys) == 0 {
		t.Fatal("Gemini not configured")
	}
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-3.1-flash-lite"
	}
	// Direct provider client: fallback cannot turn a provider failure into PASS.
	capture := &outcomeCapture{}
	start := time.Now()
	p, err := gemini.New(keys, model, slog.New(capture)).Parse(t.Context(), providerInput())
	t.Logf("production_budget=8s elapsed_seconds=%.2f %s", time.Since(start).Seconds(), capture.summary())
	if err != nil {
		t.Fatal("real structured NLP unavailable; " + capture.summary())
	}
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatal("structured encoding failed")
	}
	if _, err := voice.Validate(raw, providerInput()); err != nil {
		t.Fatal("independent validation failed")
	}
	if p.Intent == nil || *p.Intent != "cheapest" || p.Category == nil || *p.Category != "milk" || len(p.Filters) != 2 {
		t.Fatal("required structure not extracted")
	}
	t.Log("real structured parse independently validated; no fallback")
}
func TestLiveUpstashSession(t *testing.T) {
	if os.Getenv("LIVE_UPSTASH_CONFIRM") != "1" {
		t.Skip("explicit live Upstash opt-in required")
	}
	url, token := os.Getenv("UPSTASH_REDIS_REST_URL"), os.Getenv("UPSTASH_REDIS_REST_TOKEN")
	if url == "" || token == "" {
		t.Fatal("Upstash not configured")
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal("random session failed")
	}
	id := hex.EncodeToString(random[:])
	store := redis.New(url, token)
	state := voice.Session{Parsed: voice.Parsed{Filters: map[string]json.RawMessage{"volumeMl": []byte("1000"), "fatPercent": []byte("3.2")}}, Latitude: 1, Longitude: 2}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if store.Delete(ctx, id) != nil {
			t.Error("own session cleanup failed")
		}
	}()
	if store.Set(t.Context(), id, state, voice.SessionTTL) != nil {
		t.Fatal("own session SET TTL600 failed")
	}
	got, found, err := store.Get(t.Context(), id)
	if err != nil || !found || !reflect.DeepEqual(got, state) {
		t.Fatal("own typed session GET failed")
	}
	if store.Delete(t.Context(), id) != nil {
		t.Fatal("own session DELETE failed")
	}
	_, found, err = store.Get(t.Context(), id)
	if err != nil || found {
		t.Fatal("own session not absent")
	}
	t.Log("isolated SET EX600 / GET typed / DEL / GET absent; no unrelated command")
}

func TestFullLiveVoice(t *testing.T) {
	if os.Getenv("LIVE_VOICE_CONFIRM") != "1" {
		t.Skip("explicit read-only live voice flow opt-in required")
	}
	target := os.Getenv("LIVE_DATABASE_URL")
	u, err := url.Parse(target)
	if err != nil || u.User == nil || !strings.HasPrefix(u.User.Username(), "aktau_api_runtime.") {
		t.Fatal("restricted runtime required")
	}
	cfg, err := config.Load(func(k string) string {
		switch k {
		case "APP_ENV":
			return "production"
		case "DATABASE_URL":
			return target
		case "CORS_ALLOWED_ORIGINS":
			return "https://aktau.market"
		case "VOICE_RATE_LIMIT_RPS", "RATE_LIMIT_RPS", "VOICE_RATE_LIMIT_BURST", "RATE_LIMIT_BURST":
			return "1000"
		}
		return os.Getenv(k)
	})
	if err != nil {
		t.Fatal("live provider config unavailable")
	}
	pool, err := postgres.OpenReadOnly(t.Context(), target)
	if err != nil {
		t.Fatal("live pool unavailable")
	}
	defer pool.Close()
	var policy string
	if pool.QueryRow(t.Context(), "SHOW default_transaction_read_only").Scan(&policy) != nil || policy != "on" {
		t.Fatal("read-only session policy")
	}
	repo := postgres.NewRepository(pool)
	var logs bytes.Buffer
	store := redis.New(cfg.UpstashURL, cfg.UpstashToken)
	svc := &voice.Service{Parser: voice.NLP{Provider: gemini.New(cfg.GeminiKeys, cfg.GeminiModel, observability.New(&logs, "info"))}, Sessions: store, Categories: repo, Products: repo, Locations: repo}
	server := httptest.NewServer(httpapi.Router(cfg, observability.New(&logs, "info"), httpapi.Dependencies{DB: pool, Categories: repo, Products: repo, Dashboard: repo, Voice: svc}))
	defer server.Close()
	ownSessions := []string{}
	defer func() {
		for _, id := range ownSessions {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			err := store.Delete(ctx, id)
			cancel()
			if err != nil {
				t.Error("own clarification cleanup failed")
			}
		}
	}()
	post := func(path string, body any, want int) map[string]any {
		t.Helper()
		raw, _ := json.Marshal(body)
		ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "POST", server.URL+"/api/voice/"+path, bytes.NewReader(raw))
		if err != nil {
			t.Fatal("request invalid")
		}
		req.Header.Set("Content-Type", "application/json")
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal("live voice HTTP unavailable")
		}
		defer response.Body.Close()
		var v map[string]any
		if json.NewDecoder(response.Body).Decode(&v) != nil {
			t.Fatal("live voice invalid response")
		}
		if response.StatusCode != want {
			t.Fatalf("live voice status expected=%d actual=%d", want, response.StatusCode)
		}
		if id, ok := v["sessionId"].(string); ok {
			ownSessions = append(ownSessions, id)
		}
		return v
	}
	start := func(text string) map[string]any {
		return post("start", map[string]any{"text": text, "latitude": 43.6, "longitude": 51.1}, 201)
	}
	for _, tt := range []struct {
		name, text, mode string
		limit            int
	}{{"cheapest", "самое дешёвое молоко 1 литр 3.2%", "single", 1}, {"search", "найди молоко 1 литр 3.2%", "list", 3}} {
		t.Run(tt.name, func(t *testing.T) {
			v := start(tt.text)
			items, ok := v["items"].([]any)
			if v["status"] != "result" || v["mode"] != tt.mode || !ok || len(items) == 0 || len(items) > tt.limit {
				t.Fatal("live result invariant")
			}
			for _, raw := range items {
				i, ok := raw.(map[string]any)
				if !ok || i["address"] == nil || i["distanceMeters"] == nil {
					t.Fatal("real location missing")
				}
			}
		})
	}
	t.Run("clarification_continue", func(t *testing.T) {
		v := start("самое дешёвое молоко")
		id, ok := v["sessionId"].(string)
		if v["status"] != "needs_clarification" || !ok || strings.TrimSpace(id) == "" {
			t.Fatal("live clarification missing")
		}
		result := post("continue", map[string]any{"sessionId": id, "text": "1 литр 3.2%"}, 201)
		if result["status"] != "result" || result["mode"] != "single" {
			t.Fatal("live continuation incomplete")
		}
		post("continue", map[string]any{"sessionId": id, "text": "ещё"}, 404)
	})
	for _, secret := range append(ownSessions, append(cfg.GeminiKeys, cfg.UpstashURL, cfg.UpstashToken, "43.6", "51.1", "молоко")...) {
		if secret != "" && strings.Contains(logs.String(), secret) {
			t.Fatal("live runtime privacy violation")
		}
	}
}
