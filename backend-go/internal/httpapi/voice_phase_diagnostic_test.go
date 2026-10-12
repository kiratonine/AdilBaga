package httpapi

// Test-only decorators observe existing boundaries without altering Service,
// SQL, fallback, middleware or the production timeout/error mapping.
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/gemini"
	"adilbaga/backend-go/internal/location"
	"adilbaga/backend-go/internal/middleware"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/voice"
)

type phaseEvent struct {
	Stage       string  `json:"stage"`
	DurationMS  float64 `json:"duration_ms"`
	RequestID   string  `json:"request_id"`
	ErrorClass  string  `json:"error_class"`
	ContextErr  string  `json:"ctx_err"`
	RemainingMS float64 `json:"remaining_budget_ms"`
}

func phaseContextClass(err error) string {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline_exceeded"
	case errors.Is(err, context.Canceled):
		return "canceled"
	default:
		return "none"
	}
}
func phaseErrorClass(err error) string {
	if err == nil {
		return "none"
	}
	if c := phaseContextClass(err); c != "none" {
		return c
	}
	return "dependency_error"
}

type phaseTrace struct {
	mu               sync.Mutex
	events           []phaseEvent
	finalErr         error
	returned         time.Time
	finalCtx         string
	finalRemaining   float64
	locationReturned time.Time
}

func (p *phaseTrace) record(stage string, start time.Time, ctx context.Context, err error) {
	remaining := 0.0
	if deadline, ok := ctx.Deadline(); ok {
		remaining = max(0, float64(time.Until(deadline))/float64(time.Millisecond))
	}
	e := phaseEvent{stage, float64(time.Since(start)) / float64(time.Millisecond), middleware.RequestIDValue(ctx), phaseErrorClass(err), phaseContextClass(ctx.Err()), remaining}
	p.mu.Lock()
	p.events = append(p.events, e)
	p.mu.Unlock()
}

type phaseCategories struct {
	catalog.CategoryRepository
	trace *phaseTrace
}

func (r phaseCategories) ListVoiceVocabulary(ctx context.Context) (v catalog.VoiceVocabulary, err error) {
	start := time.Now()
	defer func() { r.trace.record("category_loading", start, ctx, err) }()
	source, ok := r.CategoryRepository.(catalog.VoiceVocabularyRepository)
	if !ok {
		return v, errors.New("diagnostic vocabulary unavailable")
	}
	return source.ListVoiceVocabulary(ctx)
}

func (r phaseCategories) ListCategories(ctx context.Context) (items []catalog.Category, err error) {
	start := time.Now()
	defer func() { r.trace.record("category_loading", start, ctx, err) }()
	return r.CategoryRepository.ListCategories(ctx)
}
func (r phaseCategories) GetFilterSchema(ctx context.Context, slug string) (schema catalog.FilterSchema, err error) {
	start := time.Now()
	defer func() { r.trace.record("filter_schema_discovery", start, ctx, err) }()
	return r.CategoryRepository.GetFilterSchema(ctx, slug)
}

type phaseProducts struct {
	catalog.ProductRepository
	trace *phaseTrace
}

func (r phaseProducts) ListProducts(ctx context.Context, q catalog.ProductQuery) (items []catalog.Product, err error) {
	start := time.Now()
	defer func() { r.trace.record("product_selection", start, ctx, err) }()
	return r.ProductRepository.ListProducts(ctx, q)
}

type phaseLocations struct {
	location.Repository
	trace *phaseTrace
}

func (r phaseLocations) ListLocations(ctx context.Context) (items []location.Location, err error) {
	start := time.Now()
	defer func() {
		r.trace.record("nearest_store_loading", start, ctx, err)
		r.trace.locationReturned = time.Now()
	}()
	return r.Repository.ListLocations(ctx)
}

// The provider is a local simulator. Preparation uses the real compact request
// builder; no HTTP request/key/model/provider benchmark is involved.
type phaseProvider struct {
	trace   *phaseTrace
	timeout time.Duration
	failed  bool
	ended   time.Time
}

func (p *phaseProvider) Parse(ctx context.Context, in voice.Input) (voice.Parsed, error) {
	start := time.Now()
	_, _, _, err := gemini.RequestStats(in)
	p.trace.record("gemini_preparation", start, ctx, err)
	if err != nil {
		p.failed, p.ended = true, time.Now()
		return voice.Parsed{}, err
	}
	start = time.Now()
	if p.timeout > 0 {
		child, cancel := context.WithTimeout(ctx, p.timeout)
		defer cancel()
		<-child.Done()
		err = child.Err()
		p.trace.record("gemini_parsing", start, ctx, err)
		p.failed, p.ended = true, time.Now()
		return voice.Parsed{}, err
	}
	parsed, err := voice.Validate([]byte(`{"intent":"cheapest","category":"milk","filters":{"volumeMl":1000,"fatPercent":3.2}}`), in)
	p.trace.record("gemini_parsing", start, ctx, err)
	p.failed, p.ended = err != nil, time.Now()
	return parsed, err
}

