package voice

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/location"
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"
)

func pointer(v string) *string { return &v }
func testInput() Input {
	return Input{Categories: []catalog.Category{{Slug: "milk"}, {Slug: "sugar"}, {Slug: "eggs"}, {Slug: "oil"}}, Schemas: []catalog.FilterSchema{
		{Category: "milk", Filters: []catalog.FilterDefinition{{Key: "volumeMl", Type: "multi-select", Options: []json.RawMessage{[]byte("500"), []byte("1000")}}, {Key: "fatPercent", Type: "multi-select", Options: []json.RawMessage{[]byte("2.5"), []byte("3.2")}}, {Key: "brand", Type: "multi-select", Options: []json.RawMessage{[]byte(`"Brand"`)}}, {Key: "lactoseFree", Type: "boolean"}}},
		{Category: "sugar", Filters: []catalog.FilterDefinition{}}}}
}
func TestNLPValidation(t *testing.T) {
	in := testInput()
	tests := []struct {
		name, raw string
		valid     bool
	}{
		{"valid", `{"intent":"cheapest","category":"milk","filters":{"volumeMl":1000,"fatPercent":3.2}}`, true},
		{"null", `{"intent":null,"category":null,"filters":{}}`, true},
		{"null filter", `{"intent":null,"category":"milk","filters":{"volumeMl":null}}`, true},
		{"boolean", `{"intent":null,"category":"milk","filters":{"lactoseFree":false}}`, true},
		{"bad intent", `{"intent":"buy","category":"milk","filters":{}}`, false},
		{"bad category", `{"intent":null,"category":"phones","filters":{}}`, false},
		{"bad key", `{"intent":null,"category":"milk","filters":{"price":1}}`, false},
		{"wrong category", `{"intent":null,"category":"sugar","filters":{"volumeMl":1000}}`, false},
		{"wrong category null filler", `{"intent":null,"category":"sugar","filters":{"volumeMl":null}}`, false},
		{"wrong type", `{"intent":null,"category":"milk","filters":{"volumeMl":"1000"}}`, false},
		{"wrong option", `{"intent":null,"category":"milk","filters":{"volumeMl":900}}`, false},
		{"wrong string option", `{"intent":null,"category":"milk","filters":{"brand":"other"}}`, false},
		{"extra", `{"intent":null,"category":null,"filters":{},"store":"x"}`, false},
		{"nested", `{"intent":null,"category":"milk","filters":{"volumeMl":{}}}`, false},
		{"infinity", `{"intent":null,"category":"milk","filters":{"volumeMl":1e999}}`, false},
		{"array", `{"intent":null,"category":null,"filters":[]}`, false},
		{"missing", `{"intent":null,"filters":{}}`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Validate([]byte(tt.raw), in)
			if (err == nil) != tt.valid {
				t.Fatal("validation mismatch")
			}
		})
	}
	in.CurrentCategory = pointer("milk")
	if _, err := Validate([]byte(`{"intent":null,"category":null,"filters":{"volumeMl":1000}}`), in); err != nil {
		t.Fatal("current category rejected")
	}
}
func TestFallback(t *testing.T) {
	for _, tt := range []struct{ name, text, category, intent, filters string }{
		{"cheapest", "найди самое дешёвое молоко", "milk", "cheapest", `{}`},
		{"search", "покажи цены на молоко", "milk", "search", `{}`},
		{"one liter", "один литр, 3.2 процента", "", "", `{"volumeMl":1000,"fatPercent":3.2}`},
		{"comma", "1 л 2,5%", "", "", `{"volumeMl":1000,"fatPercent":2.5}`},
		{"500 unsupported fat", "500 мл и 6%", "", "", `{"volumeMl":500}`},
		{"unknown", "неизвестный товар", "", "", `{}`},
		{"eggs", "найди яйца", "eggs", "search", `{}`},
		{"unsupported bread", "найди хлеб", "", "search", `{}`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			in := testInput()
			in.Text = tt.text
			in.CurrentCategory = pointer("milk")
			p, err := (Fallback{}).Parse(context.Background(), in)
			if err != nil {
				t.Fatal("parse failed")
			}
			str := func(v *string) string {
				if v == nil {
					return ""
				}
				return *v
			}
			var want map[string]json.RawMessage
			_ = json.Unmarshal([]byte(tt.filters), &want)
			if str(p.Intent) != tt.intent || str(p.Category) != tt.category || !reflect.DeepEqual(p.Filters, want) {
				t.Fatal("fallback mismatch")
			}
		})
	}
}
func TestState(t *testing.T) {
	for _, tc := range []struct{ missing, want []string }{
		{[]string{"intent", "category", "volumeMl", "fatPercent"}, []string{"intent"}},
		{[]string{"category", "volumeMl", "fatPercent"}, []string{"category"}},
		{[]string{"volumeMl", "fatPercent"}, []string{"volumeMl", "fatPercent"}},
		{[]string{"volumeMl"}, []string{"volumeMl"}},
		{[]string{"fatPercent"}, []string{"fatPercent"}},
	} {
		if !reflect.DeepEqual(QuestionFields(tc.missing), tc.want) || Question(tc.missing) != Question(tc.want) {
			t.Fatal("expected fields differ from current question")
		}
	}
	for _, tt := range []struct {
		name     string
		state    Session
		missing  []string
		question string
	}{
		{"intent", Session{Parsed: Parsed{Category: pointer("sugar")}}, []string{"intent"}, "Что нужно сделать: найти цены или самый дешёвый товар?"},
		{"category", Session{Parsed: Parsed{Intent: pointer("search")}}, []string{"category"}, "Какой товар вы ищете?"},
		{"both", Session{Parsed: Parsed{Intent: pointer("search"), Category: pointer("milk")}}, []string{"volumeMl", "fatPercent"}, "Какой объём и жирность молока вам нужны?"},
		{"volume", Session{Parsed: Parsed{Intent: pointer("search"), Category: pointer("milk"), Filters: map[string]json.RawMessage{"fatPercent": []byte("3.2")}}}, []string{"volumeMl"}, "Какой объём молока вам нужен?"},
		{"fat", Session{Parsed: Parsed{Intent: pointer("search"), Category: pointer("milk"), Filters: map[string]json.RawMessage{"volumeMl": []byte("1000")}}}, []string{"fatPercent"}, "Какая жирность молока вам нужна?"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got := Missing(tt.state)
			if !reflect.DeepEqual(got, tt.missing) || Question(got) != tt.question {
				t.Fatal("clarification mismatch")
			}
		})
	}
	previous := Session{Parsed: Parsed{Intent: pointer("cheapest"), Category: pointer("milk"), Filters: map[string]json.RawMessage{"volumeMl": []byte("500"), "old": []byte("true")}}, Latitude: 1, Longitude: 2}
	update := Parsed{Intent: pointer("search"), Filters: map[string]json.RawMessage{"volumeMl": []byte("1000"), "fatPercent": []byte("null"), "evil": []byte("1")}}
	merged := Merge(previous, update, testInput().Schemas)
	if *merged.Intent != "cheapest" || merged.Latitude != 1 || merged.Longitude != 2 || len(merged.Filters) != 1 || string(merged.Filters["volumeMl"]) != "1000" {
		t.Fatal("merge mismatch")
	}
	update.Category = pointer("sugar")
	if len(Merge(previous, update, testInput().Schemas).Filters) != 0 {
		t.Fatal("changed category retained filters")
	}
	if len(Missing(Session{Parsed: Parsed{Intent: pointer("search"), Category: pointer("eggs")}})) != 0 {
		t.Fatal("invented requirement")
	}
}

