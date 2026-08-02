export const parseQrTarget = (value: string): URL | null => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export const resolveInternalRoute = (value: string): string | null => {
  const parsed = parseQrTarget(value)

  if (!parsed) {
    return null
  }

  if (parsed.origin !== window.location.origin) {
    return null
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
