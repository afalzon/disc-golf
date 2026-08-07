import 'dotenv/config'
import express from 'express'
import Database from 'better-sqlite3'
import nodemailer from 'nodemailer'
import { createHash, randomBytes } from 'node:crypto'
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
const globalAdminEmail = String(process.env.GLOBAL_ADMIN_EMAIL || '').trim().toLowerCase()
const authSessionTtlHours = Number(process.env.AUTH_SESSION_TTL_HOURS || 12)
const magicLinkTtlMinutes = Number(process.env.AUTH_MAGIC_LINK_TTL_MINUTES || 15)

const normalizePublicOrigin = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    return parsed.origin
  } catch {
    return null
  }
}

const readEnvString = (key) => {
  const value = process.env[key]
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const readEnvBool = (key) => {
  const value = readEnvString(key)
  if (!value) {
    return null
  }

  const normalized = value.toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return null
}

const readEnvPort = (key) => {
  const value = readEnvString(key)
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null
  }

  return parsed
}

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

  CREATE TABLE IF NOT EXISTS auth_magic_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_courses_updated_at ON courses(updated_at);
  CREATE INDEX IF NOT EXISTS idx_rounds_updated_at ON rounds(updated_at);
  CREATE INDEX IF NOT EXISTS idx_rounds_course_id ON rounds(course_id);
  CREATE INDEX IF NOT EXISTS idx_auth_magic_tokens_email ON auth_magic_tokens(email);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_email ON auth_sessions(email);
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
const deleteSetting = db.prepare('DELETE FROM settings WHERE key = ?')

const SMTP_CONFIG_KEY = 'smtp-config'

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const randomToken = () => randomBytes(32).toString('base64url')

const parseStoredSmtpConfig = () => {
  const row = getSetting.get(SMTP_CONFIG_KEY)
  if (!row) {
    return null
  }

  try {
    const parsed = JSON.parse(row.value)
    return {
      host: typeof parsed.host === 'string' ? parsed.host.trim() : '',
      port: Number.isInteger(parsed.port) ? parsed.port : 587,
      secure: Boolean(parsed.secure),
      username: typeof parsed.username === 'string' ? parsed.username.trim() : '',
      password: typeof parsed.password === 'string' ? parsed.password : '',
      from: typeof parsed.from === 'string' ? parsed.from.trim() : '',
      replyTo: typeof parsed.replyTo === 'string' ? parsed.replyTo.trim() : '',
    }
  } catch {
    return null
  }
}

const envSmtpConfig = {
  host: readEnvString('SMTP_HOST'),
  port: readEnvPort('SMTP_PORT'),
  secure: readEnvBool('SMTP_SECURE'),
  username: readEnvString('SMTP_USERNAME'),
  password: readEnvString('SMTP_PASSWORD'),
  from: readEnvString('SMTP_FROM'),
  replyTo: readEnvString('SMTP_REPLY_TO'),
}

const smtpEnvOverrides = {
  host: envSmtpConfig.host !== null,
  port: envSmtpConfig.port !== null,
  secure: envSmtpConfig.secure !== null,
  username: envSmtpConfig.username !== null,
  password: envSmtpConfig.password !== null,
  from: envSmtpConfig.from !== null,
  replyTo: envSmtpConfig.replyTo !== null,
}

const buildEffectiveSmtpConfig = () => {
  const stored = parseStoredSmtpConfig() || {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from: '',
    replyTo: '',
  }

  const effective = {
    host: smtpEnvOverrides.host ? envSmtpConfig.host : stored.host,
    port: smtpEnvOverrides.port ? envSmtpConfig.port : stored.port,
    secure: smtpEnvOverrides.secure ? envSmtpConfig.secure : stored.secure,
    username: smtpEnvOverrides.username ? envSmtpConfig.username : stored.username,
    password: smtpEnvOverrides.password ? envSmtpConfig.password : stored.password,
    from: smtpEnvOverrides.from ? envSmtpConfig.from : stored.from,
    replyTo: smtpEnvOverrides.replyTo ? envSmtpConfig.replyTo : stored.replyTo,
  }

  return {
    stored,
    effective: {
      host: String(effective.host || '').trim(),
      port: Number(effective.port || 0),
      secure: Boolean(effective.secure),
      username: String(effective.username || '').trim(),
      password: String(effective.password || ''),
      from: String(effective.from || '').trim(),
      replyTo: String(effective.replyTo || '').trim(),
    },
  }
}

const isSmtpReady = (config) => {
  if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    return false
  }

  if (!config.from) {
    return false
  }

  const hasUsername = Boolean(config.username)
  const hasPassword = Boolean(config.password)

  if (hasUsername !== hasPassword) {
    return false
  }

  return true
}

const createSmtpTransport = () => {
  const { effective } = buildEffectiveSmtpConfig()
  if (!isSmtpReady(effective)) {
    return null
  }

  return nodemailer.createTransport({
    host: effective.host,
    port: effective.port,
    secure: effective.secure,
    auth: effective.username
      ? {
        user: effective.username,
        pass: effective.password,
      }
      : undefined,
  })
}

