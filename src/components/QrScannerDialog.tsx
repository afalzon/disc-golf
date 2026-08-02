import { useEffect, useRef, useState } from 'react'

type QrScannerDialogProps = {
  open: boolean
  onClose: () => void
  onDetected: (value: string) => void
}

export const QrScannerDialog = ({
  open,
  onClose,
  onDetected,
}: QrScannerDialogProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string>('')
  const scannerUnsupported = typeof BarcodeDetector === 'undefined'

  useEffect(() => {
    if (!open) {
      return
    }

    if (scannerUnsupported) {
      return
    }

    let stream: MediaStream | null = null
    let frameId = 0
    const detector = new BarcodeDetector({ formats: ['qr_code'] })

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const scan = async () => {
          if (!videoRef.current) {
            return
          }

          try {
            const results = await detector.detect(videoRef.current)
            if (results[0]?.rawValue) {
              onDetected(results[0].rawValue)
              onClose()
              return
            }
          } catch {
            // Ignore failed frames while camera warms up.
          }

          frameId = window.requestAnimationFrame(scan)
        }

        frameId = window.requestAnimationFrame(scan)
      } catch {
        setError('Camera permission denied or unavailable.')
      }
    }

    void start()

    return () => {
      window.cancelAnimationFrame(frameId)
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop()
        }
      }
    }
  }, [onClose, onDetected, open, scannerUnsupported])

  if (!open) {
    return null
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="QR scanner"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Scan Course QR</h2>
        <p>Point your camera at a course QR code to open that map.</p>
        <video ref={videoRef} muted playsInline className="scanner-video" />
        {scannerUnsupported ? (
          <p className="error">QR scanning is not supported in this browser yet.</p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button type="button" className="chip" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  )
}
