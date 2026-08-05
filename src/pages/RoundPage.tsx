import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { CourseMap } from '../components/CourseMap'
import { resolvePublicOrigin } from '../lib/publicOrigin'
import { findCourse } from '../lib/storage'
import { deleteRound, loadRound, saveRound, saveRoundScore } from '../lib/roundStorage'
import { setCachedActiveRoundId } from '../lib/syncCache'
import { validateName } from '../lib/nameFilter'
import type { Course, Hole, LatLng } from '../types/course'
import { gameTypeOptions, type Round, type RoundPlayer, type RoundTeam } from '../types/round'

type ScoreTarget = RoundPlayer | RoundTeam

const isTeamScoringEnabled = (round: Round): boolean => Boolean(round.teamsEnabled)

const isTeamRound = (round: Round): boolean => isTeamScoringEnabled(round) && round.teams.length > 0

const getScoreTargets = (round: Round): ScoreTarget[] => (isTeamRound(round) ? round.teams : round.players)

const getScoreValue = (round: Round, holeId: number, targetId: string): number | null => {
  const value = round.scores[String(holeId)]?.[targetId]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const getTargetTotal = (round: Round, targetId: string, holes: Hole[]): number =>
  holes.reduce((total, hole) => {
    const value = getScoreValue(round, hole.id, targetId)
    return total + (value ?? 0)
  }, 0)

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const RoundPage = () => {
  const { roundId = '' } = useParams()
  const navigate = useNavigate()
  const [round, setRound] = useState<Round | null>(null)
  const [course, setCourse] = useState<Course | null>(null)
  const [shareCode, setShareCode] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [status, setStatus] = useState('Loading round...')
  const [playerName, setPlayerName] = useState('')
  const [playerTeamId, setPlayerTeamId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [courseMissing, setCourseMissing] = useState(false)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [scorecardCollapsed, setScorecardCollapsed] = useState(false)

  useEffect(() => {
    const load = async () => {
      const nextRound = await loadRound(roundId)

      if (!nextRound) {
        setStatus('Round not found')
        return
      }

      const nextCourse = await findCourse(nextRound.courseId)
      if (!nextCourse) {
        setStatus('Course for this round is missing on this browser')
        setRound(nextRound)
        setCourse(null)
        setCourseMissing(true)
        return
      }

      setCourseMissing(false)
      setRound(nextRound)
      setCourse(nextCourse)
      await setCachedActiveRoundId(nextCourse.id, nextRound.id)
      setScorecardCollapsed(nextRound.status !== 'active')
      const origin = await resolvePublicOrigin()
      setShareCode(`${origin}/round/${nextRound.id}`)
    }

    void load()
  }, [roundId])

  useEffect(() => {
    if (!shareCode) {
      return
    }

    const generate = async () => {
      const url = await QRCode.toDataURL(shareCode, {
        width: 220,
        margin: 1,
        color: {
          dark: '#17211e',
          light: '#ffffff',
        },
      })

      setQrCode(url)
    }

    void generate()
  }, [shareCode])

  const scoreTargets = useMemo(() => (round ? getScoreTargets(round) : []), [round])
  const gameTypeOption = useMemo(
    () => (round ? gameTypeOptions.find((option) => option.value === round.gameType) ?? null : null),
    [round],
  )
  const canToggleTeams = gameTypeOption?.allowsOptionalTeams ?? false

  const selectedHole = useMemo<Hole | null>(() => {
    if (!course || !course.holes.length) {
      return null
    }

    if (!round) {
      return course.holes[0] ?? null
    }

    return course.holes[round.currentHoleIndex] ?? course.holes[0] ?? null
  }, [course, round])

  const persist = async (nextRound: Round) => {
    try {
      const saved = await saveRound(nextRound)
      setRound(saved)
      setStatus(saved.status === 'active' ? 'Scorecard updated' : 'Round saved')
    } catch {
      setStatus('Unable to save round changes right now')
    }
  }

  const updateRound = async (updater: (value: Round) => Round) => {
    if (!round) {
      return
    }

    await persist(updater(round))
  }

  const addTeam = async () => {
    const error = validateName(teamName, 'Team name')
    if (error || !round) {
      setStatus(error || 'Round not loaded')
      return
    }

    if (!isTeamScoringEnabled(round)) {
      setStatus('Enable team scoring first to add teams')
      return
    }

    const newTeam: RoundTeam = {
      id: createId('team'),
      name: teamName.trim(),
      playerIds: [],
    }

    setTeamName('')
    await persist({ ...round, teams: [...round.teams, newTeam] })
  }

  const addPlayer = async () => {
    const error = validateName(playerName, 'Player name')
    if (error || !round) {
      setStatus(error || 'Round not loaded')
      return
    }

    const nextPlayer: RoundPlayer = {
      id: createId('player'),
      name: playerName.trim(),
      teamId: isTeamScoringEnabled(round) ? playerTeamId || undefined : undefined,
    }

    const nextTeams = isTeamScoringEnabled(round)
      ? round.teams.map((team) =>
        team.id === playerTeamId ? { ...team, playerIds: [...team.playerIds, nextPlayer.id] } : team,
      )
      : round.teams

    setPlayerName('')
    setPlayerTeamId('')
    await persist({ ...round, players: [...round.players, nextPlayer], teams: nextTeams })
  }

  const removePlayer = async (playerId: string) => {
    if (!round) {
      return
    }

    const nextPlayers = round.players.filter((player) => player.id !== playerId)
    const nextTeams = round.teams.map((team) => ({
      ...team,
      playerIds: team.playerIds.filter((memberId) => memberId !== playerId),
    }))

    await persist({ ...round, players: nextPlayers, teams: nextTeams })
  }

  const removeTeam = async (teamId: string) => {
    if (!round) {
      return
    }

    const nextPlayers = round.players.map((player) =>
      player.teamId === teamId ? { ...player, teamId: undefined } : player,
    )

    const nextTeams = round.teams.filter((team) => team.id !== teamId)
    await persist({ ...round, players: nextPlayers, teams: nextTeams })
  }

  const updatePlayerTeam = async (playerId: string, teamId: string) => {
    if (!round || !isTeamScoringEnabled(round)) {
      return
    }

    const nextPlayers = round.players.map((player) =>
      player.id === playerId ? { ...player, teamId: teamId || undefined } : player,
    )

    const nextTeams = round.teams.map((team) => ({
      ...team,
      playerIds:
        team.id === teamId
          ? team.playerIds.includes(playerId)
            ? team.playerIds
            : [...team.playerIds, playerId]
          : team.playerIds.filter((memberId) => memberId !== playerId),
    }))

    await persist({ ...round, players: nextPlayers, teams: nextTeams })
  }

  const updateScore = async (holeId: number, targetId: string, value: string) => {
    if (!round) {
      return
    }

    const parsed = value === '' ? null : Number(value)
    const nextValue = Number.isNaN(parsed) ? null : parsed
    const saved = await saveRoundScore(round.id, holeId, targetId, nextValue, new Date().toISOString())
    setRound(saved)
    setStatus('Score updated')
  }

  const setScoreForTarget = async (holeId: number, targetId: string, value: number | null) => {
    if (value === null) {
      await updateScore(holeId, targetId, '')
      return
    }

    await updateScore(holeId, targetId, String(Math.max(1, Math.min(20, value))))
  }

  const stepScoreForTarget = async (holeId: number, targetId: string, direction: 1 | -1) => {
    if (!round) {
      return
    }

    const current = getScoreValue(round, holeId, targetId)
    const base = current ?? 0
    const stepped = Math.max(1, Math.min(20, base + direction))
    await setScoreForTarget(holeId, targetId, stepped)
  }

  const toggleTeamsEnabled = async (enabled: boolean) => {
    if (!round || !canToggleTeams || round.status !== 'setup') {
      return
    }

    if (enabled) {
      await persist({ ...round, teamsEnabled: true })
      return
    }

    const clearedPlayers = round.players.map((player) => ({ ...player, teamId: undefined }))
    await persist({
      ...round,
      teamsEnabled: false,
      teams: [],
      players: clearedPlayers,
    })
  }

  const startScoring = async () => {
    if (!round) {
      return
    }

    if (!round.players.length) {
      setStatus('Add at least one player before starting scoring')
      return
    }

    if (isTeamScoringEnabled(round) && !round.teams.length) {
      setStatus('Add at least one team or disable team scoring before starting')
      return
    }

    await persist({ ...round, status: 'active' })
    setScorecardCollapsed(false)
  }

  const finishRound = async () => {
    if (!round) {
      return
    }

    await persist({ ...round, status: 'finished' })
  }

  const nextHole = async (direction: 1 | -1) => {
    if (!round || !course) {
      return
    }

    const nextIndex = Math.max(0, Math.min(course.holes.length - 1, round.currentHoleIndex + direction))
    await updateRound((current) => ({ ...current, currentHoleIndex: nextIndex }))
  }

  const selectHole = async (holeId: number) => {
    if (!round || !course) {
      return
    }

    const nextIndex = course.holes.findIndex((hole) => hole.id === holeId)
    if (nextIndex < 0 || nextIndex === round.currentHoleIndex) {
      return
    }

    await updateRound((current) => ({ ...current, currentHoleIndex: nextIndex }))
  }

  const requestGps = () => {
    if (!navigator.geolocation) {
      setStatus('GPS is not available on this device')
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
        setStatus('GPS permission was denied')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
      },
    )
  }

  const copyShareLink = async () => {
    if (!shareCode) {
      return
    }

    await navigator.clipboard.writeText(shareCode)
    setStatus('Share link copied')
  }

  const deleteThisRound = async () => {
    if (!round) {
      return
    }

    await deleteRound(round.id)
    await setCachedActiveRoundId(round.courseId, null)
    navigate('/rounds/new?courseId=' + round.courseId)
  }

  if (status === 'Round not found') {
    return (
      <main className="page portal-page">
        <section className="portal-card">
          <p className="eyebrow">Round</p>
          <h1>Round not found</h1>
          <Link className="chip chip-install" to="/rounds/new">
            Create a New Round
          </Link>
        </section>
      </main>
    )
  }

  if (courseMissing) {
    return (
      <main className="page portal-page">
        <section className="portal-card">
          <p className="eyebrow">Round</p>
          <h1>Course data missing</h1>
          <p className="portal-copy">
            This round exists, but its course is no longer available from the server. Import or recreate the course in Admin Portal.
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

  if (!round || !course || !selectedHole) {
    return <main className="page"><p>{status}</p></main>
  }

  return (
    <main className="page round-page">
      <section className="portal-card portal-card-wide round-header-card">
        <div>
          <p className="eyebrow">Round</p>
          <h1>{round.name}</h1>
          <p className="portal-copy">
            {course.name} · {round.gameType} · {round.status}
          </p>
        </div>

        <div className="portal-actions-row">
          <Link className="chip" to={`/course/${course.id}?roundId=${round.id}`}>
            Back to Course
          </Link>
          <button type="button" className="chip" onClick={() => void copyShareLink()}>
            Copy Share Link
          </button>
          <button type="button" className="chip chip-install" onClick={() => void startScoring()} disabled={round.status !== 'setup'}>
            Start Scoring
          </button>
          <button type="button" className="chip" onClick={() => void finishRound()} disabled={round.status !== 'active'}>
            Finish Round
          </button>
          <button type="button" className="chip" onClick={() => void deleteThisRound()}>
            Delete Round
          </button>
        </div>
      </section>

      <section className="round-layout">
        <section className="card round-share-card">
          <div>
            <p className="eyebrow">Share</p>
            <h2>Game code</h2>
          </div>
          <div className="round-code">{round.id}</div>
          <p className="portal-copy">Players can open the round from this code or the QR code below.</p>
          {qrCode ? <img className="round-qr" src={qrCode} alt="Round QR code" /> : null}
          <p className="portal-copy round-url">{shareCode}</p>
        </section>

        <section className="card round-roster-card">
          <div className="admin-editor-head">
            <div>
              <p className="eyebrow">Roster</p>
              <h2>{isTeamScoringEnabled(round) ? 'Add players and teams' : 'Add players'}</h2>
            </div>
            {canToggleTeams ? (
              <label className="round-toggle-row">
                <input
                  type="checkbox"
                  checked={isTeamScoringEnabled(round)}
                  disabled={round.status !== 'setup'}
                  onChange={(event) => void toggleTeamsEnabled(event.target.checked)}
                />
                <span>Use teams for scoring</span>
              </label>
            ) : null}
          </div>

          <div className={isTeamScoringEnabled(round) ? 'round-roster-grid' : 'round-roster-grid round-roster-grid-single'}>
            {isTeamScoringEnabled(round) ? (
              <div className="round-roster-panel">
                <h3>Teams</h3>
                <div className="round-form-row">
                  <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" />
                  <button type="button" className="chip chip-install" onClick={() => void addTeam()}>
                    Add Team
                  </button>
                </div>
                <div className="round-list">
                  {round.teams.map((team) => (
                    <div key={team.id} className="round-list-item">
                      <div>
                        <strong>{team.name}</strong>
                        <span>{team.playerIds.length} players</span>
                      </div>
                      <button type="button" className="chip" onClick={() => void removeTeam(team.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="round-roster-panel">
              <h3>Players</h3>
              <div className="round-form-row">
                <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Player name" />
                {isTeamScoringEnabled(round) ? (
                  <select value={playerTeamId} onChange={(event) => setPlayerTeamId(event.target.value)}>
                    <option value="">No team</option>
                    {round.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button type="button" className="chip chip-install" onClick={() => void addPlayer()}>
                  Add Player
                </button>
              </div>
              <div className="round-list">
                {round.players.map((player) => (
                  <div key={player.id} className="round-list-item">
                    <div>
                      <strong>{player.name}</strong>
                      {isTeamScoringEnabled(round) ? (
                        <span>
                          {round.teams.find((team) => team.id === player.teamId)?.name ?? 'No team'}
                        </span>
                      ) : (
                        <span>Individual score</span>
                      )}
                    </div>
                    <div className="round-player-actions">
                      {isTeamScoringEnabled(round) ? (
                        <select value={player.teamId ?? ''} onChange={(event) => void updatePlayerTeam(player.id, event.target.value)}>
                          <option value="">No team</option>
                          {round.teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <button type="button" className="chip" onClick={() => void removePlayer(player.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>

      {round.status !== 'setup' ? (
        <section className="card round-scorecard-card">
          <div className="admin-editor-head">
            <div>
              <p className="eyebrow">Scorecard</p>
              <h2>{selectedHole.name}</h2>
            </div>
            <div className="admin-editor-actions">
              <button type="button" className="chip" onClick={() => setScorecardCollapsed((value) => !value)}>
                {scorecardCollapsed ? 'Expand Scorecard' : 'Collapse Scorecard'}
              </button>
              <button type="button" className="chip" onClick={() => void nextHole(-1)} disabled={round.currentHoleIndex === 0}>
                Previous Hole
              </button>
              <button type="button" className="chip chip-install" onClick={() => void nextHole(1)} disabled={round.currentHoleIndex >= course.holes.length - 1}>
                Next Hole
              </button>
            </div>
          </div>

          {!scorecardCollapsed ? (
            <>
              {round.status !== 'active' ? (
                <p className="portal-copy">Round is not active. Scores are read-only.</p>
              ) : null}

              <div className="round-score-meta">
                <span>Hole {selectedHole.id}</span>
                <span>Par {selectedHole.par}</span>
                <span>{isTeamRound(round) ? 'Team' : 'Player'} scoring</span>
              </div>

              {!scoreTargets.length ? (
                <p className="portal-copy">
                  {isTeamScoringEnabled(round)
                    ? 'Add teams to start scoring in team mode.'
                    : 'Add players to start scoring.'}
                </p>
              ) : (
                <div className="round-score-simple-list">
                  {scoreTargets.map((target) => {
                    const current = getScoreValue(round, selectedHole.id, target.id)
                    const total = getTargetTotal(round, target.id, course.holes)

                    return (
                      <article key={target.id} className="round-score-simple-row">
                        <div className="round-score-simple-head">
                          <strong>{target.name}</strong>
                          <span>Total {total}</span>
                        </div>

                        <div className="round-score-stepper">
                          <button
                            type="button"
                            className="chip"
                            onClick={() => void stepScoreForTarget(selectedHole.id, target.id, -1)}
                            disabled={round.status !== 'active'}
                          >
                            -
                          </button>
                          <input
                            className="round-score-simple-input"
                            type="number"
                            min="1"
                            max="20"
                            inputMode="numeric"
                            disabled={round.status !== 'active'}
                            value={current ?? ''}
                            onChange={(event) => void updateScore(selectedHole.id, target.id, event.target.value)}
                          />
                          <button
                            type="button"
                            className="chip chip-install"
                            onClick={() => void stepScoreForTarget(selectedHole.id, target.id, 1)}
                            disabled={round.status !== 'active'}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="chip"
                            onClick={() => void setScoreForTarget(selectedHole.id, target.id, null)}
                            disabled={round.status !== 'active'}
                          >
                            Clear
                          </button>
                        </div>

                        <div className="round-score-quick-picks">
                          {[2, 3, 4, 5, 6].map((value) => (
                            <button
                              key={`${target.id}-${value}`}
                              type="button"
                              className="chip"
                              onClick={() => void setScoreForTarget(selectedHole.id, target.id, value)}
                              disabled={round.status !== 'active'}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      <section className="action-row">
        <button type="button" className="chip" onClick={requestGps}>
          Allow GPS / Start Directions
        </button>
      </section>

      <section className="round-map-section">
        <CourseMap
          course={course}
          selectedHole={selectedHole}
          userLocation={userLocation}
          onSelectHole={(holeId) => void selectHole(holeId)}
        />
      </section>

      <p className="cache-status">{status || 'Round loaded.'}</p>
    </main>
  )
}
