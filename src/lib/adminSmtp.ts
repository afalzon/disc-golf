import { getAdminAuthHeaders } from './adminSession'

const API_BASE = '/api'

type ApiErrorPayload = {
  error?: string
}

export type SmtpConfigInput = {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  from: string
  replyTo: string
}

export type SmtpConfigPayload = {
  config: {
    host: string
    port: number
    secure: boolean
    username: string
    from: string
    replyTo: string
    hasPassword: boolean
  }
  effective: {
    host: string
    port: number
    secure: boolean
    username: string
    from: string
    replyTo: string
    hasPassword: boolean
  }
  ready: boolean
  envOverrides: {
    host: boolean
    port: boolean
    secure: boolean
    username: boolean
    password: boolean
    from: boolean
    replyTo: boolean
  }
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.error || `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

export const getSmtpConfig = async (): Promise<SmtpConfigPayload> => {
  const response = await fetch(`${API_BASE}/admin/smtp-config`, {
    method: 'GET',
    headers: {
      ...getAdminAuthHeaders(),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<SmtpConfigPayload>
}

export const saveSmtpConfig = async (input: SmtpConfigInput): Promise<SmtpConfigPayload> => {
  const response = await fetch(`${API_BASE}/admin/smtp-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminAuthHeaders(),
    },
    cache: 'no-store',
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json() as Promise<SmtpConfigPayload>
}

export const sendSmtpTest = async (to: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/admin/smtp-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminAuthHeaders(),
    },
    cache: 'no-store',
    body: JSON.stringify({ to }),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
}
