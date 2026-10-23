import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { consumeAdminMagicLink, requestAdminMagicLink } from '../lib/adminAuth'

const resolveNextPath = (search: string): string => {
  const params = new URLSearchParams(search)
  const next = params.get('next') || '/admin-portal'
  if (!next.startsWith('/')) {
    return '/admin-portal'
  }

  return next
}

export const AdminLoginPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const params = new URLSearchParams(location.search)
  const token = params.get('token')

  useEffect(() => {
    if (!token) {
      return
    }

    const consume = async () => {
      setBusy(true)
      setStatus('Signing in...')

      try {
        await consumeAdminMagicLink(token)
        navigate(resolveNextPath(location.search), { replace: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Magic link is invalid or expired.'
        setStatus(message)
      } finally {
        setBusy(false)
      }
    }

    void consume()
  }, [token, navigate, location.search])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)

    try {
      await requestAdminMagicLink(email)
      setStatus('If this email matches the global admin account, a magic link has been sent.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send magic link.'
      setStatus(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page portal-page">
      <section className="portal-card">
        <p className="eyebrow">Admin Access</p>
        <h1>Sign in with magic link</h1>
        <p className="portal-copy">
          Enter the global admin email address configured on the server. You will receive a one-time secure login link.
        </p>

        <form className="portal-list-panel" onSubmit={(event) => void handleSubmit(event)}>
          <label className="portal-field" htmlFor="admin-email">
            Admin email
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              required
              disabled={busy}
            />
          </label>

          <div className="portal-actions-row">
            <button type="submit" className="chip chip-install" disabled={busy || !email.trim()}>
              Send Magic Link
            </button>
            <Link className="chip" to="/">
              Back to app
            </Link>
          </div>
        </form>

        <p className="cache-status">{status || 'The link expires quickly and can only be used once.'}</p>
      </section>
    </main>
  )
}
