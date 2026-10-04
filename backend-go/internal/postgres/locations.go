package postgres

import (
	"adilbaga/backend-go/internal/location"
	"context"
)

const locationsSQL = `SELECT s.code,l.address,l.latitude,l.longitude FROM public.store_locations l JOIN public.stores s ON s.id=l."storeId" ORDER BY s.code,l.name,l.id`

func (r *Repository) ListLocations(ctx context.Context) ([]location.Location, error) {
	rows, err := r.db.Query(ctx, locationsSQL)
	if err != nil {
		return nil, databaseError(err)
	}
	defer rows.Close()
	out := []location.Location{}
	for rows.Next() {
		var l location.Location
		if err := rows.Scan(&l.StoreCode, &l.Address, &l.Latitude, &l.Longitude); err != nil {
			return nil, databaseError(err)
		}
		out = append(out, l)
	}
	if err := rows.Err(); err != nil {
		return nil, databaseError(err)
	}
	return out, nil
}
