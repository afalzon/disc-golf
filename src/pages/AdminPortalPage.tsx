import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logoutAdminSession } from '../lib/adminAuth'
import { getSmtpConfig, saveSmtpConfig, sendSmtpTest, type SmtpConfigPayload } from '../lib/adminSmtp'
import { createCourse, deleteCourse, duplicateCourse, exportCourse, importCourse, listCourses, renameCourse, setDefaultCourse, type CourseSummary } from '../lib/storage'
import { validateName } from '../lib/nameFilter'
import type { Course } from '../types/course'

const isCoursePayload = (value: unknown): value is Course => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Course
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.center === 'object' &&
    typeof candidate.zoom === 'number' &&
    Array.isArray(candidate.holes) &&
    Array.isArray(candidate.paths)
  )
}

export const AdminPortalPage = () => {
  const navigate = useNavigate()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [newCourseName, setNewCourseName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [status, setStatus] = useState('')
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from: '',
    replyTo: '',
  })
  const [smtpInfo, setSmtpInfo] = useState<SmtpConfigPayload | null>(null)
  const [smtpTestTo, setSmtpTestTo] = useState('')
  const [smtpStatus, setSmtpStatus] = useState('')

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? courses[0] ?? null,
    [courses, selectedCourseId],
  )

  const filteredCourses = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) {
      return courses
    }

    return courses.filter(
      (course) =>
        course.name.toLowerCase().includes(query) || course.id.toLowerCase().includes(query),
    )
  }, [courses, searchTerm])

  useEffect(() => {
    const load = async () => {
      try {
        const nextCourses = await listCourses()

        setCourses(nextCourses)
        setSelectedCourseId((current) => current || nextCourses[0]?.id || '')
        setRenameValue(nextCourses[0]?.name ?? '')
      } catch {
        setCourses([])
        setSelectedCourseId('')
        setRenameValue('')
        setStatus('Unable to reach the course API. Please refresh and try again.')
      }
    }

    void load()
  }, [])

  useEffect(() => {
    const loadSmtp = async () => {
      try {
        const payload = await getSmtpConfig()
        setSmtpInfo(payload)
        setSmtpConfig({
          host: payload.config.host,
          port: payload.config.port,
          secure: payload.config.secure,
          username: payload.config.username,
          password: '',
          from: payload.config.from,
          replyTo: payload.config.replyTo,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load SMTP settings.'
        setSmtpStatus(message)
      }
    }

    void loadSmtp()
  }, [])

  const refreshCourses = async (preferredId?: string) => {
    const nextCourses = await listCourses()
    setCourses(nextCourses)

    const fallbackId = preferredId ?? nextCourses[0]?.id ?? ''
    setSelectedCourseId(fallbackId)
    setRenameValue(nextCourses.find((course) => course.id === fallbackId)?.name ?? '')
  }

  const openEditor = (courseId?: string) => {
    const targetId = courseId ?? selectedCourse?.id
    if (!targetId) {
      return
    }

    navigate(`/admin/${targetId}`)
  }

  const handleAddCourse = async () => {
    const nameError = validateName(newCourseName, 'Course name')
    if (nameError) {
      setStatus(nameError)
      return
    }

    const course = await createCourse(newCourseName)
    setNewCourseName('')
    setStatus(`Created ${course.name}`)
    await refreshCourses(course.id)
    navigate(`/admin/${course.id}`)
  }

  const handleRenameCourse = async () => {
    if (!selectedCourse) {
      return
    }

    const nameError = validateName(renameValue, 'Course name')
    if (nameError) {
      setStatus(nameError)
      return
    }

    const renamed = await renameCourse(selectedCourse.id, renameValue)
    setStatus(`Renamed to ${renamed.name}`)
    await refreshCourses(renamed.id)
  }

  const handleDeleteCourse = async () => {
    if (!selectedCourse) {
      return
    }

    await deleteCourse(selectedCourse.id)
    setStatus(`Deleted ${selectedCourse.name}`)
    await refreshCourses()
  }

  const handleDuplicateCourse = async () => {
    if (!selectedCourse) {
      return
    }

    const copy = await duplicateCourse(selectedCourse.id)
    setStatus(`Duplicated ${selectedCourse.name}`)
    await refreshCourses(copy.id)
    navigate(`/admin/${copy.id}`)
  }

  const handleSetDefaultCourse = async (courseId: string) => {
    await setDefaultCourse(courseId)
    await refreshCourses(courseId)
    const chosen = courses.find((course) => course.id === courseId)
    setStatus(`Default course set to ${chosen?.name ?? courseId}`)
  }

  const handleExportCourse = async () => {
    if (!selectedCourse) {
      return
    }

    const course = await exportCourse(selectedCourse.id)
    if (!course) {
      setStatus('Unable to export course')
      return
    }

    const blob = new Blob([JSON.stringify(course, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    const objectUrl = URL.createObjectURL(blob)
    link.href = objectUrl
    link.download = `${course.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'course'}.json`
    link.click()
    URL.revokeObjectURL(objectUrl)
    setStatus(`Exported ${course.name}`)
  }

  const handleImportCourse = async (file: File | null) => {
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown

      if (!isCoursePayload(parsed)) {
        setStatus('That file does not look like a valid course export')
        return
      }

      const imported = await importCourse(parsed)
      setStatus(`Imported ${imported.name}`)
      await refreshCourses(imported.id)
      navigate(`/admin/${imported.id}`)
    } catch {
      setStatus('Import failed. Please choose a valid JSON file.')
    }
  }

  const handleSaveSmtp = async () => {
    try {
      const payload = await saveSmtpConfig(smtpConfig)
      setSmtpInfo(payload)
      setSmtpConfig((current) => ({ ...current, password: '' }))
      setSmtpStatus('SMTP settings saved.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save SMTP settings.'
      setSmtpStatus(message)
    }
  }

  const handleSendSmtpTest = async () => {
    try {
      await sendSmtpTest(smtpTestTo)
      setSmtpStatus(`SMTP test email sent to ${smtpTestTo}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send test email.'
      setSmtpStatus(message)
    }
  }

  const handleLogout = async () => {
    try {
      await logoutAdminSession()
    } finally {
      navigate('/admin-login', { replace: true })
    }
  }

  return (
    <main className="page portal-page">
      <section className="portal-card portal-card-wide">
        <p className="eyebrow">Admin Portal</p>
        <h1>Course Manager</h1>
        <p className="portal-copy">
          Manage stored courses from one place. Search, add, duplicate, import, export, rename, or remove a course before opening the editor.
        </p>

        <div className="portal-actions-row">
          <button type="button" className="chip" onClick={() => void handleLogout()}>
            Sign Out
          </button>
        </div>

        <div className="portal-toolbar">
          <label className="portal-field portal-search" htmlFor="course-search">
            Search courses
            <input
              id="course-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by course name or ID"
            />
          </label>

          <div className="portal-import-actions">
            <button type="button" className="chip" onClick={() => importInputRef.current?.click()}>
              Import Course
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => void handleImportCourse(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="portal-grid">
          <section className="card portal-list-panel">
            <div className="portal-panel-head">
              <div>
                <p className="eyebrow">Courses</p>
                <h2>{filteredCourses.length} shown / {courses.length} stored</h2>
              </div>
              <button type="button" className="chip chip-install" onClick={() => openEditor()} disabled={!selectedCourse}>
                Open Editor
              </button>
            </div>

            <div className="portal-course-list" role="list" aria-label="Course list">
              {filteredCourses.map((course) => (
                <div
                  key={course.id}
                  className={course.id === selectedCourse?.id ? 'portal-course-item active' : 'portal-course-item'}
                >
                  <button
                    type="button"
                    className="portal-course-select"
                    onClick={() => {
                      setSelectedCourseId(course.id)
                      setRenameValue(course.name)
                    }}
                  >
                    <strong>{course.name}</strong>
                    <span>{course.id}</span>
                  </button>
                  <label className="portal-default-toggle">
                    <input
                      type="checkbox"
                      checked={course.isDefault}
                      onChange={() => void handleSetDefaultCourse(course.id)}
                    />
                    <span>Default course</span>
                  </label>
                </div>
              ))}

              {!filteredCourses.length ? <p className="portal-empty">No courses match your search.</p> : null}
              {!courses.length ? (
                <p className="portal-empty">
                  No courses are stored on the server yet. Create one here or import a JSON export.
                </p>
              ) : null}
            </div>
          </section>

          <section className="card portal-edit-panel">
            <div className="portal-panel-head">
              <div>
                <p className="eyebrow">Add Course</p>
                <h2>New course</h2>
              </div>
            </div>

            <label className="portal-field" htmlFor="new-course-name">
              Course name
              <input
                id="new-course-name"
                value={newCourseName}
                onChange={(event) => setNewCourseName(event.target.value)}
                placeholder="Valley View Open"
              />
            </label>

            <div className="portal-actions-row">
              <button type="button" className="chip chip-install" onClick={() => void handleAddCourse()}>
                Add Course
              </button>
            </div>

            <div className="portal-divider" />

            <div className="portal-panel-head">
              <div>
                <p className="eyebrow">Edit Selected</p>
                <h2>{selectedCourse?.name ?? 'Select a course'}</h2>
              </div>
            </div>

            <label className="portal-field" htmlFor="rename-course-name">
              Course name
              <input
                id="rename-course-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                disabled={!selectedCourse}
              />
            </label>

            <div className="portal-actions-row">
              <button type="button" className="chip" onClick={() => void handleRenameCourse()} disabled={!selectedCourse}>
                Save Name
              </button>
              <button type="button" className="chip" onClick={() => void handleDuplicateCourse()} disabled={!selectedCourse}>
                Duplicate Course
              </button>
              <button type="button" className="chip" onClick={() => void handleExportCourse()} disabled={!selectedCourse}>
                Export Course
              </button>
              <button type="button" className="chip" onClick={() => void handleDeleteCourse()} disabled={!selectedCourse}>
                Remove Course
              </button>
            </div>

            <p className="cache-status">
              {status
                ? status
                : selectedCourse
                  ? `Selected course ID: ${selectedCourse.id}`
                  : 'No course selected. Root will open the default course when one is set.'}
            </p>

            <div className="portal-divider" />

            <div className="portal-panel-head">
              <div>
                <p className="eyebrow">Email Delivery</p>
                <h2>SMTP Configuration</h2>
              </div>
            </div>

            <label className="portal-field" htmlFor="smtp-host">
              SMTP host
              <input
                id="smtp-host"
                value={smtpConfig.host}
                onChange={(event) => setSmtpConfig((current) => ({ ...current, host: event.target.value }))}
                placeholder="email-smtp.us-east-1.amazonaws.com"
              />
            </label>

            <div className="portal-actions-row">
              <label className="portal-field" htmlFor="smtp-port">
                SMTP port
                <input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={smtpConfig.port}
                  onChange={(event) => setSmtpConfig((current) => ({ ...current, port: Number(event.target.value) || 0 }))}
                />
              </label>

              <label className="portal-default-toggle">
                <input
                  type="checkbox"
                  checked={smtpConfig.secure}
                  onChange={(event) => setSmtpConfig((current) => ({ ...current, secure: event.target.checked }))}
                />
                <span>Use TLS/SSL (`secure`)</span>
              </label>
            </div>

            <label className="portal-field" htmlFor="smtp-username">
              SMTP username
              <input
                id="smtp-username"
                value={smtpConfig.username}
                onChange={(event) => setSmtpConfig((current) => ({ ...current, username: event.target.value }))}
                placeholder="AKIA..."
              />
            </label>

            <label className="portal-field" htmlFor="smtp-password">
              SMTP password
              <input
                id="smtp-password"
                type="password"
                autoComplete="new-password"
                value={smtpConfig.password}
                onChange={(event) => setSmtpConfig((current) => ({ ...current, password: event.target.value }))}
                placeholder={smtpInfo?.config.hasPassword ? 'Stored (leave blank to keep)' : 'Enter SMTP password'}
              />
            </label>

            <label className="portal-field" htmlFor="smtp-from">
              From email
              <input
                id="smtp-from"
                type="email"
                value={smtpConfig.from}
                onChange={(event) => setSmtpConfig((current) => ({ ...current, from: event.target.value }))}
                placeholder="noreply@yourdomain.com"
              />
            </label>

            <label className="portal-field" htmlFor="smtp-reply-to">
              Reply-to email (optional)
              <input
                id="smtp-reply-to"
                type="email"
                value={smtpConfig.replyTo}
                onChange={(event) => setSmtpConfig((current) => ({ ...current, replyTo: event.target.value }))}
                placeholder="support@yourdomain.com"
              />
            </label>

            <div className="portal-actions-row">
              <button type="button" className="chip" onClick={() => void handleSaveSmtp()}>
                Save SMTP
              </button>
            </div>

            <label className="portal-field" htmlFor="smtp-test-to">
              Test recipient
              <input
                id="smtp-test-to"
                type="email"
                value={smtpTestTo}
                onChange={(event) => setSmtpTestTo(event.target.value)}
                placeholder="you@yourdomain.com"
              />
            </label>

            <div className="portal-actions-row">
              <button type="button" className="chip chip-install" onClick={() => void handleSendSmtpTest()} disabled={!smtpTestTo.trim()}>
                Send Test Email
              </button>
            </div>

            <p className="cache-status">
              {smtpStatus
                ? smtpStatus
                : smtpInfo?.ready
                  ? 'SMTP is configured and ready for magic-link delivery.'
                  : 'SMTP is not fully configured yet.'}
            </p>

            {smtpInfo ? (
              <p className="cache-status">
                Active overrides from environment: {Object.entries(smtpInfo.envOverrides).filter(([, enabled]) => enabled).map(([key]) => key).join(', ') || 'none'}
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  )
}
