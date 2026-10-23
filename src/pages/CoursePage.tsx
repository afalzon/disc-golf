import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { CourseMap } from '../components/CourseMap'
import { QrScannerDialog } from '../components/QrScannerDialog'
import { TopBar } from '../components/TopBar'
import { cacheCourseTiles } from '../lib/offline'
import { importRoundFromSync, loadRound } from '../lib/roundStorage'
import { resolvePublicOrigin } from '../lib/publicOrigin'
import { decodeRoundSyncToken, encodeRoundSyncToken, resolveInternalRoute } from '../lib/qr'
import { findCourse } from '../lib/storage'
import { getCachedActiveRoundId, setCachedActiveRoundId } from '../lib/syncCache'
import type { Course, Hole, LatLng } from '../types/course'
import type { Round } from '../types/round'

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
  const roundIdFromQuery = params.get('roundId')?.trim() ?? ''
  const selectedHoleId =
    !Number.isNaN(holeFromQuery) && holeFromQuery > 0 ? holeFromQuery : 1

  const [course, setCourse] = useState<Course | null>(null)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [cacheStatus, setCacheStatus] = useState('Offline cache not primed')
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [courseMissing, setCourseMissing] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [activeRound, setActiveRound] = useState<Round | null>(null)
  const [roundShareCode, setRoundShareCode] = useState('')
  const [roundSyncQrCode, setRoundSyncQrCode] = useState('')
  const [roundSyncQrOpen, setRoundSyncQrOpen] = useState(false)

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

      const linkedRoundId = roundIdFromQuery || (await getCachedActiveRoundId(nextCourse.id)) || ''
      if (!linkedRoundId) {
        setActiveRound(null)
        return
      }

      const linkedRound = await loadRound(linkedRoundId)
      if (!linkedRound || linkedRound.courseId !== nextCourse.id) {
        setActiveRound(null)
        await setCachedActiveRoundId(nextCourse.id, null)

        if (roundIdFromQuery) {
          const nextQuery = new URLSearchParams(params)
          nextQuery.delete('roundId')
          setParams(nextQuery, { replace: true })
        }
        return
      }

      setActiveRound(linkedRound)
      await setCachedActiveRoundId(nextCourse.id, linkedRound.id)

      if (!roundIdFromQuery) {
        const nextQuery = new URLSearchParams(params)
        nextQuery.set('roundId', linkedRound.id)
        setParams(nextQuery, { replace: true })
      }
    }

    void load()
  }, [courseId, params, roundIdFromQuery, setParams])

  useEffect(() => {
    if (!activeRound) {
      setRoundShareCode('')
      return
    }

    const buildShareCode = async () => {
      const origin = await resolvePublicOrigin()
      setRoundShareCode(`${origin}/round/${activeRound.id}`)
    }

    void buildShareCode()
  }, [activeRound])

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
    const isAndroid = /android/i.test(navigator.userAgent)

    if (isInstalled) {
      setCacheStatus('App is already installed on this device.')
      return
    }

    if (!deferredPrompt) {
      if (isIos) {
        setCacheStatus('On iPhone/iPad: use Share, then Add to Home Screen.')
      } else if (isAndroid) {
        setCacheStatus('On Android: open the browser menu and tap Install app or Add to Home screen.')
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
    const isAndroid = /android/i.test(navigator.userAgent)

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

    if (isAndroid) {
      return {
        label: 'Install From Browser Menu',
        hint: 'If this button is unavailable, open your browser menu and choose Install app or Add to Home screen.',
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
      hint: 'Install prompt not available on this browser right now. On some browsers, installation is in the browser menu.',
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

  const copyRoundShareLink = useCallback(async () => {
    if (!roundShareCode) {
      setCacheStatus('Round share link not ready yet')
      return
    }

    await navigator.clipboard.writeText(roundShareCode)
    setCacheStatus('Round share link copied')
  }, [roundShareCode])

  const showRoundSyncQr = useCallback(async () => {
    if (!activeRound) {
      setCacheStatus('No active round loaded for this course')
      return
    }

    const token = encodeRoundSyncToken(activeRound)
    const qr = await QRCode.toDataURL(token, {
      width: 340,
      margin: 1,
      color: {
        dark: '#17211e',
        light: '#ffffff',
      },
    })

    setRoundSyncQrCode(qr)
    setRoundSyncQrOpen(true)
  }, [activeRound])

  const handleQrDetected = useCallback(
    (value: string) => {
      void (async () => {
        const syncedRound = decodeRoundSyncToken(value)

        if (syncedRound) {
          const imported = await importRoundFromSync(syncedRound)
          if (course && imported.courseId === course.id) {
            setActiveRound(imported)
            await setCachedActiveRoundId(course.id, imported.id)

            const nextQuery = new URLSearchParams(params)
            nextQuery.set('roundId', imported.id)
            setParams(nextQuery, { replace: true })
            setCacheStatus('Round scorecard synced from QR')
          } else {
            setCacheStatus('Round data imported. Open the matching course to continue.')
          }
          return
        }

        const internalRoute = resolveInternalRoute(value)
        if (!internalRoute) {
          setCacheStatus('QR detected, but it is not a route or sync payload for this app')
          return
        }

        const parsed = new URL(internalRoute, window.location.origin)
        if (activeRound && parsed.pathname === `/course/${activeRound.courseId}` && !parsed.searchParams.has('roundId')) {
          parsed.searchParams.set('roundId', activeRound.id)
        }

        navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`)
      })()
    },
    [activeRound, course, navigate, params, setParams],
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
        onStartRound={() =>
          activeRound ? navigate(`/round/${activeRound.id}`) : navigate(`/rounds/new?courseId=${course.id}`)
        }
        startRoundLabel={activeRound ? 'Open Round' : 'Start Round'}
        cacheStatus={cacheStatus}
      />

      {activeRound ? (
        <section className="card course-round-card">
          <div className="admin-editor-head">
            <div>
              <p className="eyebrow">Active Round</p>
              <h2>{activeRound.name}</h2>
            </div>
            <div className="admin-editor-actions">
              <button type="button" className="chip chip-install" onClick={() => navigate(`/round/${activeRound.id}`)}>
                Open Scorecard
              </button>
              <button type="button" className="chip" onClick={() => void copyRoundShareLink()}>
                Share Link
              </button>
              <button type="button" className="chip" onClick={() => void showRoundSyncQr()}>
                Share Sync QR
              </button>
              <button type="button" className="chip" onClick={() => setScannerOpen(true)}>
                Import Sync QR
              </button>
            </div>
          </div>
          <p className="portal-copy">
            Status: {activeRound.status} · Hole {activeRound.currentHoleIndex + 1}
          </p>
        </section>
      ) : null}

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

      {roundSyncQrOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setRoundSyncQrOpen(false)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Round sync QR"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Round Sync QR</h2>
            <p>Scan this QR on another device to merge scorecard data while offline.</p>
            {roundSyncQrCode ? <img className="round-sync-qr" src={roundSyncQrCode} alt="Round sync QR code" /> : null}
            <button type="button" className="chip" onClick={() => setRoundSyncQrOpen(false)}>
              Close
            </button>
          </section>
        </div>
      ) : null}
    </main>
  )
}
