//go:build integration

package integration

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/httpapi"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/postgres"
	"adilbaga/backend-go/internal/voice"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// No runtime memory fallback: this fake is compiled only into the opt-in tests.
type paritySessions struct {
	mu     sync.Mutex
	states map[string]voice.Session
}

func (m *paritySessions) Get(_ context.Context, id string) (voice.Session, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.states[id]
	return v, ok, nil
}
func (m *paritySessions) Set(_ context.Context, id string, s voice.Session, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if ttl != voice.SessionTTL {
		return voice.ErrSessionUnavailable
	}
	m.states[id] = s
	return nil
}
func (m *paritySessions) Delete(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.states, id)
	return nil
}

func TestLocalVoiceParity(t *testing.T) {
	target, reference := os.Getenv("SMOKE_DATABASE_URL"), os.Getenv("REFERENCE_API_BASE_URL")
	if target == "" || reference == "" {
		t.Skip("explicit local clone/reference required")
	}
	if !localURL(target) {
		t.Fatal("local voice requires loopback DB")
	}
	u, err := url.Parse(target)
	if err != nil || u.User == nil || u.User.Username() != "part04_api_login" {
		t.Fatal("restricted local role required")
	}
	voiceParity(t, target, reference)
}

func TestLiveVoiceParity(t *testing.T) {
	if os.Getenv("LIVE_VOICE_CONFIRM") != "1" {
		t.Skip("explicit read-only live voice parity opt-in required")
	}
	target := os.Getenv("LIVE_DATABASE_URL")
	u, err := url.Parse(target)
	if err != nil || u.User == nil || !strings.HasPrefix(u.User.Username(), "aktau_api_runtime.") {
		t.Fatal("restricted live runtime credential required")
	}
	voiceParity(t, target, os.Getenv("REFERENCE_API_BASE_URL"))
}
func voiceParity(t *testing.T, target, reference string) {
	t.Helper()
	u, err := url.Parse(reference)
	if err != nil || !localHost(u.Hostname()) || u.User != nil {
		t.Fatal("credential-free local reference required")
	}
	pool, err := postgres.OpenReadOnly(t.Context(), target)
	if err != nil {
		t.Fatal("read-only pool startup failed")
	}
	defer pool.Close()
	repo := postgres.NewRepository(pool)
	var logs bytes.Buffer
	const latitude = 43.63798231415926
	const longitude = 51.16918027182818
	const invalidLatitude = 91.63798231415926
	const marker = "privacyprobeqzrvnxtkmwbdjlf"
	sensitive := map[string][]string{
		"coordinate_lat": {strconv.FormatFloat(latitude, 'f', -1, 64), strconv.FormatFloat(invalidLatitude, 'f', -1, 64)},
		"coordinate_lon": {strconv.FormatFloat(longitude, 'f', -1, 64), strconv.FormatFloat(longitude, 'e', -1, 64)},
		"voice_text":     {marker},
		"session_id":     {},
	}
	svc := &voice.Service{Parser: voice.Fallback{}, Sessions: &paritySessions{states: map[string]voice.Session{}}, Categories: repo, Products: repo, Locations: repo}
	c := config.Config{AppEnv: "test", RateRPS: 10000, RateBurst: 10000, VoiceRateRPS: 10000, VoiceRateBurst: 10000, VoiceConcurrency: 4}
	candidate := httptest.NewServer(httpapi.Router(c, observability.New(&logs, "info"), httpapi.Dependencies{DB: pool, Categories: repo, Products: repo, Dashboard: repo, Voice: svc}))
	defer candidate.Close()
	post := func(base, path string, body any, want int) map[string]any {
		t.Helper()
		if fields, ok := body.(map[string]any); ok {
			if text, ok := fields["text"].(string); ok && strings.TrimSpace(text) != "" && text != "x" {
				fields["text"] = text + " " + marker
			}
			if base == candidate.URL {
				if id, ok := fields["sessionId"].(string); ok && id != "" {
					sensitive["session_id"] = append(sensitive["session_id"], id)
				}
				if text, ok := fields["text"].(string); ok && strings.Contains(text, marker) {
					sensitive["voice_text"] = append(sensitive["voice_text"], text)
				}
			}
		}
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal("request encoding failed")
		}
		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(base, "/")+"/api/voice/"+path, bytes.NewReader(raw))
		if err != nil {
			t.Fatal("request construction failed")
		}
		req.Header.Set("Content-Type", "application/json")
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal("voice reference/candidate request failed")
		}
		defer response.Body.Close()
		if response.StatusCode != want {
			t.Fatalf("voice status mismatch: want=%d got=%d", want, response.StatusCode)
		}
		data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		if err != nil {
			t.Fatal("voice response read failed")
		}
		var value map[string]any
		if json.Unmarshal(data, &value) != nil {
			t.Fatal("voice response invalid JSON")
		}
		if base == candidate.URL && value["status"] == "needs_clarification" {
			if id, ok := value["sessionId"].(string); ok && id != "" {
				sensitive["session_id"] = append(sensitive["session_id"], id)
			}
		}
		if want >= 400 {
			if value["statusCode"] != float64(want) || value["message"] == nil {
				t.Fatal("incompatible error envelope")
			}
			return value
		}
		return value
	}
	start := func(base, text string, coords bool) map[string]any {
		lat, lon := any(latitude), any(longitude)
		if coords {
			lat = " " + strconv.FormatFloat(latitude, 'f', -1, 64) + " "
			lon = strconv.FormatFloat(longitude, 'e', -1, 64)
		}
		return post(base, "start", map[string]any{"text": text, "latitude": lat, "longitude": lon}, 201)
	}
	compare := func(a, b map[string]any) {
		t.Helper()
		ac := map[string]any{}
		bc := map[string]any{}
		for k, v := range a {
			if k != "sessionId" {
				ac[k] = v
			}
		}
		for k, v := range b {
			if k != "sessionId" {
				bc[k] = v
			}
		}
		if !reflect.DeepEqual(ac, bc) {
			t.Fatal("voice response/speech/location parity mismatch (payload suppressed)")
		}
	}
	for _, test := range []struct{ name, text string }{{"direct_cheapest", "самое дешёвое молоко 1 литр 3.2%"}, {"direct_search", "найди молоко 1 литр 3.2%"}, {"numeric_string_coordinates", "самое дешёвое молоко 1 литр 3.2%"}} {
		t.Run(test.name, func(t *testing.T) {
			a := start(candidate.URL, test.text, test.name == "numeric_string_coordinates")
			b := start(reference, test.text, test.name == "numeric_string_coordinates")
			compare(a, b)
			if a["status"] != "result" {
				t.Fatal("direct query incomplete")
			}
			items, ok := a["items"].([]any)
			if !ok || len(items) > 3 {
				t.Fatal("items unbounded")
			}
			if a["mode"] == "single" && len(items) > 1 {
				t.Fatal("single unbounded")
			}
		})
	}
	for _, test := range []struct{ name, text, follow string }{{"clarification_continue", "самое дешёвое молоко", "1 литр 3.2%"}, {"category_only", "молоко", "найди 1 литр 3.2%"}, {"intent_only", "найди", "молоко 1 литр 3.2%"}, {"missing_one", "найди молоко 1 литр", "3.2%"}} {
		t.Run(test.name, func(t *testing.T) {
			a, b := start(candidate.URL, test.text, false), start(reference, test.text, false)
			compare(a, b)
			ids := []string{}
			for _, v := range []map[string]any{a, b} {
				id, ok := v["sessionId"].(string)
				if v["status"] != "needs_clarification" || !ok || strings.TrimSpace(id) == "" {
					t.Fatal("clarification session absent")
				}
				ids = append(ids, id)
			}
			first := post(candidate.URL, "continue", map[string]any{"sessionId": ids[0], "text": test.follow}, 201)
			second := post(reference, "continue", map[string]any{"sessionId": ids[1], "text": test.follow}, 201)
			compare(first, second)
			if first["status"] != "result" {
				t.Fatal("continuation incomplete")
			}
			for i, base := range []string{candidate.URL, reference} {
				post(base, "continue", map[string]any{"sessionId": ids[i], "text": "ещё"}, 404)
			}
		})
	}
	t.Run("empty_result", func(t *testing.T) {
		schema, err := repo.GetFilterSchema(t.Context(), "milk")
		if err != nil {
			t.Fatal("schema discovery failed")
		}
		var fats []json.RawMessage
		for _, d := range schema.Filters {
			if d.Key == "fatPercent" {
				fats = d.Options
			}
		}
		phrase := ""
		for _, volume := range []int{500, 1000} {
			for _, fat := range fats {
				products, err := repo.ListProducts(t.Context(), catalog.ProductQuery{Category: "milk", Sort: catalog.PriceAsc, Limit: 1, Filters: catalog.DynamicFilter{"volumeMl": {json.RawMessage(fmt.Sprint(volume))}, "fatPercent": {fat}}})
				if err != nil {
					continue
				}
				if len(products) == 0 {
					v := "500 мл"
					if volume == 1000 {
						v = "1 литр"
					}
					phrase = "самое дешёвое молоко " + v + " " + string(fat) + "%"
					break
				}
			}
			if phrase != "" {
				break
			}
		}
		if phrase == "" {
			t.Fatal("no approved empty milk combination available")
		}
		a, b := start(candidate.URL, phrase, false), start(reference, phrase, false)
		compare(a, b)
		items, ok := a["items"].([]any)
		if !ok || len(items) != 0 || a["status"] != "result" {
			t.Fatal("empty result fabricated")
		}
	})
	t.Run("errors", func(t *testing.T) {
		for _, base := range []string{candidate.URL, reference} {
			post(base, "continue", map[string]any{"sessionId": "unknown opaque session", "text": "литр"}, 404)
			for _, body := range []any{map[string]any{"text": " ", "latitude": latitude, "longitude": longitude}, map[string]any{"text": marker, "latitude": invalidLatitude, "longitude": longitude}, map[string]any{"text": marker, "latitude": latitude, "longitude": longitude, "unknown": true}} {
				post(base, "start", body, 400)
			}
		}
	})
	if len(sensitive["session_id"]) < 4 {
		t.Fatal("privacy proof requires real candidate clarification sessions")
	}
	if class := voicePrivacyFailure(logs.String(), sensitive); class != "" {
		t.Fatal(class)
	}
}

// Exact high-entropy values also detect values embedded in serialized payloads.
// Never report the matched value or record: diagnostics are a closed class enum.
func voicePrivacyFailure(logs string, sensitive map[string][]string) string {
	for _, class := range []string{"coordinate_lat", "coordinate_lon", "voice_text", "session_id"} {
		for _, value := range sensitive[class] {
			if value != "" && strings.Contains(logs, value) {
				return class
			}
		}
	}
	return ""
}

func TestVoicePrivacyProof(t *testing.T) {
	sensitive := map[string][]string{"coordinate_lat": {"43.63798231415926"}, "coordinate_lon": {"51.16918027182818"}, "voice_text": {"privacyprobeqzrvnxtkmwbdjlf"}, "session_id": {"opaque-actual-7ed49f32-privacy"}}
	if voicePrivacyFailure(`{"time":"2026-10-05T12:43.600Z","duration_ms":511,"field":"sessionId","path":"/api/voice/start"}`, sensitive) != "" {
		t.Fatal("safe metadata false positive")
	}
	for class, values := range sensitive {
		if voicePrivacyFailure(`{"nested":"`+values[0]+`"}`, sensitive) != class {
			t.Fatal("sensitive class not detected")
		}
	}
}
