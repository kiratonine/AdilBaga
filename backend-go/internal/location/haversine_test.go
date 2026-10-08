package location

import (
	"adilbaga/backend-go/internal/catalog"
	"math"
	"testing"
)

func TestLocation(t *testing.T) {
	if Haversine(0, 0, 0, 0) != 0 {
		t.Fatal("same point")
	}
	if math.Abs(Haversine(0, 0, 1, 0)-111194.9266) > 0.1 {
		t.Fatal("known distance")
	}
	points := []Location{{StoreCode: catalog.DINA, Address: "far", Latitude: 1}, {StoreCode: catalog.DINA, Address: "first"}, {StoreCode: catalog.DINA, Address: "tie"}, {StoreCode: catalog.DANA, Address: "other"}}
	l, d := Nearest(0, 0, catalog.DINA, points)
	if l == nil || l.Address != "first" || d != 0 {
		t.Fatal("nearest tie")
	}
	if l, _ := Nearest(0, 0, catalog.DINA, nil); l != nil {
		t.Fatal("empty")
	}
}