type phaseNLP struct {
	provider *phaseProvider
	trace    *phaseTrace
}

func (p phaseNLP) Parse(ctx context.Context, in voice.Input) (voice.Parsed, error) {
	start := time.Now()
	parsed, err := (voice.NLP{Provider: p.provider}).Parse(ctx, in)
	if p.provider.failed {
		// Derived tail around the existing NLP fallback, not a replacement parser.
		p.trace.record("deterministic_fallback_tail", p.provider.ended, ctx, err)
	}
	p.trace.record("nlp_pipeline", start, ctx, err)
	return parsed, err
}

type phaseService struct {
	*voice.Service
	trace *phaseTrace
}

func (s phaseService) Start(ctx context.Context, request voice.StartRequest) (voice.Response, error) {
	start := time.Now()
	response, err := s.Service.Start(ctx, request)
	if !s.trace.locationReturned.IsZero() {
		s.trace.record("nearest_store_and_speech_tail", s.trace.locationReturned, ctx, err)
	}
	s.trace.record("service_total", start, ctx, err)
	s.trace.finalErr, s.trace.returned, s.trace.finalCtx = err, time.Now(), phaseContextClass(ctx.Err())
	if deadline, ok := ctx.Deadline(); ok {
		s.trace.finalRemaining = max(0, float64(time.Until(deadline))/float64(time.Millisecond))
	}
	return response, err
}

type phaseFixture struct {
	categoryDelay, filterDelay, productDelay time.Duration
	waitStage                                string
	cancel                                   context.CancelFunc
	filterCalls, activeFilters, maxFilters   int
}

