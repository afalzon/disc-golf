import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createRound } from '../lib/roundStorage'
import { listCourses, type CourseSummary } from '../lib/storage'
import { validateName } from '../lib/nameFilter'
import { gameTypeOptions, type GameType } from '../types/round'

export const RoundSetupPage = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [courseId, setCourseId] = useState(params.get('courseId') ?? '')
  const [roundName, setRoundName] = useState(() =>
    new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date()),
  )
  const [gameType, setGameType] = useState<GameType>('standard')
  const [teamsEnabled, setTeamsEnabled] = useState(false)
  const [status, setStatus] = useState('')

  const selectedGameTypeOption = useMemo(
    () => gameTypeOptions.find((option) => option.value === gameType),
    [gameType],
  )

  const canToggleTeams = selectedGameTypeOption?.allowsOptionalTeams ?? false

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId) ?? null,
    [courseId, courses],
  )

  useEffect(() => {
    const load = async () => {
      const nextCourses = await listCourses()

      setCourses(nextCourses)
      setCourseId((current) => current || nextCourses[0]?.id || '')
    }

    void load()
  }, [])

  useEffect(() => {
    if (!canToggleTeams) {
      setTeamsEnabled(true)
    }
  }, [canToggleTeams])

  const handleCreate = async () => {
    const courseError = selectedCourse ? null : 'Choose a course first'
    const roundError = validateName(roundName, 'Round name')

    if (courseError || roundError) {
      setStatus(courseError || roundError || '')
      return
    }

    const round = await createRound({
      courseId,
      name: roundName.trim(),
      gameType,
      teamsEnabled: canToggleTeams ? teamsEnabled : true,
    })

    navigate(`/round/${round.id}`)
  }

  return (
    <main className="page portal-page">
      <section className="portal-card portal-card-wide round-setup-shell">
        <p className="eyebrow">Round Setup</p>
        <h1>Create a game</h1>
        <p className="portal-copy">
          Start with a round, then add players and teams before opening the live scorecard.
        </p>

        <div className="round-setup-grid">
          {courses.length > 1 ? (
            <label className="portal-field">
              Course
              <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="portal-field">
            Round name
            <input
              value={roundName}
              onChange={(event) => setRoundName(event.target.value)}
              placeholder="Wednesday"
            />
          </label>

          <label className="portal-field">
            Game type
            <select value={gameType} onChange={(event) => setGameType(event.target.value as GameType)}>
              {gameTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {canToggleTeams ? (
            <div className="portal-field round-option-checkbox">
              <span>Scoring mode</span>
              <label className="round-toggle-row">
                <input
                  type="checkbox"
                  checked={teamsEnabled}
                  onChange={(event) => setTeamsEnabled(event.target.checked)}
                />
                <span>Use teams for scorecard</span>
              </label>
            </div>
          ) : (
            <div className="portal-field round-option-fixed">
              <span>Scoring mode</span>
              <strong>Team scoring required for this game type</strong>
            </div>
          )}

          <div className="round-type-help">
            {selectedGameTypeOption?.description}
          </div>
        </div>

        <div className="portal-actions-row">
          <button type="button" className="chip chip-install" onClick={() => void handleCreate()}>
            Create Round
          </button>
          <button type="button" className="chip" onClick={() => navigate('/admin-portal')}>
            Back to Courses
          </button>
        </div>

        <p className="cache-status">
          {status || (courses.length ? 'Pick a course and create the game.' : 'No courses are available from the server yet. Create or import one in Admin Portal first.')}
        </p>
      </section>
    </main>
  )
}