type fixtures struct {
	fatOption                   bool
	query                       catalog.ProductQuery
	productCalls, locationCalls int
	empty                       bool
}

func (f *fixtures) ListCategories(context.Context) ([]catalog.Category, error) {
	return testInput().Categories, nil
}
func (f *fixtures) GetFilterSchema(_ context.Context, slug string) (catalog.FilterSchema, error) {
	for _, s := range testInput().Schemas {
		if s.Category == slug {
			if f.fatOption && slug == "milk" {
				s.Filters[1].Options = append(s.Filters[1].Options, json.RawMessage("1.5"))
			}
			return s, nil
		}
	}
	return catalog.FilterSchema{Category: slug, Filters: []catalog.FilterDefinition{}}, nil
}
func (f *fixtures) ListProducts(_ context.Context, q catalog.ProductQuery) ([]catalog.Product, error) {
	f.query = q
	f.productCalls++
	if f.empty {
		return []catalog.Product{}, nil
	}
	out := []catalog.Product{}
	for i := 0; i < q.Limit; i++ {
		out = append(out, catalog.Product{Name: "Product", ImageURL: nil, Offers: []catalog.Offer{{StoreCode: catalog.DINA, StoreName: "Dina", Price: 570 + i}}})
	}
	return out, nil
}
func (f *fixtures) GetProductByID(context.Context, string) (catalog.Product, error) {
	return catalog.Product{}, catalog.ErrNotFound
}
func (f *fixtures) ListLocations(context.Context) ([]location.Location, error) {
	f.locationCalls++
	return []location.Location{{StoreCode: catalog.DANA, Address: "wrong chain"}, {StoreCode: catalog.DINA, Address: "nearest", Latitude: 1, Longitude: 2}}, nil
}

