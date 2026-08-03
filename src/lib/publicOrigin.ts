let cachedOrigin: string | null = null
let cachedPromise: Promise<string> | null = null

const normalizeOrigin = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

export const resolvePublicOrigin = async (): Promise<string> => {
  if (cachedOrigin) {
    return cachedOrigin
  }

  if (cachedPromise) {
    return cachedPromise
  }

  cachedPromise = (async () => {
    try {
      const response = await fetch('/api/public-origin', { cache: 'no-store' })
      if (!response.ok) {
        return window.location.origin
      }

      const payload = (await response.json()) as { publicOrigin?: string | null }
      const normalized = normalizeOrigin(payload.publicOrigin)
      return normalized ?? window.location.origin
    } catch {
      return window.location.origin
    }
  })()

  cachedOrigin = await cachedPromise
  return cachedOrigin
}