const resolvePublicOrigin = (req) => {
  const configured = normalizePublicOrigin(process.env.PUBLIC_BASE_URL)
  if (configured) {
    return configured
  }

  return `${req.protocol}://${req.get('host')}`
}

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

const insertMagicToken = db.prepare(`
  INSERT INTO auth_magic_tokens (token_hash, email, expires_at, created_at)
  VALUES (?, ?, ?, ?)
`)

const getMagicTokenByHash = db.prepare(`
  SELECT id, token_hash, email, expires_at, used_at
  FROM auth_magic_tokens
  WHERE token_hash = ?
`)

const useMagicTokenById = db.prepare(`
  UPDATE auth_magic_tokens
  SET used_at = ?
  WHERE id = ?
`)

const insertSession = db.prepare(`
  INSERT INTO auth_sessions (token_hash, email, role, expires_at, created_at)
  VALUES (?, ?, ?, ?, ?)
`)

const getSessionByHash = db.prepare(`
  SELECT id, token_hash, email, role, expires_at, revoked_at
  FROM auth_sessions
  WHERE token_hash = ?
`)

const revokeSessionByHash = db.prepare(`
  UPDATE auth_sessions
  SET revoked_at = ?
  WHERE token_hash = ?
`)

const parseBearerToken = (req) => {
  const raw = req.headers.authorization
  if (typeof raw !== 'string') {
    return null
  }

  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

const readActiveSession = (token) => {
  if (!token) {
    return null
  }

  const hashed = hashToken(token)
  const session = getSessionByHash.get(hashed)
  if (!session) {
    return null
  }

  if (session.revoked_at) {
    return null
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return null
  }

  return session
}

const requireAdminSession = (req, res, next) => {
  const token = parseBearerToken(req)
  const session = readActiveSession(token)

  if (!session || session.role !== 'global-admin') {
    res.status(401).json({ error: 'Admin authentication required' })
    return
  }

  req.adminSession = session
  next()
}

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/public-origin', (_req, res) => {
  res.json({ publicOrigin: normalizePublicOrigin(process.env.PUBLIC_BASE_URL) })
})

app.get('/api/admin/smtp-config', requireAdminSession, async (_req, res) => {
  const { stored, effective } = buildEffectiveSmtpConfig()

  res.json({
    config: {
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      username: stored.username,
      from: stored.from,
      replyTo: stored.replyTo,
      hasPassword: Boolean(stored.password),
    },
    effective: {
      host: effective.host,
      port: effective.port,
      secure: effective.secure,
      username: effective.username,
      from: effective.from,
      replyTo: effective.replyTo,
      hasPassword: Boolean(effective.password),
    },
    envOverrides: smtpEnvOverrides,
    ready: isSmtpReady(effective),
  })
})

app.put('/api/admin/smtp-config', requireAdminSession, async (req, res) => {
  const input = req.body || {}
  const current = parseStoredSmtpConfig() || {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from: '',
    replyTo: '',
  }

  const next = {
    host: String(input.host || '').trim(),
    port: Number(input.port || 0),
    secure: Boolean(input.secure),
    username: String(input.username || '').trim(),
    password: typeof input.password === 'string' && input.password.length ? input.password : current.password,
    from: String(input.from || '').trim(),
    replyTo: String(input.replyTo || '').trim(),
  }

  if (!next.host || !Number.isInteger(next.port) || next.port < 1 || next.port > 65535 || !next.from) {
    res.status(400).json({ error: 'SMTP host, port, and from email are required' })
    return
  }

  if ((next.username && !next.password) || (!next.username && next.password)) {
    res.status(400).json({ error: 'SMTP username and password must be provided together' })
    return
  }

  setSetting.run(SMTP_CONFIG_KEY, JSON.stringify(next), nowIso())

  const { stored, effective } = buildEffectiveSmtpConfig()
  res.json({
    config: {
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      username: stored.username,
      from: stored.from,
      replyTo: stored.replyTo,
      hasPassword: Boolean(stored.password),
    },
    effective: {
      host: effective.host,
      port: effective.port,
      secure: effective.secure,
      username: effective.username,
      from: effective.from,
      replyTo: effective.replyTo,
      hasPassword: Boolean(effective.password),
    },
    envOverrides: smtpEnvOverrides,
    ready: isSmtpReady(effective),
  })
})

app.post('/api/admin/smtp-test', requireAdminSession, async (req, res) => {
  const to = normalizeEmail(req.body?.to)
  if (!to) {
    res.status(400).json({ error: 'Recipient email is required' })
    return
  }

  const transport = createSmtpTransport()
  if (!transport) {
    res.status(400).json({ error: 'SMTP is not fully configured' })
    return
  }

  const { effective } = buildEffectiveSmtpConfig()

  try {
    await transport.sendMail({
      from: effective.from,
      to,
      replyTo: effective.replyTo || undefined,
      subject: 'Disc Golf SMTP test',
      text: 'SMTP is configured correctly for disc-golf admin authentication.',
    })

    res.status(204).end()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP send failed'
    res.status(502).json({ error: `SMTP send failed: ${message}` })
  }
})

