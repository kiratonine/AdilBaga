import { screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardDto } from '../../api/types'
import { summarizeBaskets } from '../../lib/baskets'
import dashboardMock from '../../mocks/dashboard.json'
import { renderPage } from '../../test/render'
import StoreMap from './StoreMap'

const dashboard = dashboardMock as DashboardDto

// Verify the Leaflet component contract without downloading tiles in unit tests.
vi.mock('react-leaflet', () => ({
  MapContainer: vi.fn(({ children }: PropsWithChildren) => <div>{children}</div>),
  TileLayer: vi.fn(() => null),
  CircleMarker: vi.fn(({ children }: PropsWithChildren) => <div>{children}</div>),
  Popup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Tooltip: ({ children }: PropsWithChildren) => <div>{children}</div>,
  AttributionControl: () => null,
}))

describe('StoreMap tile privacy and unchanged map contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the official HTTPS endpoint and an image-scoped origin-only referrer policy', () => {
    renderPage(<StoreMap locations={[]} label="Store map" />)
    expect(vi.mocked(TileLayer).mock.calls[0][0]).toMatchObject({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    expect(vi.mocked(MapContainer).mock.calls[0][0]).toMatchObject({
      center: [43.665, 51.17], zoom: 12, scrollWheelZoom: false, attributionControl: false,
    })
  })

  it('preserves bounds, every store marker and basket/address popup content', () => {
    const baskets = summarizeBaskets(dashboard.baskets)
    renderPage(<StoreMap locations={dashboard.locations} baskets={baskets} label="Store map" />)
    expect(screen.getByRole('region', { name: 'Store map' })).toBeInTheDocument()
    expect(vi.mocked(MapContainer).mock.calls[0][0]).toMatchObject({
      bounds: dashboard.locations.map((location) => [location.latitude, location.longitude]),
      boundsOptions: { padding: [32, 32] }, center: undefined, zoom: undefined, scrollWheelZoom: false,
    })
    expect(vi.mocked(CircleMarker).mock.calls).toHaveLength(dashboard.locations.length)
    dashboard.locations.forEach((location, index) => {
      expect(vi.mocked(CircleMarker).mock.calls[index][0]).toMatchObject({
        center: [location.latitude, location.longitude], radius: 8, className: 'store-marker',
        pathOptions: { color: '#ffffff', weight: 2, fillOpacity: 1 },
      })
      expect(screen.getAllByText(location.address).length).toBeGreaterThan(0)
      expect(screen.getAllByText(location.storeName).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Корзина:/).length).toBe(dashboard.locations.length)
  })
})