type memory struct {
	states        map[string]Session
	fail          string
	ttl           time.Duration
	sets, deletes int
}

func (m *memory) Get(_ context.Context, id string) (Session, bool, error) {
	if m.fail == "get" {
		return Session{}, false, ErrSessionUnavailable
	}
	s, ok := m.states[id]
	return s, ok, nil
}
func (m *memory) Set(_ context.Context, id string, s Session, ttl time.Duration) error {
	if m.fail == "set" {
		return ErrSessionUnavailable
	}
	m.states[id] = s
	m.ttl = ttl
	m.sets++
	return nil
}
func (m *memory) Delete(_ context.Context, id string) error {
	if m.fail == "delete" {
		return ErrSessionUnavailable
	}
	delete(m.states, id)
	m.deletes++
	return nil
}

type capturingParser func(context.Context, Input) (Parsed, error)

func (p capturingParser) Parse(ctx context.Context, in Input) (Parsed, error) { return p(ctx, in) }

func TestClarificationNLPContext(t *testing.T) {
	f := &fixtures{fatOption: true}
	m := &memory{states: map[string]Session{}}
	calls := 0
	s := &Service{Sessions: m, Categories: f, Products: f, Locations: f}
	s.Parser = capturingParser(func(_ context.Context, in Input) (Parsed, error) {
		calls++
		if calls == 1 {
			if in.CurrentCategory != nil || len(in.ExpectedFields) != 0 {
				t.Fatal("start leaked prior state")
			}
			return Validate([]byte(`{"intent":"cheapest","category":"milk","filters":{}}`), in)
		}
		if in.CurrentCategory == nil || *in.CurrentCategory != "milk" || !reflect.DeepEqual(in.ExpectedFields, []string{"volumeMl", "fatPercent"}) {
			t.Fatal("backend missing-field hint lost")
		}
		return Validate([]byte(`{"intent":null,"category":null,"filters":{"volumeMl":1000,"fatPercent":1.5}}`), in)
	})
	start, err := s.Start(context.Background(), StartRequest{Text: "самое дешёвое молоко", Latitude: 1, Longitude: 2})
	if err != nil || start.Status != "needs_clarification" {
		t.Fatal("start failed")
	}
	result, err := s.Continue(context.Background(), ContinueRequest{SessionID: start.SessionID, Text: "один литр 1.5 процента"})
	if err != nil || result.Mode != "single" || f.query.Category != "milk" || f.query.Limit != 1 || string(f.query.Filters["volumeMl"][0]) != "1000" || string(f.query.Filters["fatPercent"][0]) != "1.5" || m.ttl != SessionTTL || m.deletes != 1 {
		t.Fatal("clarification merge/state regression")
	}
}

