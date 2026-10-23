import type { Course } from '../types/course'

const TILE_CACHE = 'disc-golf-tiles-v1'
const MIN_ZOOM = 1
const MAX_ZOOM = 19
const ZOOM_LEVELS_ABOVE = 3
const ZOOM_LEVELS_BELOW = 1
const TILE_PADDING = 2

type TileBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const lonToTileX = (lon: number, zoom: number): number => {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom)
}

const latToTileY = (lat: number, zoom: number): number => {
  const latRad = (lat * Math.PI) / 180
  const merc = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  return Math.floor(((1 - merc / Math.PI) / 2) * 2 ** zoom)
}

const clampZoom = (zoom: number): number => {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

const coursePoints = (course: Course): Array<{ lat: number; lng: number }> => {
  const points: Array<{ lat: number; lng: number }> = [
    course.center,
    course.mapStart ?? course.center,
  ]

  for (const hole of course.holes) {
    points.push(hole.tee, hole.pin)
  }

  for (const path of course.paths) {
    points.push(...path.points)
  }

  for (const poi of course.pois) {
    points.push(poi.position)
  }

  return points
}

const tileBounds = (course: Course, zoom: number, padding = TILE_PADDING): TileBounds => {
  const points = coursePoints(course)
  const tileCount = 2 ** zoom

  let minX = tileCount
  let maxX = 0
  let minY = tileCount
  let maxY = 0

  for (const point of points) {
    minX = Math.min(minX, lonToTileX(point.lng, zoom))
    maxX = Math.max(maxX, lonToTileX(point.lng, zoom))
    minY = Math.min(minY, latToTileY(point.lat, zoom))
    maxY = Math.max(maxY, latToTileY(point.lat, zoom))
  }

  return {
    minX: Math.max(0, minX - padding),
    maxX: Math.min(tileCount - 1, maxX + padding),
    minY: Math.max(0, minY - padding),
    maxY: Math.min(tileCount - 1, maxY + padding),
  }
}

const tileUrls = (course: Course, zoom: number): string[] => {
  const template = course.tileUrl ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const bounds = tileBounds(course, zoom)
  const urls: string[] = []

  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const host = ['a', 'b', 'c'][(x + y) % 3]
      urls.push(
        template
          .replace('{s}', host)
          .replace('{z}', String(zoom))
          .replace('{x}', String(x))
          .replace('{y}', String(y)),
      )
    }
  }

  return urls
}

export const cacheCourseTiles = async (course: Course): Promise<number> => {
  if (!('caches' in window)) {
    return 0
  }

  const cache = await caches.open(TILE_CACHE)
  const targetZooms = new Set<number>()

  for (let offset = -ZOOM_LEVELS_BELOW; offset <= ZOOM_LEVELS_ABOVE; offset += 1) {
    targetZooms.add(clampZoom(course.zoom + offset))
  }

  const targets = [...targetZooms].sort((left, right) => left - right)
  const targetUrls = new Set<string>()

  for (const zoom of targets) {
    for (const url of tileUrls(course, zoom)) {
      targetUrls.add(url)
    }
  }

  let count = 0

  for (const url of targetUrls) {
    try {
      await cache.add(url)
      count += 1
    } catch {
      // Ignore failed tile fetches so the rest still cache.
    }
  }

  return count
}
