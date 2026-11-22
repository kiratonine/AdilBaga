//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"
	"time"

	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/config"
	"adilbaga/backend-go/internal/httpapi"
	"adilbaga/backend-go/internal/observability"
	"adilbaga/backend-go/internal/postgres"
	"github.com/jackc/pgx/v5"
)

// Run as a subtest of TestDeterministicCatalog inside the approved runner.
// The enclosing disposable fixture owns all rows and performs cleanup.
func testBrandFilters(t *testing.T, ctx context.Context, admin *pgx.Conn, repo *postgres.Repository) {
	if _, err := admin.Exec(ctx, `INSERT INTO categories (id,slug,name,"filterSchema") VALUES
		('brands-dairy','dairy','Dairy','{"filters":[
		  {"key":"brand","label":"Brand","type":"multi-select","options":["BARAKA","Baraka","baraka","3 ЖЕЛАНИЯ","3 Желания","3 желания","DEKMY","Dekmy","ARLA FOODS PUCK","ACTIMEL","Actimel Kids","Baraka Plus","F_O%","F1ox","STALE","ZERO","OLD","UNPUBLISHED",""," ",null,0,true]},
		  {"key":"volumeMl","label":"Volume","type":"multi-select","options":[500,1000,"1000"]},
		  {"key":"organic","label":"Organic","type":"boolean"}]}'),
		('brands-groats','groats','Groats','{"filters":[
		  {"key":"brand","label":"Бренд","type":"multi-select","options":["baraka","ДЕКМЫ","ЁЛКА","ЕЛКА","AБ","АБ"]}]}');
		INSERT INTO snapshots (id,status,"publishedAt") VALUES
		  ('brand-old','published','2026-10-03 11:00:00'),('brand-unpublished','building',NULL);
		INSERT INTO raw_products (id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") VALUES
		  ('brand-raw-old','dina','brand-old','Fixture',100,'brand-old'),
		  ('brand-raw-unpublished','dina','brand-unpublished','Fixture',100,'brand-unpublished')`); err != nil {
		t.Fatal("seed synthetic category and snapshot definitions", err)
	}
	const current = "fixture-internal-v1"
	rows := []struct {
		id, category    string
		brand           any
		attrs           string
		price           int
		stock           bool
		snapshot, rawID string
	}{
		{"b1", "brands-dairy", "BARAKA", `{"volumeMl":500,"organic":true}`, 100, true, current, "r1"},
		{"b2", "brands-dairy", "Baraka", `{"volumeMl":1000,"organic":false}`, 120, true, current, "r1"},
		{"b3", "brands-dairy", "baraka", `{"volumeMl":"1000","organic":false}`, 140, true, current, "r1"},
		{"z1", "brands-dairy", "3 ЖЕЛАНИЯ", `{"volumeMl":500}`, 101, true, current, "r1"},
		{"z2", "brands-dairy", "3 Желания", `{}`, 121, true, current, "r1"},
		{"z3", "brands-dairy", "3 желания", `{}`, 141, true, current, "r1"},
		{"d1", "brands-dairy", "DEKMY", `{}`, 105, true, current, "r1"},
		{"d2", "brands-dairy", "Dekmy", `{}`, 106, true, current, "r1"},
		{"a1", "brands-dairy", "arla foods puck", `{}`, 107, true, current, "r1"},
		{"a2", "brands-dairy", "Actimel", `{}`, 108, true, current, "r1"},
		{"a3", "brands-dairy", "ACTIMEL KIDS", `{}`, 109, true, current, "r1"},
		{"bp", "brands-dairy", "Baraka Plus", `{}`, 110, true, current, "r1"},
		{"f1", "brands-dairy", "F_O%", `{}`, 111, true, current, "r1"},
		{"f2", "brands-dairy", "F1ox", `{}`, 112, true, current, "r1"},
		{"null", "brands-dairy", nil, `{}`, 30, true, current, "r1"},
		{"empty", "brands-dairy", "", `{}`, 31, true, current, "r1"},
		{"blank", "brands-dairy", " ", `{}`, 32, true, current, "r1"},
		{"number", "brands-dairy", "0", `{}`, 33, true, current, "r1"},
		{"bool", "brands-dairy", "true", `{}`, 34, true, current, "r1"},
		{"stale", "brands-dairy", "Stale", `{}`, 90, false, current, "r1"},
		{"bad-price", "brands-dairy", "Zero", `{}`, 0, true, current, "r1"},
		{"old", "brands-dairy", "Old", `{}`, 1, true, "brand-old", "brand-raw-old"},
		{"unpublished", "brands-dairy", "Unpublished", `{}`, 2, true, "brand-unpublished", "brand-raw-unpublished"},
		{"g1", "brands-groats", "bArAkA", `{}`, 150, true, current, "r1"},
		{"g2", "brands-groats", "декмы", `{}`, 151, true, current, "r1"},
		{"g3", "brands-groats", "ЁЛКА", `{}`, 152, true, current, "r1"},
		{"g4", "brands-groats", "ЕЛКА", `{}`, 153, true, current, "r1"},
		{"g5", "brands-groats", "AБ", `{}`, 154, true, current, "r1"},
		{"g6", "brands-groats", "АБ", `{}`, 155, true, current, "r1"},
	}
	for _, row := range rows {
		if _, err := admin.Exec(ctx, `INSERT INTO canonical_products (id,name,brand,"categoryId",attributes)
			VALUES ($1,$1,$2,$3,$4::jsonb)`, row.id, row.brand, row.category, row.attrs); err != nil {
			t.Fatal("seed synthetic brand product", err)
		}
		if _, err := admin.Exec(ctx, `INSERT INTO offers (id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId")
			VALUES ('brand-' || $1,$1,$2,'dina',$3,$4,'2026-10-05 11:00:00',$5)`, row.id, row.rawID, row.price, row.stock, row.snapshot); err != nil {
			t.Fatal("seed synthetic offer", err)
		}
	}
	if _, err := admin.Exec(ctx, `INSERT INTO offers (id,"canonicalProductId","rawProductId","storeId",price,"inStock","snapshotAt","snapshotId") VALUES
		('brand-b1-alt','b1','r2','dana',115,true,'2026-10-05 12:00:00','fixture-internal-v1'),
		('brand-b1-old','b1','brand-raw-old','dina',1,true,'2026-10-03 11:00:00','brand-old')`); err != nil {
		t.Fatal("seed synthetic secondary offers", err)
	}
	for _, value := range []string{"BARAKA", "3 ЖЕЛАНИЯ", "ЁЛКА", "ÉCLAIR", "ẞ", "İ", "ΟΣ"} {
		var lower string
		if err := admin.QueryRow(ctx, `SELECT lower($1::text COLLATE pg_catalog."pg_c_utf8")`, value).Scan(&lower); err != nil || lower != catalog.BrandKey(value) {
			t.Fatalf("PostgreSQL/Go lowercase mismatch for %q: %q, %v", value, lower, err)
		}
	}

	handler := httpapi.Router(config.Config{RateRPS: 1000, RateBurst: 1000}, observability.New(io.Discard, "info"),
		httpapi.Dependencies{Categories: repo, Products: repo})
	get := func(path string, status int, result any) {
		t.Helper()
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil).WithContext(ctx))
		if w.Code != status {
			t.Fatalf("%s: HTTP %d, want %d", path, w.Code, status)
		}
		if result != nil && json.Unmarshal(w.Body.Bytes(), result) != nil {
			t.Fatalf("%s: invalid JSON", path)
		}
	}
	for _, tc := range []struct {
		category string
		want     []json.RawMessage
	}{
		{"dairy", raw(`"Baraka"`, `"3 Желания"`, `"Dekmy"`, `"Arla Foods Puck"`, `"Actimel"`, `"Actimel Kids"`, `"Baraka Plus"`, `"F_o%"`, `"F1ox"`)},
		{"groats", raw(`"Baraka"`, `"Декмы"`, `"Ёлка"`, `"Елка"`, `"Aб"`, `"Аб"`)},
	} {
		var schema catalog.FilterSchema
		get("/api/categories/"+tc.category+"/filters", 200, &schema)
		if schema.Category != tc.category || len(schema.Filters) == 0 ||
			schema.Filters[0].Key != "brand" || schema.Filters[0].Type != "multi-select" ||
			!reflect.DeepEqual(schema.Filters[0].Options, tc.want) {
			t.Fatalf("%s options = %+v, want %s", tc.category, schema.Filters, tc.want)
		}
		if tc.category == "dairy" && (len(schema.Filters) != 3 ||
			!reflect.DeepEqual(schema.Filters[1].Options, raw(`500`, `1000`, `"1000"`)) || schema.Filters[2].Type != "boolean") {
			t.Fatal("non-brand discovery changed")
		}
	}
	query := func(values url.Values, want ...string) []catalog.Product {
		t.Helper()
		var products []catalog.Product
		get("/api/products?"+values.Encode(), 200, &products)
		if !reflect.DeepEqual(ids(products), want) {
			t.Fatalf("%s: IDs = %v, want %v", values.Encode(), ids(products), want)
		}
		return products
	}
	for _, spelling := range []string{"Baraka", "BARAKA", "baraka"} {
		products := query(url.Values{"category": {"dairy"}, "brand": {spelling}}, "b1", "b2", "b3")
		for i, want := range []string{"BARAKA", "Baraka", "baraka"} {
			if products[i].Brand == nil || *products[i].Brand != want {
				t.Fatal("product DTO brand changed")
			}
		}
		first := products[0]
		if first.MinPrice != 100 || len(first.Offers) != 2 || first.Offers[0].Price != 100 ||
			first.Offers[1].Price != 115 || first.SnapshotAt.Format(time.RFC3339) != "2026-10-05T12:00:00Z" {
			t.Fatal("current usable offers, minimum or snapshot changed")
		}
	}
	query(url.Values{"category": {"dairy"}, "brand": {"3 Желания"}}, "z1", "z2", "z3")
	query(url.Values{"category": {"dairy"}, "brand": {"3 ЖЕЛАНИЯ"}}, "z1", "z2", "z3")
	query(url.Values{"category": {"dairy"}, "brand": {"Dekmy"}}, "d1", "d2")
	query(url.Values{"category": {"dairy"}, "brand": {"Arla Foods Puck"}}, "a1")
	query(url.Values{"category": {"dairy"}, "brand": {"Actimel"}}, "a2")
	query(url.Values{"category": {"dairy"}, "brand": {"Actimel Kids"}}, "a3")
	query(url.Values{"category": {"dairy"}, "brand": {"F_o%"}}, "f1")
	query(url.Values{"category": {"dairy"}, "brand": {"baraka", "3 ЖЕЛАНИЯ"}, "volumeMl": {"500", "1000"}}, "b1", "z1", "b2")
	query(url.Values{"category": {"dairy"}, "brand": {"BARAKA"}, "organic": {"false"}}, "b2", "b3")
	query(url.Values{"category": {"dairy"}, "brand": {"BARAKA"}, "search": {"bArAkA"}, "sort": {"price_desc"}, "limit": {"1"}, "offset": {"1"}}, "b2")
	for _, row := range []struct{ brand, id string }{{"Baraka", "g1"}, {"Декмы", "g2"}, {"ёлка", "g3"}, {"елка", "g4"}, {"Aб", "g5"}, {"Аб", "g6"}} {
		query(url.Values{"category": {"groats"}, "brand": {row.brand}}, row.id)
	}
	for _, invalid := range []url.Values{
		{"brand": {"Baraka"}},
		{"category": {"dairy"}, "unsupported": {"Baraka"}},
		{"category": {"dairy"}, "brand": {"Baraka"}, "volumeMl": {"5e2"}},
		{"category": {"dairy"}, "brand": {"Baraka"}, "organic": {"FALSE"}},
	} {
		get("/api/products?"+invalid.Encode(), 400, nil)
	}
	for _, denied := range []string{"unknown", "STALE", "ZERO", "Old", "UNPUBLISHED", "", " ", "0", "true", " Baraka"} {
		get("/api/products?"+url.Values{"category": {"dairy"}, "brand": {denied}}.Encode(), 400, nil)
	}
	for _, value := range raw(`null`, `true`, `0`, `{}`) {
		q := catalog.ProductQuery{Category: "dairy", Filters: catalog.DynamicFilter{"brand": {value}}}
		if _, err := repo.ListProducts(ctx, q); !errors.Is(err, catalog.ErrInvalidQuery) {
			t.Fatalf("direct brand filter accepted %s", value)
		}
	}

	voiceRepo := repo.WithExactBrandFilters()
	voiceSchema, err := voiceRepo.GetFilterSchema(ctx, "dairy")
	if err != nil || len(voiceSchema.Filters) == 0 || len(voiceSchema.Filters[0].Options) < 3 ||
		!reflect.DeepEqual(voiceSchema.Filters[0].Options[:3], raw(`"BARAKA"`, `"Baraka"`, `"baraka"`)) {
		t.Fatal("Voice options must retain their exact stored spellings")
	}
	q := catalog.ProductQuery{Category: "dairy", Filters: catalog.DynamicFilter{"brand": raw(`"BARAKA"`)}}
	if products, err := voiceRepo.ListProducts(ctx, q); err != nil || !reflect.DeepEqual(ids(products), []string{"b1"}) {
		t.Fatal("Voice product matching must retain exact stored spelling")
	}
}
