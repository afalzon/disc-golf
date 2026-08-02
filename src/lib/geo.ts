import type { LatLng } from '../types/course'

const EARTH_RADIUS_M = 6371000

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

const normalizeBearing = (bearing: number): number => (bearing + 360) % 360

export const distanceMeters = (from: LatLng, to: LatLng): number => {
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

export const bearingDegrees = (from: LatLng, to: LatLng): number => {
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const dLng = toRadians(to.lng - from.lng)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  return normalizeBearing((Math.atan2(y, x) * 180) / Math.PI)
}

export const bearingToCompass = (bearing: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const index = Math.round(normalizeBearing(bearing) / 45) % 8
  return directions[index]
}