func TestServiceFlow(t *testing.T) {
	ctx := context.Background()
	f := &fixtures{}
	m := &memory{states: map[string]Session{}}
	s := &Service{Parser: Fallback{}, Sessions: m, Categories: f, Products: f, Locations: f}
	start, err := s.Start(ctx, StartRequest{Text: "самое дешёвое молоко", Latitude: 1, Longitude: 2})
	if err != nil || start.Status != "needs_clarification" || start.SessionID == "" || m.ttl != SessionTTL {
		t.Fatal("start failed")
	}
	middle, err := s.Continue(ctx, ContinueRequest{start.SessionID, "1 литр"})
	if err != nil || middle.SessionID != start.SessionID || m.sets != 2 {
		t.Fatal("refresh failed")
	}
	result, err := s.Continue(ctx, ContinueRequest{start.SessionID, "3.2%"})
	if err != nil || result.Mode != "single" || len(result.Items) != 1 || result.Items[0].Address == nil || *result.Items[0].Address != "nearest" || *result.Items[0].DistanceMeters != 0 || m.deletes != 1 {
		t.Fatal("completion failed")
	}
	if result.Speech != "Самое выгодное предложение: Product за 570 тенге в Dina. Ближайшая точка — nearest, примерно 0 метров." {
		t.Fatal("speech mismatch")
	}
	if _, err := s.Continue(ctx, ContinueRequest{start.SessionID, "ещё"}); !errors.Is(err, ErrNotFound) {
		t.Fatal("completed session retained")
	}
	list, err := s.Start(ctx, StartRequest{Text: "найди молоко 1 литр 3.2%"})
	if err != nil || list.Mode != "list" || len(list.Items) != 3 || f.query.Limit != 3 || f.query.Sort != catalog.PriceAsc || f.locationCalls != 2 {
		t.Fatal("bounded result mismatch")
	}
	if list.Speech != "Нашёл 3 варианта. Первый — Product за 570 тенге в Dina. Второй — Product за 571 тенге в Dina. Третий — Product за 572 тенге в Dina." {
		t.Fatal("list speech mismatch")
	}
	f.empty = true
	empty, err := s.Start(ctx, StartRequest{Text: "найди сахар"})
	if err != nil || empty.Items == nil || len(empty.Items) != 0 || empty.Speech != "Подходящих товаров не найдено." {
		t.Fatal("zero mismatch")
	}
}
func TestSessionFailures(t *testing.T) {
	for _, failure := range []string{"set", "get", "delete"} {
		t.Run(failure, func(t *testing.T) {
			f := &fixtures{}
			m := &memory{states: map[string]Session{}, fail: failure}
			s := &Service{Parser: Fallback{}, Sessions: m, Categories: f, Products: f, Locations: f}
			var err error
			switch failure {
			case "set":
				_, err = s.Start(context.Background(), StartRequest{Text: "молоко"})
			case "get":
				_, err = s.Continue(context.Background(), ContinueRequest{"opaque", "1 литр"})
			case "delete":
				m.states["opaque"] = Session{Parsed: Parsed{Intent: pointer("search"), Category: pointer("sugar"), Filters: map[string]json.RawMessage{}}}
				_, err = s.Continue(context.Background(), ContinueRequest{"opaque", "сахар"})
			}
			if !errors.Is(err, ErrSessionUnavailable) {
				t.Fatal("session failure not controlled")
			}
		})
	}
}
func TestMeters(t *testing.T) {
	for _, tt := range []struct {
		n    int
		want string
	}{{1, "метр"}, {2, "метра"}, {4, "метра"}, {5, "метров"}, {11, "метров"}, {12, "метров"}, {14, "метров"}, {21, "метр"}, {22, "метра"}} {
		if metersWord(tt.n) != tt.want {
			t.Fatal("pluralization")
		}
	}
}
