const ADMIN_SESSION_TOKEN_KEY = 'disc-golf-admin-session-token'

export const getStoredAdminToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const value = window.localStorage.getItem(ADMIN_SESSION_TOKEN_KEY)
  return value ? value : null
}

export const setStoredAdminToken = (token: string): void => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token)
}

export const clearStoredAdminToken = (): void => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(ADMIN_SESSION_TOKEN_KEY)
}

export const getAdminAuthHeaders = (): Record<string, string> => {
  const token = getStoredAdminToken()
  if (!token) {
    return {}
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}
