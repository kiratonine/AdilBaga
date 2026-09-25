import 'leaflet/dist/leaflet.css'
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'
import { useTranslation } from 'react-i18next'
import { AttributionControl, CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet'
import type { StoreLocationDto } from '../../api/types'
import type { BasketSummary } from '../../lib/baskets'
import { formatPrice } from '../../lib/format'
import { locationKey, storeColor } from '../../lib/stores'

// Точки стоят плотно — на подписи только сумма; «неполная» — стилем, словом — в popup и в списке рядом
function basketLabelClass(basket: BasketSummary) {
  if (basket.best) return 'basket-label basket-label--best'
  return basket.missing > 0 ? 'basket-label basket-label--partial' : 'basket-label'
}

/** Центр Актау — если точек нет */
const AKTAU: LatLngTuple = [43.665, 51.17]

type Props = {
  locations: StoreLocationDto[]
  /** Сумма корзины сети — подписью у каждой её точки */
  baskets?: BasketSummary[]
  label: string
}

/** Карта точек магазинов (Leaflet + OpenStreetMap). Грузится лениво, чтобы не раздувать остальные страницы */
export default function StoreMap({ locations, baskets = [], label }: Props) {
  const { t } = useTranslation()
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
        {locations.map((location) => {
          const basket = baskets.find((b) => b.storeCode === location.storeCode)
          return (
            <CircleMarker
              key={locationKey(location)}
              center={[location.latitude, location.longitude]}
              radius={8}
              className="store-marker"
              // Белое кольцо отделяет маркер от подложки и соседних маркеров
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: storeColor(location.storeCode), fillOpacity: 1 }}
            >
              {basket && (
                <Tooltip permanent direction="top" offset={[0, -8]} className={basketLabelClass(basket)}>
                  {formatPrice(basket.total)}
                </Tooltip>
              )}
              <Popup>
                <strong className="block text-[14px]">{location.storeName}</strong>
                <span className="block text-[13px]">{location.address}</span>
                {basket && (
                  <span className="mt-1 block text-[13px]">
                    {t('dashboard.basketOnMap', { amount: formatPrice(basket.total) })}
                    {basket.missing > 0 && ` · ${t('dashboard.basketIncomplete')}`}
                  </span>
                )}
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