func (f *phaseFixture) wait(ctx context.Context, stage string, delay time.Duration) error {
	if stage == f.waitStage {
		if f.cancel != nil {
			f.cancel()
		}
		<-ctx.Done()
		return ctx.Err()
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
func (f *phaseFixture) ListCategories(ctx context.Context) ([]catalog.Category, error) {
	if err := f.wait(ctx, "category_loading", f.categoryDelay); err != nil {
		return nil, err
	}
	out := []catalog.Category{}
	for _, slug := range []string{"milk", "bread", "eggs", "oil", "sugar", "fruit", "meat", "vegetables", "drinks"} {
		out = append(out, catalog.Category{Slug: slug, Name: slug})
	}
	return out, nil
}
func (f *phaseFixture) GetFilterSchema(ctx context.Context, slug string) (catalog.FilterSchema, error) {
	f.filterCalls++
	f.activeFilters++
	f.maxFilters = max(f.maxFilters, f.activeFilters)
	defer func() { f.activeFilters-- }()
	if err := f.wait(ctx, "filter_schema_discovery", f.filterDelay); err != nil {
		return catalog.FilterSchema{}, err
	}
	return phaseConfiguredSchema(slug), nil
}
func (f *phaseFixture) ListVoiceVocabulary(ctx context.Context) (catalog.VoiceVocabulary, error) {
	categories, err := f.ListCategories(ctx)
	v := catalog.VoiceVocabulary{Categories: categories, Schemas: []catalog.FilterSchema{}}
	for _, c := range categories {
		v.Schemas = append(v.Schemas, phaseConfiguredSchema(c.Slug))
	}
	return v, err
}
func phaseConfiguredSchema(slug string) catalog.FilterSchema {
	schema := catalog.FilterSchema{Category: slug, Filters: []catalog.FilterDefinition{}}
	if slug == "milk" {
		schema.Filters = []catalog.FilterDefinition{
			{Key: "volumeMl", Label: "volume", Type: "multi-select", Options: []json.RawMessage{json.RawMessage(`1000`)}},
			{Key: "fatPercent", Label: "fat", Type: "multi-select", Options: []json.RawMessage{json.RawMessage(`3.2`)}},
		}
	}
	return schema
}
func (f *phaseFixture) ListProducts(ctx context.Context, _ catalog.ProductQuery) ([]catalog.Product, error) {
	if err := f.wait(ctx, "product_selection", f.productDelay); err != nil {
		return nil, err
	}
	return []catalog.Product{{Name: "fixture", Offers: []catalog.Offer{{StoreCode: catalog.DINA, StoreName: "fixture", Price: 570}}}}, nil
}
func (*phaseFixture) GetProductByID(context.Context, string) (catalog.Product, error) {
	return catalog.Product{}, catalog.ErrNotFound
}
func (f *phaseFixture) ListLocations(ctx context.Context) ([]location.Location, error) {
	if err := f.wait(ctx, "nearest_store_loading", 0); err != nil {
		return nil, err
	}
	return []location.Location{{StoreCode: catalog.DINA, Address: "fixture", Latitude: 1, Longitude: 2}}, nil
}

func runVoicePhase(t *testing.T, ctx context.Context, categories catalog.CategoryRepository, products catalog.ProductRepository, locations location.Repository, providerTimeout time.Duration) (*phaseTrace, int) {
	t.Helper()
	trace := &phaseTrace{}
	provider := &phaseProvider{trace: trace, timeout: providerTimeout}
	service := &voice.Service{Categories: phaseCategories{categories, trace}, Vocabulary: phaseCategories{categories, trace}, Products: phaseProducts{products, trace}, Locations: phaseLocations{locations, trace}, Parser: phaseNLP{provider, trace}}
	var logs bytes.Buffer
	r := httptest.NewRequest("POST", "/api/voice/start", strings.NewReader(`{"text":"найди самое дешёвое молоко один литр 3.2 процента phase-private-sentinel-93fe5d","latitude":43.641738291,"longitude":51.173829461}`)).WithContext(ctx)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Request-ID", "phase-local-test")
	w := httptest.NewRecorder()
	Router(testConfig(), observability.New(&logs, "info"), Dependencies{Voice: phaseService{service, trace}}).ServeHTTP(w, r)
	// Preserve context state at service return: Timeout's defer intentionally
	// cancels the child after the handler, even for a successful response.
	trace.events = append(trace.events, phaseEvent{"http_response_mapping_tail", float64(time.Since(trace.returned)) / float64(time.Millisecond), "phase-local-test", phaseErrorClass(trace.finalErr), trace.finalCtx, trace.finalRemaining})
	if w.Header().Get("Content-Type") != "application/json" || !json.Valid(w.Body.Bytes()) {
		t.Fatal("diagnostic response contract failed")
	}
	if w.Code == 201 {
		var response voice.Response
		if json.Unmarshal(w.Body.Bytes(), &response) != nil || response.Status != "result" || response.Mode != "single" || len(response.Items) != 1 {
			t.Fatal("diagnostic TOP1 result failed")
		}
	}
	safe, err := json.Marshal(trace.events)
	if err != nil {
		t.Fatal("diagnostic serialization failed")
	}
	for _, sentinel := range []string{"phase-private-sentinel-93fe5d", "43.641738291", "51.173829461", "private-dependency-sentinel", "sessionId", "prompt", "postgres://"} {
		if strings.Contains(string(safe)+logs.String(), sentinel) {
			t.Fatal("diagnostic privacy assertion failed")
		}
	}
	t.Logf("http_status=%d phases=%s", w.Code, safe)
	return trace, w.Code
}

func TestVoicePhaseDiagnostics(t *testing.T) {
	for _, tc := range []struct {
		name, waitStage string
		provider        time.Duration
		canceled        bool
		status          int
	}{
		{"fast_normal", "", 0, false, 201},
		{"provider_timeout_with_fallback", "", 20 * time.Millisecond, false, 201},
		{"category_deadline", "category_loading", 0, false, 500},
		{"filter_deadline", "filter_schema_discovery", 0, false, 500},
		{"product_deadline", "product_selection", 0, false, 500},
		{"product_canceled", "product_selection", 0, true, 500},
		{"location_deadline", "nearest_store_loading", 0, false, 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// A shorter caller context is test-only; Router's 15s constant is intact.
			ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
			defer cancel()
			f := &phaseFixture{categoryDelay: time.Millisecond, filterDelay: time.Millisecond, productDelay: time.Millisecond, waitStage: tc.waitStage}
			if tc.canceled {
				f.cancel = cancel
			}
			trace, status := runVoicePhase(t, ctx, f, f, f, tc.provider)
			if status != tc.status {
				t.Fatal("diagnostic status mismatch")
			}
			if tc.waitStage == "" {
				if trace.finalErr != nil || f.filterCalls != 1 || f.maxFilters != 1 {
					t.Fatal("normal discovery/fallback invariant failed")
				}
			} else {
				want := "deadline_exceeded"
				if tc.canceled {
					want = "canceled"
				}
				found := false
				for _, event := range trace.events {
					if event.Stage == tc.waitStage && event.ErrorClass == want && event.ContextErr == want {
						found = true
					}
				}
				if !found || phaseErrorClass(trace.finalErr) != "dependency_error" || trace.finalCtx != want {
					t.Fatal("context cause masking was not observed")
				}
			}
		})
	}
}

func TestVoicePhaseFullBudget(t *testing.T) {
	f := &phaseFixture{categoryDelay: 100 * time.Millisecond, filterDelay: 700 * time.Millisecond, productDelay: time.Second}
	trace, status := runVoicePhase(t, context.Background(), f, f, f, gemini.Timeout)
	if middleware.RequestTimeout != 15*time.Second || gemini.Timeout != 8*time.Second || status != 201 || f.filterCalls != 1 || f.maxFilters != 1 {
		t.Fatal("full-budget diagnostic invariant failed")
	}
	for _, event := range trace.events {
		if event.Stage == "service_total" && event.ErrorClass == "none" && event.ContextErr == "none" && event.RemainingMS > 0 {
			return
		}
	}
	t.Fatal("post-fallback budget headroom was not observed")
}

func TestVoicePhaseSanitizedClassification(t *testing.T) {
	if phaseErrorClass(errors.New("private-dependency-sentinel")) != "dependency_error" || phaseContextClass(nil) != "none" {
		t.Fatal("unsafe diagnostic classification")
	}
}
