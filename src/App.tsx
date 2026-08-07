import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { fetchAdminSession } from './lib/adminAuth'
import { AdminPage } from './pages/AdminPage'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminPortalPage } from './pages/AdminPortalPage'
import { CoursePage } from './pages/CoursePage'
import { EntryPage } from './pages/EntryPage'
import { RoundPage } from './pages/RoundPage'
import { RoundSetupPage } from './pages/RoundSetupPage'

const RequireAdminAuth = ({ children }: { children: ReactElement }) => {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading')

  useEffect(() => {
    const load = async () => {
      try {
        const session = await fetchAdminSession()
        setStatus(session?.authenticated ? 'allowed' : 'denied')
      } catch {
        setStatus('denied')
      }
    }

    void load()
  }, [])

  if (status === 'loading') {
    return <main className="page"><p>Checking admin session...</p></main>
  }

  if (status === 'denied') {
    const nextPath = `${window.location.pathname}${window.location.search}`
    return <Navigate to={`/admin-login?next=${encodeURIComponent(nextPath)}`} replace />
  }

  return children
}

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/course/:courseId" element={<CoursePage />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route
        path="/admin-portal"
        element={(
          <RequireAdminAuth>
            <AdminPortalPage />
          </RequireAdminAuth>
        )}
      />
      <Route
        path="/admin/:courseId"
        element={(
          <RequireAdminAuth>
            <AdminPage />
          </RequireAdminAuth>
        )}
      />
      <Route path="/rounds/new" element={<RoundSetupPage />} />
      <Route path="/round/:roundId" element={<RoundPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
