import type { Round } from '../types/round'

const ROUND_SYNC_PREFIX = 'dgsync:'

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

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const toBase64Url = (value: string): string =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const fromBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = normalized.length % 4
  if (remainder === 0) {
    return normalized
  }

  return normalized + '='.repeat(4 - remainder)
}

export const encodeRoundSyncToken = (round: Round): string => {
  const payload = {
    kind: 'round-sync-v1',
    round,
  }

  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  return `${ROUND_SYNC_PREFIX}${toBase64Url(bytesToBase64(bytes))}`
}

export const decodeRoundSyncToken = (value: string): Round | null => {
  if (!value.startsWith(ROUND_SYNC_PREFIX)) {
    return null
  }

  try {
    const token = value.slice(ROUND_SYNC_PREFIX.length)
    const bytes = base64ToBytes(fromBase64Url(token))
    const json = new TextDecoder().decode(bytes)
    const payload = JSON.parse(json) as {
      kind?: string
      round?: Round
    }

    if (payload.kind !== 'round-sync-v1' || !payload.round) {
      return null
    }

    return payload.round
  } catch {
    return null
  }
}
