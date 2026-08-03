import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CourseMap } from '../components/CourseMap'
import { QrScannerDialog } from '../components/QrScannerDialog'
import { TopBar } from '../components/TopBar'
import { cacheCourseTiles } from '../lib/offline'
import { resolveInternalRoute } from '../lib/qr'
import { findCourse } from '../lib/storage'
import type { Course, Hole, LatLng } from '../types/course'

type DeferredPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

export const CoursePage = () => {
  const { courseId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const holeFromQuery = Number(params.get('hole') ?? '1')
  const selectedHoleId =
    !Number.isNaN(holeFromQuery) && holeFromQuery > 0 ? holeFromQuery : 1

  const [course, setCourse] = useState<Course | null>(null)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [cacheStatus, setCacheStatus] = useState('Offline cache not primed')
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [courseMissing, setCourseMissing] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!courseId) {
        setCourseMissing(true)
        return
      }

      const nextCourse = await findCourse(courseId)
      if (!nextCourse) {
        setCourse(null)
        setCourseMissing(true)
        return
      }

      setCourseMissing(false)
      setCourse(nextCourse)
    }

    void load()
  }, [courseId])

  useEffect(() => {
    const checkInstalled = () => {
      const nav = navigator as NavigatorWithStandalone
      const inStandalone = window.matchMedia('(display-mode: standalone)').matches
      const iosStandalone = nav.standalone === true
      setIsInstalled(inStandalone || iosStandalone)
    }

    checkInstalled()

    const media = window.matchMedia('(display-mode: standalone)')
    const onDisplayModeChange = () => checkInstalled()
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      setCacheStatus('App installed. Offline mode is available after opening a course and caching tiles.')
    }

    media.addEventListener('change', onDisplayModeChange)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      media.removeEventListener('change', onDisplayModeChange)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as DeferredPrompt)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const selectedHole = useMemo<Hole | null>(() => {
    if (!course) {
      return null
    }

    return course.holes.find((hole) => hole.id === selectedHoleId) ?? course.holes[0] ?? null
  }, [course, selectedHoleId])

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      return
    }

    navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => {
        setCacheStatus('GPS permission was denied')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
      },
    )
  }, [])

  const installApp = useCallback(async () => {
    const nav = navigator as NavigatorWithStandalone
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)

    if (isInstalled) {
      setCacheStatus('App is already installed on this device.')
      return
    }

    if (!deferredPrompt) {
      if (isIos) {
        setCacheStatus('On iPhone/iPad: use Share, then Add to Home Screen.')
      } else {
        setCacheStatus('Install prompt not available yet. Keep using the site over HTTPS and try again.')
      }
      return
    }

    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setCacheStatus('Install accepted. Finish install from your browser prompt.')
    } else {
      setCacheStatus('Install dismissed. You can try again later.')
    }
    setDeferredPrompt(null)
    if (nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }
  }, [deferredPrompt, isInstalled])

  const installUi = useMemo(() => {
    const nav = navigator as NavigatorWithStandalone
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)

    if (isInstalled) {
      return {
        label: 'Installed',
        hint: 'App is installed. Use Enable Offline to cache map tiles for no-coverage use.',
        disabled: true,
      }
    }

    if (deferredPrompt) {
      return {
        label: 'Install App',
        hint: 'Ready to install. Tap Install App to save this app to your device.',
        disabled: false,
      }
    }

    if (isIos) {
      return {
        label: 'Add to Home Screen',
        hint: 'On iPhone/iPad, open Share and choose Add to Home Screen.',
        disabled: true,
      }
    }

    if (nav.standalone === true) {
      return {
        label: 'Installed',
        hint: 'App is already running in standalone mode.',
        disabled: true,
      }
    }

    return {
      label: 'Install Unavailable',
      hint: 'Install prompt not available on this browser right now.',
      disabled: true,
    }
  }, [deferredPrompt, isInstalled])

  const handleCache = useCallback(async () => {
    if (!course) {
      return
    }

    setCacheStatus('Caching nearby map tiles...')
    const count = await cacheCourseTiles(course)
    setCacheStatus(`Offline mode ready (${count} tiles cached)`)
  }, [course])

  const handleSelectHole = useCallback(
    (holeId: number) => {
      const next = new URLSearchParams(params)
      next.set('hole', String(holeId))
      setParams(next)
    },
    [params, setParams],
  )

  const handleQrDetected = useCallback(
    (value: string) => {
      const internalRoute = resolveInternalRoute(value)

      if (internalRoute) {
        navigate(internalRoute)
      } else {
        setCacheStatus('QR detected, but it is not a route for this app')
      }
    },
    [navigate],
  )

  if (courseMissing) {
    return (
      <main className="page portal-page">
        <section className="portal-card">
          <p className="eyebrow">Course</p>
          <h1>Course not found</h1>
          <p className="portal-copy">
            This course is not available from the server. Open the admin portal to create, import, or select another course.
          </p>
          <div className="portal-actions-row">
            <Link className="chip chip-install" to="/admin-portal">
              Open Admin Portal
            </Link>
          </div>
        </section>
      </main>
    )
  }

  if (!course || !selectedHole) {
    return <main className="page"><p>Loading course...</p></main>
  }

  const buildLabel = `v${__APP_VERSION__} (${__APP_COMMIT__}) ${__APP_BUILD_TIME__.slice(0, 16).replace('T', ' ')}Z`

  return (
    <main className="page">
      <TopBar
        title={course.name}
        buildLabel={buildLabel}
        canInstall={Boolean(deferredPrompt)}
        installLabel={installUi.label}
        installHint={installUi.hint}
        installDisabled={installUi.disabled}
        onInstall={() => void installApp()}
        onCacheOffline={() => void handleCache()}
        onScanQr={() => setScannerOpen(true)}
        onStartRound={() => navigate(`/rounds/new?courseId=${course.id}`)}
        cacheStatus={cacheStatus}
      />

      <section className="action-row">
        <button type="button" className="chip" onClick={requestGps}>
          Allow GPS / Start Directions
        </button>
      </section>

      <CourseMap
        course={course}
        selectedHole={selectedHole}
        userLocation={userLocation}
        onSelectHole={handleSelectHole}
      />

      <QrScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleQrDetected}
      />
    </main>
  )
}
