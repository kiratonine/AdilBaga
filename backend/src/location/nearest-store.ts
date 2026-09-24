import type { DashboardDto } from '../contracts/catalog';
import { haversineMeters } from './haversine';

export type StoreLocation = DashboardDto['locations'][number];

export function nearestStore(
  latitude: number,
  longitude: number,
  locations: StoreLocation[],
): { location: StoreLocation; distanceMeters: number } | null {
  let nearest: { location: StoreLocation; distanceMeters: number } | null = null;
  for (const location of locations) {
    const distanceMeters = haversineMeters(
      latitude, longitude, location.latitude, location.longitude,
    );
    if (!nearest || distanceMeters < nearest.distanceMeters) nearest = { location, distanceMeters };
  }
  return nearest;
}
