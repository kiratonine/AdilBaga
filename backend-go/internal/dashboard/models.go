// Package dashboard defines analytical baskets, not a user cart.
package dashboard

import (
	"adilbaga/backend-go/internal/catalog"
	"context"
)

type Summary struct {
	CanonicalProducts   int    `json:"canonicalProducts"`
	Stores              int    `json:"stores"`
	MatchedAcrossStores int    `json:"matchedAcrossStores"`
	SnapshotAt          string `json:"snapshotAt"`
}
type PriceSpread struct {
	ProductID         string  `json:"productId"`
	Name              string  `json:"name"`
	MinPrice          int     `json:"minPrice"`
	MaxPrice          int     `json:"maxPrice"`
	DifferencePercent float64 `json:"differencePercent"`
}
type Location struct {
	StoreCode catalog.StoreCode `json:"storeCode"`
	StoreName string            `json:"storeName"`
	Name      string            `json:"name"`
	Address   string            `json:"address"`
	Latitude  float64           `json:"latitude"`
	Longitude float64           `json:"longitude"`
}
type BasketItem struct {
	CategorySlug string  `json:"categorySlug"`
	CategoryName string  `json:"categoryName"`
	ProductID    *string `json:"productId"`
	Name         *string `json:"name"`
	Price        *int    `json:"price"`
}
type Basket struct {
	StoreCode catalog.StoreCode `json:"storeCode"`
	StoreName string            `json:"storeName"`
	Total     int               `json:"total"`
	Items     []BasketItem      `json:"items"`
}
type Dashboard struct {
	Summary      Summary       `json:"summary"`
	PriceSpreads []PriceSpread `json:"priceSpreads"`
	Locations    []Location    `json:"locations"`
	Baskets      []Basket      `json:"baskets"`
}
type Repository interface {
	GetDashboard(context.Context) (Dashboard, error)
}
