import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from 'react-leaflet'
import QRCode from 'qrcode-svg'
import { pinIcon, poiIconForKind, teeIcon } from '../lib/mapIcons'
import { findCourse, saveCourse } from '../lib/storage'
import type { Course, LatLng, Poi, PoiKind } from '../types/course'

type MarkMode =
  | 'none'
  | 'draft-path'
  | 'path-waypoint'
  | 'hole-tee'
  | 'hole-pin'
  | 'poi'
  | 'map-start'

type ClickCaptureProps = {
  enabled: boolean
  onPoint: (point: LatLng) => void
}

const ClickCapture = ({ enabled, onPoint }: ClickCaptureProps) => {
  useMapEvents({
    click(event) {
      if (!enabled) {
        return
      }
      onPoint({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })

  return null
}

export const AdminPage = () => {
  const { courseId } = useParams()
  const [course, setCourse] = useState<Course | null>(null)
  const [courseMissing, setCourseMissing] = useState(false)
  const [selectedHoleId, setSelectedHoleId] = useState<number>(1)
  const [selectedPathId, setSelectedPathId] = useState<string>('')
  const [selectedPoiId, setSelectedPoiId] = useState<string>('')
  const [draftName, setDraftName] = useState('')
  const [draftPoints, setDraftPoints] = useState<LatLng[]>([])
  const [markMode, setMarkMode] = useState<MarkMode>('none')
  const [holeQrSvg, setHoleQrSvg] = useState('')
  const [holeQrTarget, setHoleQrTarget] = useState('')
  const [holeQrFileName, setHoleQrFileName] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!courseId) {
        setCourseMissing(true)
        return
      }

      const value = await findCourse(courseId)
      if (!value) {
        setCourseMissing(true)
        setCourse(null)
        return
      }

      setCourseMissing(false)
      setCourse(value)
      setSelectedPathId(value.paths[0]?.id ?? '')
      setSelectedPoiId(value.pois[0]?.id ?? '')
    }

    void load()
  }, [courseId])

  const nextPathName = draftName || `Path ${((course?.paths.length ?? 0) + 1).toString()}`

  const activeHole =
    course?.holes.find((hole) => hole.id === selectedHoleId) ?? course?.holes[0] ?? null
  const activePath =
    course?.paths.find((path) => path.id === selectedPathId) ?? course?.paths[0] ?? null
  const activePoi =
    course?.pois.find((poi) => poi.id === selectedPoiId) ?? course?.pois[0] ?? null

  if (courseMissing) {
    return (
      <main className="page portal-page">
        <section className="portal-card">
          <p className="eyebrow">Admin Editor</p>
          <h1>Course not found</h1>
          <p className="portal-copy">
            This route points to a course ID that does not exist on the server.
          </p>
          <div className="portal-actions-row">
            <Link className="chip chip-install" to="/admin-portal">
              Go to Admin Portal
            </Link>
          </div>
        </section>
      </main>
    )
  }

  if (!course) {
    return <main className="page"><p>Loading admin...</p></main>
  }

  const startPoint = course.mapStart ?? course.center

  const updateActiveHole = (updates: Partial<Course['holes'][number]>) => {
    if (!activeHole) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        holes: prev.holes.map((hole) =>
          hole.id === activeHole.id ? { ...hole, ...updates } : hole,
        ),
      }
    })
  }

  const updateCourseStart = (updates: { lat?: number; lng?: number }) => {
    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        mapStart: {
          lat: updates.lat ?? prev.mapStart?.lat ?? prev.center.lat,
          lng: updates.lng ?? prev.mapStart?.lng ?? prev.center.lng,
        },
      }
    })
  }

  const updateActivePoi = (updates: Partial<Poi>) => {
    if (!activePoi) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        pois: prev.pois.map((poi) => (poi.id === activePoi.id ? { ...poi, ...updates } : poi)),
      }
    })
  }

  const updatePoiPosition = (poiId: string, point: LatLng) => {
    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        pois: prev.pois.map((poi) =>
          poi.id === poiId ? { ...poi, position: point } : poi,
        ),
      }
    })
  }

  const updateHole = (holeId: number, field: 'tee' | 'pin', point: LatLng) => {
    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        holes: prev.holes.map((hole) =>
          hole.id === holeId ? { ...hole, [field]: point } : hole,
        ),
      }
    })
  }

  const addHole = () => {
    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      const nextId = Math.max(0, ...prev.holes.map((hole) => hole.id)) + 1
      const lastHole = prev.holes[prev.holes.length - 1] ?? prev.holes[0]
      const seedPoint = prev.mapStart ?? lastHole?.pin ?? prev.center
      const offset = prev.holes.length * 0.0007

      const newHole = {
        id: nextId,
        name: `Hole ${nextId}`,
        par: 3,
        tee: {
          lat: seedPoint.lat + offset,
          lng: seedPoint.lng + offset,
        },
        pin: {
          lat: seedPoint.lat + offset + 0.0002,
          lng: seedPoint.lng + offset + 0.0002,
        },
        notes: '',
      }

      setSelectedHoleId(nextId)

      return {
        ...prev,
        holes: [...prev.holes, newHole],
      }
    })

    setStatus('Added a new hole draft')
  }

  const updateActivePath = (updates: Partial<Course['paths'][number]>) => {
    if (!activePath) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        paths: prev.paths.map((path) =>
          path.id === activePath.id ? { ...path, ...updates } : path,
        ),
      }
    })
  }

  const updatePathPoint = (index: number, point: LatLng) => {
    if (!activePath) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        paths: prev.paths.map((path) => {
          if (path.id !== activePath.id) {
            return path
          }

          const nextPoints = [...path.points]
          nextPoints[index] = point
          return { ...path, points: nextPoints }
        }),
      }
    })
  }

  const addPathWaypoint = (point: LatLng) => {
    if (!activePath) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        paths: prev.paths.map((path) =>
          path.id === activePath.id ? { ...path, points: [...path.points, point] } : path,
        ),
      }
    })

    setStatus(`Added waypoint to ${activePath.name}`)
  }

  const deletePathWaypoint = (index: number) => {
    if (!activePath || activePath.points.length <= 2) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      return {
        ...prev,
        paths: prev.paths.map((path) => {
          if (path.id !== activePath.id) {
            return path
          }

          return {
            ...path,
            points: path.points.filter((_, pointIndex) => pointIndex !== index),
          }
        }),
      }
    })

    setStatus(`Removed waypoint from ${activePath.name}`)
  }

  const addPath = () => {
    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      const nextId = `path-${Date.now()}`
      const lastHole = prev.holes[prev.holes.length - 1] ?? prev.holes[0]
      const seedPoint = prev.mapStart ?? lastHole?.pin ?? prev.center
      const offset = 0.0004

      const newPath = {
        id: nextId,
        name: `Path ${prev.paths.length + 1}`,
        points: [
          { lat: seedPoint.lat, lng: seedPoint.lng },
          { lat: seedPoint.lat + offset, lng: seedPoint.lng + offset },
        ],
      }

      setSelectedPathId(nextId)

      return {
        ...prev,
        paths: [...prev.paths, newPath],
      }
    })

    setStatus('Added a walking path draft')
  }

  const deleteSelectedPath = () => {
    if (!activePath) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      const remaining = prev.paths.filter((path) => path.id !== activePath.id)
      setSelectedPathId(remaining[0]?.id ?? '')

      return {
        ...prev,
        paths: remaining,
      }
    })

    setStatus(`Deleted ${activePath.name}`)
  }

  const addPoi = () => {
    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      const nextId = `poi-${Date.now()}`
      const start = prev.mapStart ?? prev.center
      const lastPoi = prev.pois[prev.pois.length - 1]
      const seed = lastPoi?.position ?? start
      const nextPoi: Poi = {
        id: nextId,
        name: `POI ${prev.pois.length + 1}`,
        kind: 'info',
        position: { lat: seed.lat + 0.0003, lng: seed.lng + 0.0003 },
        notes: '',
      }

      setSelectedPoiId(nextId)

      return {
        ...prev,
        pois: [...prev.pois, nextPoi],
      }
    })

    setStatus('Added a POI draft')
  }

  const deleteSelectedPoi = () => {
    if (!activePoi) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      const remaining = prev.pois.filter((poi) => poi.id !== activePoi.id)
      setSelectedPoiId(remaining[0]?.id ?? '')

      return {
        ...prev,
        pois: remaining,
      }
    })

    setStatus(`Deleted ${activePoi.name}`)
  }

  const deleteSelectedHole = () => {
    if (!activeHole) {
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      const remaining = prev.holes.filter((hole) => hole.id !== activeHole.id)
      if (!remaining.length) {
        setSelectedHoleId(1)
      } else {
        setSelectedHoleId(remaining[0].id)
      }

      return {
        ...prev,
        holes: remaining,
      }
    })

    setStatus(`Deleted ${activeHole.name}`)
  }

  const save = async () => {
    if (!course) {
      return
    }

    await saveCourse(course)
    setStatus('Saved course changes')
  }

  const setMode = (mode: MarkMode) => {
    setMarkMode((current) => (current === mode ? 'none' : mode))
  }

  const buildHoleUrl = (holeId: number) => {
    const holePath = `/course/${course.id}?hole=${String(holeId)}`
    return new URL(holePath, window.location.origin).toString()
  }

  const makeQrFileName = (holeId: number, holeName: string) => {
    const safeCourse = course.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course'
    const safeHole = holeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `hole-${String(holeId)}`
    return `${safeCourse}-${safeHole}-qr.svg`
  }

  const generateHoleQr = () => {
    if (!activeHole) {
      setStatus('Select a hole first')
      return
    }

    const target = buildHoleUrl(activeHole.id)
    const qr = new QRCode({
      content: target,
      width: 1400,
      height: 1400,
      padding: 0,
      ecl: 'H',
      join: true,
      color: '#000000',
      background: '',
      xmlDeclaration: true,
      container: 'none',
    })

    const rawSvg = qr.svg().trim().replace(/<rect\b[^>]*\/?>(?:<\/rect>)?/gi, '')
    const svg = rawSvg.startsWith('<svg')
      ? rawSvg.replace(/<rect\b[^>]*\/?>(?:<\/rect>)?/gi, '')
      : `<?xml version="1.0" standalone="yes"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="1400" height="1400" viewBox="0 0 1400 1400">${rawSvg}</svg>`

    setHoleQrSvg(svg)
    setHoleQrTarget(target)
    setHoleQrFileName(makeQrFileName(activeHole.id, activeHole.name))
    setStatus(`Generated QR for ${activeHole.name}`)
  }

  const downloadHoleQr = () => {
    if (!holeQrSvg || !holeQrFileName) {
      setStatus('Generate a hole QR first')
      return
    }

    const blob = new Blob([holeQrSvg], { type: 'image/svg+xml' })
    const objectUrl = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = holeQrFileName
    anchor.click()

    URL.revokeObjectURL(objectUrl)
    setStatus(`Downloaded ${holeQrFileName}`)
  }

  const onMapPoint = (point: LatLng) => {
    if (markMode === 'draft-path') {
      setDraftPoints((prev) => [...prev, point])
      setStatus('Added draft path point')
      return
    }

    if (markMode === 'path-waypoint') {
      if (!activePath) {
        setStatus('Select a path first')
        return
      }

      addPathWaypoint(point)
      return
    }

    if (markMode === 'hole-tee') {
      if (!activeHole) {
        setStatus('Select a hole first')
        return
      }

      updateHole(activeHole.id, 'tee', point)
      setStatus(`Marked tee for ${activeHole.name}`)
      setMarkMode('none')
      return
    }

    if (markMode === 'hole-pin') {
      if (!activeHole) {
        setStatus('Select a hole first')
        return
      }

      updateHole(activeHole.id, 'pin', point)
      setStatus(`Marked pin for ${activeHole.name}`)
      setMarkMode('none')
      return
    }

    if (markMode === 'poi') {
      if (!activePoi) {
        setStatus('Select a POI first')
        return
      }

      updatePoiPosition(activePoi.id, point)
      setStatus(`Marked location for ${activePoi.name}`)
      setMarkMode('none')
      return
    }

    if (markMode === 'map-start') {
      updateCourseStart(point)
      setStatus('Marked map start position')
      setMarkMode('none')
    }
  }

  const commitPath = () => {
    if (draftPoints.length < 2) {
      setStatus('Need at least 2 points to save a walking path')
      return
    }

    setCourse((prev) => {
      if (!prev) {
        return prev
      }

      const nextId = `path-${Date.now()}`
      return {
        ...prev,
        paths: [...prev.paths, { id: nextId, name: nextPathName, points: draftPoints }],
      }
    })

    setDraftName('')
    setDraftPoints([])
    setMarkMode('none')
    setStatus('Added walking path (save to persist)')
  }

  const poiKindOptions: PoiKind[] = ['parking', 'restroom', 'water', 'shelter', 'info', 'other']

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Admin Editor</p>
          <h1>{course.name}</h1>
        </div>

        <nav className="topbar-actions" aria-label="Admin actions">
          <Link className="chip chip-link" to={`/course/${course.id}`}>
            Back to Course
          </Link>
          <button
            type="button"
            className={markMode === 'draft-path' ? 'chip chip-install' : 'chip'}
            onClick={() => setMode('draft-path')}
          >
            {markMode === 'draft-path' ? 'Stop Path Drawing' : 'Draw Walking Path'}
          </button>
          <button type="button" className="chip chip-install" onClick={() => void save()}>
            Save Changes
          </button>
        </nav>

        <p className="cache-status">
          {status || 'Pick a mark mode, then click the map. You can also drag markers directly.'}
        </p>
      </header>

      <section className="card admin-section-card course-settings-card">
        <div className="admin-editor-head">
          <div>
            <p className="eyebrow">Course Settings</p>
            <h2>Map start</h2>
          </div>
          <div className="admin-editor-actions">
            <button
              type="button"
              className="chip"
              onClick={() =>
                updateCourseStart({
                  lat: activeHole?.tee.lat,
                  lng: activeHole?.tee.lng,
                })
              }
              disabled={!activeHole}
            >
              Use Selected Tee
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                updateCourseStart({
                  lat: activeHole?.pin.lat,
                  lng: activeHole?.pin.lng,
                })
              }
              disabled={!activeHole}
            >
              Use Selected Pin
            </button>
            <button
              type="button"
              className={markMode === 'map-start' ? 'chip chip-install' : 'chip'}
              onClick={() => setMode('map-start')}
            >
              {markMode === 'map-start' ? 'Cancel Mark Start' : 'Mark Start on Map'}
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                updateCourseStart({
                  lat: course.center.lat,
                  lng: course.center.lng,
                })
              }
            >
              Reset to Course Center
            </button>
          </div>
        </div>

        <div className="admin-form-grid admin-form-grid-path">
          <label>
            Start latitude
            <input
              type="number"
              step="0.00001"
              value={startPoint.lat}
              onChange={(event) =>
                updateCourseStart({ lat: Number(event.target.value) || startPoint.lat })
              }
            />
          </label>
          <label>
            Start longitude
            <input
              type="number"
              step="0.00001"
              value={startPoint.lng}
              onChange={(event) =>
                updateCourseStart({ lng: Number(event.target.value) || startPoint.lng })
              }
            />
          </label>
          <div className="admin-path-hint">
            Players will open the map on this start position. If it is not set, the app falls back to the course center.
          </div>
        </div>
      </section>

      <section className="admin-layout">
        <aside className="card admin-sidebar">
          <div className="admin-sidebar-block">
            <div className="admin-sidebar-head">
              <div>
                <p className="eyebrow">Holes</p>
                <h2>{course.holes.length} configured</h2>
              </div>
              <button type="button" className="chip chip-install" onClick={addHole}>
                Add Hole
              </button>
            </div>

            <div className="hole-library" role="list" aria-label="Hole list">
              {course.holes.map((hole) => (
                <button
                  key={hole.id}
                  type="button"
                  className={hole.id === activeHole?.id ? 'hole-record active' : 'hole-record'}
                  onClick={() => setSelectedHoleId(hole.id)}
                >
                  <strong>{hole.name}</strong>
                  <span>
                    Par {hole.par} · Tee {hole.tee.lat.toFixed(4)}, {hole.tee.lng.toFixed(4)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-sidebar-block">
            <div className="admin-sidebar-head">
              <div>
                <p className="eyebrow">Paths</p>
                <h2>{course.paths.length} configured</h2>
              </div>
              <button type="button" className="chip chip-install" onClick={addPath}>
                Add Path
              </button>
            </div>

            <div className="hole-library" role="list" aria-label="Path list">
              {course.paths.map((path) => (
                <button
                  key={path.id}
                  type="button"
                  className={path.id === activePath?.id ? 'hole-record active' : 'hole-record'}
                  onClick={() => setSelectedPathId(path.id)}
                >
                  <strong>{path.name}</strong>
                  <span>{path.points.length} control points</span>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-sidebar-block">
            <div className="admin-sidebar-head">
              <div>
                <p className="eyebrow">POIs</p>
                <h2>{course.pois.length} configured</h2>
              </div>
              <button type="button" className="chip chip-install" onClick={addPoi}>
                Add POI
              </button>
            </div>

            <div className="hole-library" role="list" aria-label="POI list">
              {course.pois.map((poi) => (
                <button
                  key={poi.id}
                  type="button"
                  className={poi.id === activePoi?.id ? 'hole-record active' : 'hole-record'}
                  onClick={() => setSelectedPoiId(poi.id)}
                >
                  <strong>{poi.name}</strong>
                  <span>
                    {poi.kind} · {poi.position.lat.toFixed(4)}, {poi.position.lng.toFixed(4)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="card admin-editor">
          <div className="admin-editor-head">
            <div>
              <p className="eyebrow">Hole Editor</p>
              <h2>{activeHole?.name ?? 'Select a hole'}</h2>
            </div>
            <div className="admin-editor-actions">
              <button type="button" className="chip" onClick={deleteSelectedHole} disabled={!activeHole}>
                Delete Hole
              </button>
              <button
                type="button"
                className={markMode === 'hole-tee' ? 'chip chip-install' : 'chip'}
                onClick={() => setMode('hole-tee')}
                disabled={!activeHole}
              >
                {markMode === 'hole-tee' ? 'Cancel Mark Tee' : 'Mark Tee on Map'}
              </button>
              <button
                type="button"
                className={markMode === 'hole-pin' ? 'chip chip-install' : 'chip'}
                onClick={() => setMode('hole-pin')}
                disabled={!activeHole}
              >
                {markMode === 'hole-pin' ? 'Cancel Mark Pin' : 'Mark Pin on Map'}
              </button>
              <button type="button" className="chip" onClick={generateHoleQr} disabled={!activeHole}>
                Generate Hole QR
              </button>
              <button type="button" className="chip" onClick={downloadHoleQr} disabled={!holeQrSvg}>
                Download QR SVG
              </button>
              <button type="button" className="chip chip-install" onClick={() => void save()}>
                Save Changes
              </button>
            </div>
          </div>

          {activeHole ? (
            <div className="admin-form-grid">
              <label>
                Hole name
                <input
                  value={activeHole.name}
                  onChange={(event) => updateActiveHole({ name: event.target.value })}
                  placeholder="Hole 1"
                />
              </label>
              <label>
                Par
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={activeHole.par}
                  onChange={(event) => updateActiveHole({ par: Number(event.target.value) || 3 })}
                />
              </label>
              <label>
                Notes
                <input
                  value={activeHole.notes ?? ''}
                  onChange={(event) => updateActiveHole({ notes: event.target.value })}
                  placeholder="Wind, landing zone, obstructions..."
                />
              </label>
              <div className="admin-coordinates">
                <p className="eyebrow">Tee coordinates</p>
                <span>
                  {activeHole.tee.lat.toFixed(5)}, {activeHole.tee.lng.toFixed(5)}
                </span>
              </div>
              <div className="admin-coordinates">
                <p className="eyebrow">Pin coordinates</p>
                <span>
                  {activeHole.pin.lat.toFixed(5)}, {activeHole.pin.lng.toFixed(5)}
                </span>
              </div>
              <div className="admin-qr-block">
                <p className="eyebrow">Hole QR target</p>
                <input
                  readOnly
                  value={holeQrTarget || buildHoleUrl(activeHole.id)}
                  aria-label="Hole deep link URL"
                />
                <div className="admin-qr-actions">
                  <button type="button" className="chip" onClick={generateHoleQr}>
                    Regenerate QR
                  </button>
                  <button type="button" className="chip" onClick={downloadHoleQr} disabled={!holeQrSvg}>
                    Download SVG
                  </button>
                </div>
                {holeQrSvg ? (
                  <div className="admin-qr-preview" dangerouslySetInnerHTML={{ __html: holeQrSvg }} />
                ) : (
                  <p className="admin-qr-hint">Generate a QR code to export a vector SVG for this hole.</p>
                )}
              </div>
            </div>
          ) : (
            <p>No holes yet. Add one to begin editing.</p>
          )}

          <section className="card admin-section-card">
            <div className="admin-editor-head">
              <div>
                <p className="eyebrow">Path Editor</p>
                <h2>{activePath?.name ?? 'Select a path'}</h2>
              </div>
              <div className="admin-editor-actions">
                <button type="button" className="chip" onClick={deleteSelectedPath} disabled={!activePath}>
                  Delete Path
                </button>
                <button
                  type="button"
                  className={markMode === 'path-waypoint' ? 'chip chip-install' : 'chip'}
                  onClick={() => setMode('path-waypoint')}
                  disabled={!activePath}
                >
                  {markMode === 'path-waypoint' ? 'Stop Waypoint Edit' : 'Edit Waypoints'}
                </button>
                <button type="button" className="chip chip-install" onClick={() => void save()}>
                  Save Changes
                </button>
              </div>
            </div>

            {activePath ? (
                <div className="admin-form-grid admin-form-grid-path">
                <label>
                  Path name
                  <input
                    value={activePath.name}
                    onChange={(event) => updateActivePath({ name: event.target.value })}
                    placeholder="Main trail"
                  />
                </label>
                  <div className="admin-coordinates">
                    <p className="eyebrow">Path points</p>
                    <span>{activePath.points.length} total points</span>
                  </div>
                  <div className="admin-path-waypoints">
                    {activePath.points.map((point, index) => (
                      <div key={`${activePath.id}-point-${index}`} className="admin-waypoint-row">
                        <span>
                          Waypoint {index + 1}: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                        </span>
                        <div className="admin-waypoint-actions">
                          <button
                            type="button"
                            className="chip"
                            onClick={() => updatePathPoint(index, { lat: point.lat + 0.0002, lng: point.lng + 0.0002 })}
                          >
                            Nudge
                          </button>
                          <button
                            type="button"
                            className="chip"
                            onClick={() => deletePathWaypoint(index)}
                            disabled={activePath.points.length <= 2}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                <div className="admin-path-hint">
                    Click <strong>Edit Waypoints</strong> and then tap the map to append waypoints to this path.
                </div>
              </div>
            ) : (
              <p>No paths yet. Add one to begin editing.</p>
            )}
          </section>

          <section className="card admin-section-card">
            <div className="admin-editor-head">
              <div>
                <p className="eyebrow">POI Editor</p>
                <h2>{activePoi?.name ?? 'Select a POI'}</h2>
              </div>
              <div className="admin-editor-actions">
                <button type="button" className="chip" onClick={deleteSelectedPoi} disabled={!activePoi}>
                  Delete POI
                </button>
                <button
                  type="button"
                  className={markMode === 'poi' ? 'chip chip-install' : 'chip'}
                  onClick={() => setMode('poi')}
                  disabled={!activePoi}
                >
                  {markMode === 'poi' ? 'Cancel Mark POI' : 'Mark POI on Map'}
                </button>
                <button type="button" className="chip chip-install" onClick={() => void save()}>
                  Save Changes
                </button>
              </div>
            </div>

            {activePoi ? (
              <div className="admin-form-grid admin-form-grid-path">
                <label>
                  POI name
                  <input
                    value={activePoi.name}
                    onChange={(event) => updateActivePoi({ name: event.target.value })}
                    placeholder="Water Station"
                  />
                </label>
                <label>
                  POI type
                  <select
                    value={activePoi.kind}
                    onChange={(event) => updateActivePoi({ kind: event.target.value as PoiKind })}
                  >
                    {poiKindOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes
                  <input
                    value={activePoi.notes ?? ''}
                    onChange={(event) => updateActivePoi({ notes: event.target.value })}
                    placeholder="Parking, restroom, water, shelter, etc."
                  />
                </label>
                <div className="admin-coordinates">
                  <p className="eyebrow">POI coordinates</p>
                  <span>
                    {activePoi.position.lat.toFixed(5)}, {activePoi.position.lng.toFixed(5)}
                  </span>
                </div>
              </div>
            ) : (
              <p>No POIs yet. Add one to begin editing.</p>
            )}
          </section>

          <section className="admin-toolbar card admin-toolbar-inline">
            <label>
              Path name
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Main trail"
              />
            </label>
            <button type="button" className="chip" onClick={commitPath}>
              Save Draft Path ({draftPoints.length} points)
            </button>
          </section>
        </section>
      </section>

      <section className="map-shell admin-map-shell">
        <div className="map-container">
          <MapContainer
            center={[
              (course.mapStart ?? course.center).lat,
              (course.mapStart ?? course.center).lng,
            ]}
            zoom={course.zoom}
            className="leaflet-map"
            scrollWheelZoom
          >
            <TileLayer
              url={
                course.tileUrl ??
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              }
              attribution={course.tileAttribution ?? '&copy; OpenStreetMap contributors'}
            />

            <ClickCapture enabled={markMode !== 'none'} onPoint={onMapPoint} />

            {course.paths.map((path) => (
              <Polyline
                key={path.id}
                pathOptions={{ color: '#2b8a3e', weight: 4 }}
                positions={path.points.map((point) => [point.lat, point.lng])}
              />
            ))}

            {draftPoints.length > 1 ? (
              <Polyline
                pathOptions={{ color: '#ff7f11', weight: 4, dashArray: '6 6' }}
                positions={draftPoints.map((point) => [point.lat, point.lng])}
              />
            ) : null}

            {course.holes.map((hole) => (
              <Marker
                key={`admin-tee-${hole.id}`}
                position={[hole.tee.lat, hole.tee.lng]}
                icon={teeIcon}
                draggable
                eventHandlers={{
                  dragend(event) {
                    const marker = event.target
                    updateHole(hole.id, 'tee', marker.getLatLng())
                  },
                }}
              />
            ))}

            {course.holes.map((hole) => (
              <Marker
                key={`admin-pin-${hole.id}`}
                position={[hole.pin.lat, hole.pin.lng]}
                icon={pinIcon}
                draggable
                eventHandlers={{
                  dragend(event) {
                    const marker = event.target
                    updateHole(hole.id, 'pin', marker.getLatLng())
                  },
                }}
              />
            ))}

            {course.pois.map((poi) => (
              <Marker
                key={`admin-poi-${poi.id}`}
                position={[poi.position.lat, poi.position.lng]}
                icon={poiIconForKind(poi.kind)}
                draggable
                eventHandlers={{
                  dragend(event) {
                    const marker = event.target
                    const position = marker.getLatLng()
                    updatePoiPosition(poi.id, { lat: position.lat, lng: position.lng })
                  },
                }}
              />
            ))}
          </MapContainer>
        </div>
      </section>
    </main>
  )
}
