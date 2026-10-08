package httpapi

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/middleware"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"net/http"
	"net/url"
	"strings"
)

// Match Date.toISOString precision without changing repository time.Time.
type productWire struct {
	catalog.Product
	SnapshotAt string `json:"snapshotAt"`
}

func wireProduct(p catalog.Product) productWire {
	return productWire{p, p.SnapshotAt.UTC().Format("2006-01-02T15:04:05.000Z")}
}
func respond(w http.ResponseWriter, value any, err error) {
	if err != nil {
		status := 500
		if errors.Is(err, catalog.ErrNotFound) {
			status = 404
		} else if errors.Is(err, catalog.ErrInvalidQuery) {
			status = 400
		}
		middleware.WriteError(w, status)
		return
	}
	raw, err := json.Marshal(value)
	if err != nil {
		middleware.WriteError(w, 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}
func (d Dependencies) categories(w http.ResponseWriter, r *http.Request) {
	value, err := d.Categories.ListCategories(r.Context())
	respond(w, value, err)
}
func (d Dependencies) filters(w http.ResponseWriter, r *http.Request) {
	value, err := d.Categories.GetFilterSchema(r.Context(), chi.URLParam(r, "slug"))
	respond(w, value, err)
}
func (d Dependencies) products(w http.ResponseWriter, r *http.Request) {
	raw, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		respond(w, nil, catalog.ErrInvalidQuery)
		return
	}
	var definitions []catalog.FilterDefinition
	if category := raw["category"]; hasDynamicProductFilters(raw) && len(category) == 1 && strings.TrimSpace(category[0]) != "" {
		schema, err := d.Categories.GetFilterSchema(r.Context(), strings.TrimSpace(category[0]))
		if err != nil && !errors.Is(err, catalog.ErrNotFound) {
			respond(w, nil, err)
			return
		}
		definitions = schema.Filters
	}
	q, err := parseProductQuery(raw, definitions)
	if err != nil {
		respond(w, nil, err)
		return
	}
	products, err := d.Products.ListProducts(r.Context(), q)
	if err != nil {
		respond(w, nil, err)
		return
	}
	out := make([]productWire, 0, len(products))
	for _, p := range products {
		out = append(out, wireProduct(p))
	}
	respond(w, out, nil)
}
func (d Dependencies) product(w http.ResponseWriter, r *http.Request) {
	p, err := d.Products.GetProductByID(r.Context(), chi.URLParam(r, "id"))
	respond(w, wireProduct(p), err)
}
func (d Dependencies) dashboard(w http.ResponseWriter, r *http.Request) {
	value, err := d.Dashboard.GetDashboard(r.Context())
	respond(w, value, err)
}
