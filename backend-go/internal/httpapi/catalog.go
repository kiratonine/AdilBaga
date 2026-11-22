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
func respondRequest(w http.ResponseWriter, r *http.Request, value any, err error) {
	if middleware.HandleRequestError(w, r, err) {
		return
	}
	respond(w, value, err)
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
	respondRequest(w, r, value, err)
}
func (d Dependencies) filters(w http.ResponseWriter, r *http.Request) {
	value, err := d.Categories.GetFilterSchema(r.Context(), chi.URLParam(r, "slug"))
	respondRequest(w, r, value, err)
}
func (d Dependencies) products(w http.ResponseWriter, r *http.Request) {
	raw, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		respondRequest(w, r, nil, catalog.ErrInvalidQuery)
		return
	}
	var products []catalog.Product
	if category := raw["category"]; hasDynamicProductFilters(raw) && len(category) == 1 && strings.TrimSpace(category[0]) != "" {
		products, err = d.Products.ListProductsWithFilters(r.Context(), strings.TrimSpace(category[0]), func(schema catalog.FilterSchema) (catalog.ProductQuery, error) {
			return parseProductQuery(raw, schema.Filters)
		})
	} else {
		var q catalog.ProductQuery
		q, err = parseProductQuery(raw, nil)
		if err == nil {
			products, err = d.Products.ListProducts(r.Context(), q)
		}
	}
	if err != nil {
		respondRequest(w, r, nil, err)
		return
	}
	out := make([]productWire, 0, len(products))
	for _, p := range products {
		out = append(out, wireProduct(p))
	}
	respondRequest(w, r, out, nil)
}
func (d Dependencies) product(w http.ResponseWriter, r *http.Request) {
	p, err := d.Products.GetProductByID(r.Context(), chi.URLParam(r, "id"))
	respondRequest(w, r, wireProduct(p), err)
}
func (d Dependencies) dashboard(w http.ResponseWriter, r *http.Request) {
	value, err := d.Dashboard.GetDashboard(r.Context())
	respondRequest(w, r, value, err)
}
