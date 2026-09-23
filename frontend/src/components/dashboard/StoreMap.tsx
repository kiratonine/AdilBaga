import 'leaflet/dist/leaflet.css'
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'
import { AttributionControl, CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import type { StoreLocationDto } from '../../api/types'
import { locationKey, storeColor } from '../../lib/stores'

/** Центр Актау — если точек нет */
const AKTAU: LatLngTuple = [43.665, 51.17]

type Props = {
  locations: StoreLocationDto[]
  label: string
}

/** Карта точек магазинов (Leaflet + OpenStreetMap). Грузится лениво, чтобы не раздувать остальные страницы */
export default function StoreMap({ locations, label }: Props) {
  const bounds: LatLngBoundsExpression | undefined =
    locations.length > 1 ? locations.map((l) => [l.latitude, l.longitude] as LatLngTuple) : undefined
  const center: LatLngTuple = locations.length === 1 ? [locations[0].latitude, locations[0].longitude] : AKTAU

  return (
    // isolate: z-index панелей Leaflet (до 1000) не должен перекрывать sticky-шапку
    <div data-testid="store-map" role="region" aria-label={label} className="isolate h-full overflow-hidden rounded-[var(--radius-card)] bg-surface">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [32, 32] }}
        center={bounds ? undefined : center}
        zoom={bounds ? undefined : 12}
        scrollWheelZoom={false}
        attributionControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <AttributionControl prefix={false} />
        {locations.map((location) => (
          <CircleMarker
            key={locationKey(location)}
            center={[location.latitude, location.longitude]}
            radius={8}
            className="store-marker"
            // Белое кольцо отделяет маркер от подложки и соседних маркеров
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: storeColor(location.storeCode), fillOpacity: 1 }}
          >
            <Popup>
              <strong className="block text-[14px]">{location.storeName}</strong>
              <span className="block text-[13px]">{location.address}</span>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
