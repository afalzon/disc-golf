import type { Course } from '../types/course'

const TILE_CACHE = 'disc-golf-tiles-v1'

const lonToTileX = (lon: number, zoom: number): number => {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom)
}

const latToTileY = (lat: number, zoom: number): number => {
  const latRad = (lat * Math.PI) / 180
  const merc = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  return Math.floor(((1 - merc / Math.PI) / 2) * 2 ** zoom)
}

const tileUrls = (course: Course, zoom: number, radius = 2): string[] => {
  const template = course.tileUrl ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const centerX = lonToTileX(course.center.lng, zoom)
  const centerY = latToTileY(course.center.lat, zoom)
  const urls: string[] = []

  for (let x = centerX - radius; x <= centerX + radius; x += 1) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
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
  const targets = [course.zoom - 1, course.zoom, course.zoom + 1]
  let count = 0

  for (const zoom of targets) {
    for (const url of tileUrls(course, Math.max(1, zoom))) {
      try {
        await cache.add(url)
        count += 1
      } catch {
        // Ignore failed tile fetches so the rest still cache.
      }
    }
  }

  return count
}
