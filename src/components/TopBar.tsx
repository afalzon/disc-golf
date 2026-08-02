type TopBarProps = {
  title: string
  canInstall: boolean
  onInstall: () => void
  onCacheOffline: () => void
  onScanQr: () => void
  onStartRound: () => void
  cacheStatus: string
}

export const TopBar = ({
  title,
  canInstall,
  onInstall,
  onCacheOffline,
  onScanQr,
  onStartRound,
  cacheStatus,
}: TopBarProps) => {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Disc Golf Navigator</p>
        <h1>{title}</h1>
      </div>

      <nav className="topbar-actions" aria-label="Main actions">
        <button type="button" className="chip chip-install" onClick={onStartRound}>
          Start Round
        </button>
        <button type="button" className="chip" onClick={onScanQr}>
          Scan QR
        </button>
        <button type="button" className="chip" onClick={onCacheOffline}>
          Enable Offline
        </button>
        <button
          type="button"
          className="chip chip-install"
          disabled={!canInstall}
          onClick={onInstall}
        >
          Install App
        </button>
      </nav>

      <p className="cache-status">{cacheStatus}</p>
    </header>
  )
}
