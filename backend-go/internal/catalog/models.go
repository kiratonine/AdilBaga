// Package catalog defines read-only domain contracts, without HTTP wiring.
package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var ErrNotFound = errors.New("catalog item not found")
var ErrInvalidQuery = errors.New("invalid catalog query")

type Category struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type CategoryRef struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type FilterDefinition struct {
	Key     string            `json:"key"`
	Label   string            `json:"label"`
	Type    string            `json:"type"`
	Options []json.RawMessage `json:"options,omitempty"`
}
type FilterSchema struct {
	Category string             `json:"category"`
	Filters  []FilterDefinition `json:"filters"`
}
type StoreCode string

const (
	DINA     StoreCode = "DINA"
	DANA     StoreCode = "DANA"
	FixPrice StoreCode = "FIX_PRICE"
)

type Offer struct {
	StoreCode StoreCode `json:"storeCode"`
	StoreName string    `json:"storeName"`
	Price     int       `json:"price"`
	OldPrice  *int      `json:"oldPrice"`
}
type Product struct {
	ID         string                     `json:"id"`
	Name       string                     `json:"name"`
	Brand      *string                    `json:"brand"`
	Category   CategoryRef                `json:"category"`
	ImageURL   *string                    `json:"imageUrl"`
	Attributes map[string]json.RawMessage `json:"attributes"`
	MinPrice   int                        `json:"minPrice"`
	Offers     []Offer                    `json:"offers"`
	SnapshotAt time.Time                  `json:"snapshotAt"`
}
type Sort string

const (
	PriceAsc  Sort = "price_asc"
	PriceDesc Sort = "price_desc"
	NameAsc   Sort = "name_asc"
)

type DynamicFilter map[string][]json.RawMessage
type ProductQuery struct {
	Category string
	Search   string
	Sort     Sort
	Limit    int
	Offset   int64
	Filters  DynamicFilter
}
type CategoryRepository interface {
	ListCategories(context.Context) ([]Category, error)
	GetFilterSchema(context.Context, string) (FilterSchema, error)
}
type ProductRepository interface {
	ListProducts(context.Context, ProductQuery) ([]Product, error)
	GetProductByID(context.Context, string) (Product, error)
}
