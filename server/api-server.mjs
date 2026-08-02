import express from 'express'
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data')
const dataFile = path.join(dataDir, 'app-db.sqlite')
const port = Number(process.env.PORT || 8080)

const app = express()
app.use(express.json({ limit: '2mb' }))

await mkdir(dataDir, { recursive: true })

const db = new Database(dataFile)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    name TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_courses_updated_at ON courses(updated_at);
  CREATE INDEX IF NOT EXISTS idx_rounds_updated_at ON rounds(updated_at);
  CREATE INDEX IF NOT EXISTS idx_rounds_course_id ON rounds(course_id);
`)

const nowIso = () => new Date().toISOString()

const setSetting = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`)

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?')

const getDefaultCourseId = () => {
  const row = getSetting.get('default-course-id')
  return row ? row.value : null
}

const byName = (left, right) => left.name.localeCompare(right.name)

const toCourseSummary = (course, defaultCourseId) => ({
  id: course.id,
  name: course.name,
  isDefault: course.id === defaultCourseId,
})

const generateCourseId = () => `course-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const generateRoundId = () => `round-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const parseCourseRow = (row) => {
  const course = JSON.parse(row.data)
  return {
    ...course,
    id: row.id,
    name: row.name,
  }
}

const parseRoundRow = (row) => {
  const round = JSON.parse(row.data)
  return {
    ...round,
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  }
}

const upsertCourse = db.prepare(`
  INSERT INTO courses (id, name, data, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    data = excluded.data,
    updated_at = excluded.updated_at
`)

const getCourseById = db.prepare('SELECT id, name, data, updated_at FROM courses WHERE id = ?')
const listCourseRows = db.prepare('SELECT id, name, data, updated_at FROM courses')
const deleteCourseById = db.prepare('DELETE FROM courses WHERE id = ?')
const deleteRoundsByCourseId = db.prepare('DELETE FROM rounds WHERE course_id = ?')