app.post('/api/auth/request-admin-link', async (req, res) => {
  const requestedEmail = normalizeEmail(req.body?.email)

  if (!globalAdminEmail) {
    res.status(503).json({ error: 'GLOBAL_ADMIN_EMAIL is not configured on the server' })
    return
  }

  if (!requestedEmail) {
    res.status(400).json({ error: 'Email is required' })
    return
  }

  if (requestedEmail !== globalAdminEmail) {
    res.status(204).end()
    return
  }

  const transport = createSmtpTransport()
  if (!transport) {
    res.status(400).json({ error: 'SMTP is not fully configured' })
    return
  }

  const magicToken = randomToken()
  const expiresAt = new Date(Date.now() + magicLinkTtlMinutes * 60 * 1000).toISOString()
  insertMagicToken.run(hashToken(magicToken), globalAdminEmail, expiresAt, nowIso())

  const { effective } = buildEffectiveSmtpConfig()
  const loginUrl = `${resolvePublicOrigin(req)}/admin-login?token=${encodeURIComponent(magicToken)}`

  try {
    await transport.sendMail({
      from: effective.from,
      to: globalAdminEmail,
      replyTo: effective.replyTo || undefined,
      subject: 'Your Disc Golf admin magic link',
      text: `Use this one-time admin login link:\n\n${loginUrl}\n\nThis link expires in ${magicLinkTtlMinutes} minutes.`,
    })

    res.status(204).end()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP send failed'
    res.status(502).json({ error: `SMTP send failed: ${message}` })
  }
})

app.post('/api/auth/consume-admin-link', async (req, res) => {
  const token = String(req.body?.token || '').trim()
  if (!token) {
    res.status(400).json({ error: 'token is required' })
    return
  }

  const tokenHash = hashToken(token)
  const magic = getMagicTokenByHash.get(tokenHash)

  if (!magic || magic.used_at || new Date(magic.expires_at).getTime() <= Date.now()) {
    res.status(401).json({ error: 'Magic link is invalid or expired' })
    return
  }

  const sessionToken = randomToken()
  const expiresAt = new Date(Date.now() + authSessionTtlHours * 60 * 60 * 1000).toISOString()

  const tx = db.transaction(() => {
    useMagicTokenById.run(nowIso(), magic.id)
    insertSession.run(hashToken(sessionToken), magic.email, 'global-admin', expiresAt, nowIso())
  })

  tx()

  res.json({
    authenticated: true,
    role: 'global-admin',
    email: magic.email,
    expiresAt,
    token: sessionToken,
  })
})

app.get('/api/auth/session', async (req, res) => {
  const token = parseBearerToken(req)
  const session = readActiveSession(token)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  res.json({
    authenticated: true,
    role: session.role,
    email: session.email,
    expiresAt: session.expires_at,
  })
})

app.delete('/api/auth/session', async (req, res) => {
  const token = parseBearerToken(req)
  const session = readActiveSession(token)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  revokeSessionByHash.run(nowIso(), hashToken(token))
  res.status(204).end()
})

app.get('/api/default-course', async (_req, res) => {
  res.json({ courseId: getDefaultCourseId() })
})

app.put('/api/default-course', requireAdminSession, async (req, res) => {
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

app.post('/api/courses', requireAdminSession, async (req, res) => {
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

app.put('/api/courses/:courseId', requireAdminSession, async (req, res) => {
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

app.patch('/api/courses/:courseId', requireAdminSession, async (req, res) => {
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

app.post('/api/courses/:courseId/duplicate', requireAdminSession, async (req, res) => {
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

app.post('/api/courses/import', requireAdminSession, async (req, res) => {
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

app.delete('/api/courses/:courseId', requireAdminSession, async (req, res) => {
  const tx = db.transaction((courseId) => {
    deleteCourseById.run(courseId)
    deleteRoundsByCourseId.run(courseId)
    if (getDefaultCourseId() === courseId) {
      setSetting.run('default-course-id', '', nowIso())
      deleteSetting.run('default-course-id')
    }
  })

  tx(req.params.courseId)

  res.status(204).end()
})

app.post('/api/rounds', async (req, res) => {
  const courseId = String(req.body?.courseId || '').trim()
  const name = String(req.body?.name || '').trim() || 'New Round'
  const gameType = String(req.body?.gameType || '').trim()
  const teamsEnabledInput = req.body?.teamsEnabled
  const teamsEnabled =
    typeof teamsEnabledInput === 'boolean' ? teamsEnabledInput : gameType !== 'standard'

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
    teamsEnabled,
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
