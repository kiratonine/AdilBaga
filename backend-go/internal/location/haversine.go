package location

import (
	"adilbaga/backend-go/internal/catalog"
	"context"
	"math"
)

type Location struct {
	StoreCode           catalog.StoreCode
	Address             string
	Latitude, Longitude float64
}
type Repository interface {
	ListLocations(context.Context) ([]Location, error)
}

func Haversine(lat1, lon1, lat2, lon2 float64) float64 {
	radians := func(d float64) float64 { return d * math.Pi / 180 }
	a := math.Pow(math.Sin(radians(lat2-lat1)/2), 2) + math.Cos(radians(lat1))*math.Cos(radians(lat2))*math.Pow(math.Sin(radians(lon2-lon1)/2), 2)
	return 2 * 6371000 * math.Asin(math.Sqrt(math.Min(1, a)))
}
func Nearest(lat, lon float64, chain catalog.StoreCode, locations []Location) (*Location, float64) {
	var nearest *Location
	distance := 0.0
	for i := range locations {
		l := &locations[i]
		if l.StoreCode != chain {
			continue
		}
		d := Haversine(lat, lon, l.Latitude, l.Longitude)
		if nearest == nil || d < distance {
			nearest = l
			distance = d
		}
	}
	return nearest, distance
}