const createRoundStmt = db.prepare(`
  INSERT INTO rounds (id, course_id, name, revision, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const getRoundById = db.prepare('SELECT id, course_id, name, revision, data, created_at, updated_at FROM rounds WHERE id = ?')
const deleteRoundById = db.prepare('DELETE FROM rounds WHERE id = ?')
const updateRoundStmt = db.prepare(`
  UPDATE rounds
  SET name = ?, revision = ?, data = ?, updated_at = ?
  WHERE id = ?
`)

const listChangedCoursesSince = db.prepare('SELECT id, name, data, updated_at FROM courses WHERE updated_at > ? ORDER BY updated_at ASC')
const listChangedRoundsSince = db.prepare('SELECT id, course_id, name, revision, data, created_at, updated_at FROM rounds WHERE updated_at > ? ORDER BY updated_at ASC')

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/default-course', async (_req, res) => {
  res.json({ courseId: getDefaultCourseId() })
})

app.put('/api/default-course', async (req, res) => {
  const { courseId } = req.body || {}
  if (typeof courseId !== 'string' || !courseId.trim()) {
    res.status(400).json({ error: 'courseId is required' })
    return
  }

  const exists = getCourseById.get(courseId)
  if (!exists) {
    res.status(404).json({ error: 'Course not found' })
    return
  }

  setSetting.run('default-course-id', courseId, nowIso())
  res.status(204).end()
})

app.get('/api/courses', async (_req, res) => {
  const defaultCourseId = getDefaultCourseId()
  const courseRows = listCourseRows.all()

  const summaries = courseRows
    .map((row) => toCourseSummary({ id: row.id, name: row.name }, defaultCourseId))
    .sort((left, right) => {
      if (left.isDefault === right.isDefault) {
        return byName(left, right)
      }

      return left.isDefault ? -1 : 1
    })

  res.json(summaries)
})

app.get('/api/courses/:courseId', async (req, res) => {
  const row = getCourseById.get(req.params.courseId)

  if (!row) {
    res.status(404).json({ error: 'Course not found' })
    return
  }

  res.json(parseCourseRow(row))
})

app.post('/api/courses', async (req, res) => {
  const name = String(req.body?.name || '').trim() || 'New Course'
  const template = req.body?.template && typeof req.body.template === 'object' ? req.body.template : null

  const created = {
    ...(template || {}),
    id: generateCourseId(),
    name,
  }

  upsertCourse.run(created.id, created.name, JSON.stringify(created), nowIso())
  res.status(201).json(created)
})

app.put('/api/courses/:courseId', async (req, res) => {
  const course = req.body
  if (!course || typeof course !== 'object') {
    res.status(400).json({ error: 'Course payload is required' })
    return
  }

  const nextCourse = {
    ...course,
    id: req.params.courseId,
  }

  upsertCourse.run(nextCourse.id, String(nextCourse.name || '').trim() || 'Course', JSON.stringify(nextCourse), nowIso())
  res.json(nextCourse)
})

app.patch('/api/courses/:courseId', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  const row = getCourseById.get(req.params.courseId)
  if (!row) {
    res.status(404).json({ error: 'Course not found' })
    return
  }

  const current = parseCourseRow(row)
  const nextCourse = {
    ...current,
    name,
  }

  upsertCourse.run(nextCourse.id, nextCourse.name, JSON.stringify(nextCourse), nowIso())
  res.json(nextCourse)
})

app.post('/api/courses/:courseId/duplicate', async (req, res) => {
  const row = getCourseById.get(req.params.courseId)
  if (!row) {
    res.status(404).json({ error: 'Course not found' })
    return
  }

  const source = parseCourseRow(row)

  const copy = {
    ...source,
    id: generateCourseId(),
    name: `${source.name} Copy`,
  }

  upsertCourse.run(copy.id, copy.name, JSON.stringify(copy), nowIso())
  res.status(201).json(copy)
})

app.post('/api/courses/import', async (req, res) => {
  const payload = req.body?.course
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'Course payload is required' })
    return
  }

  const desiredId = typeof payload.id === 'string' && payload.id ? payload.id : generateCourseId()
  const exists = getCourseById.get(desiredId)
  const imported = {
    ...payload,
    id: exists ? generateCourseId() : desiredId,
    name: String(payload.name || '').trim() || 'Imported Course',
  }

  upsertCourse.run(imported.id, imported.name, JSON.stringify(imported), nowIso())
  res.status(201).json(imported)
})

app.delete('/api/courses/:courseId', async (req, res) => {
  const tx = db.transaction((courseId) => {
    deleteCourseById.run(courseId)
    deleteRoundsByCourseId.run(courseId)
    if (getDefaultCourseId() === courseId) {
      setSetting.run('default-course-id', '', nowIso())
      db.prepare('DELETE FROM settings WHERE key = ?').run('default-course-id')
    }
  })

  tx(req.params.courseId)

  res.status(204).end()
})

app.post('/api/rounds', async (req, res) => {
  const courseId = String(req.body?.courseId || '').trim()
  const name = String(req.body?.name || '').trim() || 'New Round'
  const gameType = String(req.body?.gameType || '').trim()

  if (!courseId) {
    res.status(400).json({ error: 'courseId is required' })
    return
  }

  const courseExists = getCourseById.get(courseId)
  if (!courseExists) {
    res.status(404).json({ error: 'Course not found' })
    return
  }

  const now = nowIso()
  const round = {
    id: generateRoundId(),
    courseId,
    name,
    gameType,
    status: 'setup',
    createdAt: now,
    updatedAt: now,
    players: [],
    teams: [],
    scores: {},
    scoreMeta: {},
    currentHoleIndex: 0,
    revision: 1,
  }

  createRoundStmt.run(round.id, round.courseId, round.name, round.revision, JSON.stringify(round), round.createdAt, round.updatedAt)

  res.status(201).json(round)
})

app.get('/api/rounds/:roundId', async (req, res) => {
  const row = getRoundById.get(req.params.roundId)

  if (!row) {
    res.status(404).json({ error: 'Round not found' })
    return
  }

  res.json(parseRoundRow(row))
})

app.put('/api/rounds/:roundId', async (req, res) => {
  const round = req.body?.round
  const expectedRevision = req.body?.expectedRevision
  if (!round || typeof round !== 'object') {
    res.status(400).json({ error: 'Round payload is required' })
    return
  }

  const row = getRoundById.get(req.params.roundId)
  if (!row) {
    res.status(404).json({ error: 'Round not found' })
    return
  }

  const currentRound = parseRoundRow(row)
  if (
    typeof expectedRevision === 'number' &&
    Number.isInteger(expectedRevision) &&
    expectedRevision !== currentRound.revision
  ) {
    res.status(409).json({
      error: 'Round conflict',
      currentRound,
    })
    return
  }

  const nextRound = {
    ...currentRound,
    ...round,
    id: req.params.roundId,
    courseId: currentRound.courseId,
    createdAt: currentRound.createdAt,
    revision: currentRound.revision + 1,
    updatedAt: nowIso(),
    scoreMeta: typeof round.scoreMeta === 'object' && round.scoreMeta ? round.scoreMeta : currentRound.scoreMeta ?? {},
  }

  updateRoundStmt.run(
    String(nextRound.name || '').trim() || currentRound.name,
    nextRound.revision,
    JSON.stringify(nextRound),
    nextRound.updatedAt,
    req.params.roundId,
  )

  res.json(nextRound)
})

app.post('/api/rounds/:roundId/score-entry', async (req, res) => {
  const holeId = Number(req.body?.holeId)
  const targetId = String(req.body?.targetId || '').trim()
  const value = req.body?.value
  const clientTimestamp = typeof req.body?.clientTimestamp === 'string' && req.body.clientTimestamp
    ? req.body.clientTimestamp
    : nowIso()

  if (!Number.isFinite(holeId) || !targetId) {
    res.status(400).json({ error: 'holeId and targetId are required' })
    return
  }

  const row = getRoundById.get(req.params.roundId)
  if (!row) {
    res.status(404).json({ error: 'Round not found' })
    return
  }

  const currentRound = parseRoundRow(row)
  const holeKey = String(holeId)
  const nextScores = {
    ...(currentRound.scores ?? {}),
    [holeKey]: {
      ...((currentRound.scores ?? {})[holeKey] ?? {}),
    },
  }
  const nextMeta = {
    ...(currentRound.scoreMeta ?? {}),
    [holeKey]: {
      ...((currentRound.scoreMeta ?? {})[holeKey] ?? {}),
    },
  }

  const existingTimestamp = nextMeta[holeKey][targetId]
  if (existingTimestamp && clientTimestamp < existingTimestamp) {
    res.status(409).json({
      error: 'Score conflict',
      currentRound,
    })
    return
  }

  nextScores[holeKey][targetId] = value === null ? null : Number(value)
  nextMeta[holeKey][targetId] = clientTimestamp

  const nextRound = {
    ...currentRound,
    scores: nextScores,
    scoreMeta: nextMeta,
    revision: currentRound.revision + 1,
    updatedAt: nowIso(),
  }

  updateRoundStmt.run(
    String(nextRound.name || '').trim() || currentRound.name,
    nextRound.revision,
    JSON.stringify(nextRound),
    nextRound.updatedAt,
    req.params.roundId,
  )

  res.json(nextRound)
})

app.delete('/api/rounds/:roundId', async (req, res) => {
  deleteRoundById.run(req.params.roundId)

  res.status(204).end()
})

app.get('/api/sync', async (req, res) => {
  const since = typeof req.query.since === 'string' && req.query.since ? req.query.since : null
  const courses = since ? listChangedCoursesSince.all(since) : listCourseRows.all()
  const rounds = since ? listChangedRoundsSince.all(since) : db.prepare('SELECT id, course_id, name, revision, data, created_at, updated_at FROM rounds').all()

  res.json({
    serverTime: nowIso(),
    defaultCourseId: getDefaultCourseId(),
    courses: courses.map(parseCourseRow),
    rounds: rounds.map(parseRoundRow),
  })
})

app.use('/assets', express.static(path.join(distDir, 'assets'), {
  immutable: true,
  maxAge: '365d',
}))

app.use(express.static(distDir, {
  index: false,
  etag: true,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('/sw.js') || filePath.endsWith('/manifest.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache')
      return
    }

    if (!filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'no-store')
    }
  },
}))

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.info(`disc-golf api+web SQLite server listening on :${port}`)
})
