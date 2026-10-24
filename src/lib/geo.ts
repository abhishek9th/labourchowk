import type { GeoPoint } from './types'

/** Great-circle distance in km (haversine). Mirrors public.haversine_km in the database. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface Locality {
  city: string
  name: string
  lat: number
  lng: number
}

/**
 * Built-in localities so the app works without a paid geocoding service. The same places are used
 * by the demo seed data. Real deployments can extend this list or plug in a geocoder.
 */
export const LOCALITIES: Locality[] = [
  { city: 'Bengaluru', name: 'Indiranagar', lat: 12.9784, lng: 77.6408 },
  { city: 'Bengaluru', name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  { city: 'Bengaluru', name: 'Jayanagar', lat: 12.9308, lng: 77.5838 },
  { city: 'Bengaluru', name: 'HSR Layout', lat: 12.9116, lng: 77.6389 },
  { city: 'Bengaluru', name: 'Whitefield', lat: 12.9698, lng: 77.75 },
  { city: 'Bengaluru', name: 'Malleshwaram', lat: 13.0035, lng: 77.5646 },
  { city: 'Bengaluru', name: 'Electronic City', lat: 12.8452, lng: 77.6602 },
  { city: 'Delhi', name: 'Laxmi Nagar', lat: 28.6304, lng: 77.2773 },
  { city: 'Delhi', name: 'Dwarka', lat: 28.5921, lng: 77.046 },
  { city: 'Delhi', name: 'Rohini', lat: 28.7495, lng: 77.0565 },
  { city: 'Delhi', name: 'Saket', lat: 28.5245, lng: 77.2066 },
  { city: 'Mumbai', name: 'Andheri', lat: 19.1136, lng: 72.8697 },
  { city: 'Mumbai', name: 'Borivali', lat: 19.2307, lng: 72.8567 },
  { city: 'Mumbai', name: 'Thane', lat: 19.2183, lng: 72.9781 },
]

export function localityLabel(l: Locality): string {
  return `${l.name}, ${l.city}`
}

export function findLocality(label: string): Locality | undefined {
  return LOCALITIES.find((l) => localityLabel(l) === label)
}

export type GeoResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }

/** Browser geolocation. Only ever called from an explicit user click (permission prompt). */
export function requestBrowserLocation(): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ ok: false, reason: 'unsupported' })
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          point: { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location', source: 'gps' },
        }),
      (err) =>
        resolve({
          ok: false,
          reason: err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

export function isPrecise(p: GeoPoint | null): p is GeoPoint & { lat: number; lng: number } {
  return p !== null && p.lat !== null && p.lng !== null
}

/** Human readable distance. Sub-kilometre values are not shown precisely (privacy and honesty). */
export function formatDistance(km: number | null | undefined): string | null {
  if (km === null || km === undefined) return null
  if (km < 1) return '< 1 km'
  return `${km.toFixed(1)} km`
}
