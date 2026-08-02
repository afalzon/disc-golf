import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminPage } from './pages/AdminPage'
import { AdminPortalPage } from './pages/AdminPortalPage'
import { CoursePage } from './pages/CoursePage'
import { EntryPage } from './pages/EntryPage'
import { RoundPage } from './pages/RoundPage'
import { RoundSetupPage } from './pages/RoundSetupPage'

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/course/:courseId" element={<CoursePage />} />
      <Route path="/admin-portal" element={<AdminPortalPage />} />
      <Route path="/admin/:courseId" element={<AdminPage />} />
      <Route path="/rounds/new" element={<RoundSetupPage />} />
      <Route path="/round/:roundId" element={<RoundPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
