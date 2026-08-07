import { clearStoredAdminToken, getAdminAuthHeaders, setStoredAdminToken } from './adminSession'

const API_BASE = '/api'

type ApiErrorPayload = {
  error?: string
}

export type AdminSessionPayload = {
  authenticated: boolean
  role: string
  email: string
  expiresAt: string
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.error || `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

export const requestAdminMagicLink = async (email: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/auth/request-admin-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
}

export const consumeAdminMagicLink = async (token: string): Promise<AdminSessionPayload> => {
  const response = await fetch(`${API_BASE}/auth/consume-admin-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({ token }),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const payload = (await response.json()) as AdminSessionPayload & { token: string }
  setStoredAdminToken(payload.token)

  return {
    authenticated: payload.authenticated,
    role: payload.role,
    email: payload.email,
    expiresAt: payload.expiresAt,
  }
}

export const fetchAdminSession = async (): Promise<AdminSessionPayload | null> => {
  const response = await fetch(`${API_BASE}/auth/session`, {
    method: 'GET',
    headers: {
      ...getAdminAuthHeaders(),
    },
    cache: 'no-store',
  })

  if (response.status === 401) {
    clearStoredAdminToken()
    return null
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<AdminSessionPayload>
}

export const logoutAdminSession = async (): Promise<void> => {
  const response = await fetch(`${API_BASE}/auth/session`, {
    method: 'DELETE',
    headers: {
      ...getAdminAuthHeaders(),
    },
    cache: 'no-store',
  })

  clearStoredAdminToken()

  if (response.status === 401 || response.status === 204) {
    return
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
}
