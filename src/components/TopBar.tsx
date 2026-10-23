type TopBarProps = {
  title: string
  buildLabel: string
  canInstall: boolean
  installLabel: string
  installHint: string
  installDisabled: boolean
  onInstall: () => void
  onCacheOffline: () => void
  onScanQr: () => void
  onStartRound: () => void
  startRoundLabel?: string
  cacheStatus: string
}

export const TopBar = ({
  title,
  buildLabel,
  canInstall,
  installLabel,
  installHint,
  installDisabled,
  onInstall,
  onCacheOffline,
  onScanQr,
  onStartRound,
  startRoundLabel = 'Start Round',
  cacheStatus,
}: TopBarProps) => {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Disc Golf Navigator</p>
        <h1>{title}</h1>
        <p className="build-version">{buildLabel}</p>
      </div>

      <nav className="topbar-actions" aria-label="Main actions">
        <button type="button" className="chip chip-install" onClick={onStartRound}>
          {startRoundLabel}
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
          disabled={installDisabled}
          onClick={onInstall}
          aria-disabled={installDisabled}
          title={!canInstall ? installHint : undefined}
        >
          {installLabel}
        </button>
      </nav>

      <p className="install-status">{installHint}</p>
      <p className="cache-status">{cacheStatus}</p>
    </header>
  )
}
