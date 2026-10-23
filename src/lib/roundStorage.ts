import type { Round, GameType } from '../types/round'
import { deleteCachedRound, getCachedRound, setCachedRound } from './syncCache'

const API_BASE = '/api'

const withDefaults = (round: Round): Round => ({
  ...round,
  name: round.name.trim() || 'New Round',
  teamsEnabled: typeof round.teamsEnabled === 'boolean' ? round.teamsEnabled : round.gameType !== 'standard',
})

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

class RoundConflictError extends Error {
  currentRound: Round

  constructor(currentRound: Round) {
    super('Round conflict')
    this.currentRound = currentRound
  }
}

const toIsoNow = (): string => new Date().toISOString()

const mergeRoundScores = (localRound: Round, serverRound: Round): Pick<Round, 'scores' | 'scoreMeta'> => {
  const serverScores = serverRound.scores ?? {}
  const serverMeta = serverRound.scoreMeta ?? {}
  const localScores = localRound.scores ?? {}
  const localMeta = localRound.scoreMeta ?? {}

  const mergedScores: Round['scores'] = {}
  const mergedMeta: NonNullable<Round['scoreMeta']> = {}
  const holeKeys = new Set([...Object.keys(serverScores), ...Object.keys(localScores)])

  for (const holeKey of holeKeys) {
    const serverHoleScores = serverScores[holeKey] ?? {}
    const localHoleScores = localScores[holeKey] ?? {}
    const serverHoleMeta = serverMeta[holeKey] ?? {}
    const localHoleMeta = localMeta[holeKey] ?? {}
    const targetKeys = new Set([...Object.keys(serverHoleScores), ...Object.keys(localHoleScores)])

    const nextHoleScores: Record<string, number | null> = {}
    const nextHoleMeta: Record<string, string> = {}

    for (const targetKey of targetKeys) {
      const serverTs = serverHoleMeta[targetKey]
      const localTs = localHoleMeta[targetKey]

      if (localTs && (!serverTs || localTs >= serverTs)) {
        nextHoleScores[targetKey] = localHoleScores[targetKey] ?? null
        nextHoleMeta[targetKey] = localTs
      } else {
        nextHoleScores[targetKey] = serverHoleScores[targetKey] ?? null
        if (serverTs) {
          nextHoleMeta[targetKey] = serverTs
        }
      }
    }

    if (Object.keys(nextHoleScores).length) {
      mergedScores[holeKey] = nextHoleScores
      mergedMeta[holeKey] = nextHoleMeta
    }
  }

  return {
    scores: mergedScores,
    scoreMeta: mergedMeta,
  }
}

const putRound = async (round: Round, expectedRevision?: number): Promise<Round> => {
  const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(round.id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      round,
      expectedRevision,
    }),
  })

  if (response.status === 409) {
    const payload = (await response.json()) as { currentRound?: Round }
    if (payload.currentRound) {
      throw new RoundConflictError(withDefaults(payload.currentRound))
    }
  }

  const nextRound = await parseJson<Round>(response)
  return withDefaults(nextRound)
}

export const createRound = async (input: {
  courseId: string
  name: string
  gameType: GameType
  teamsEnabled: boolean
}): Promise<Round> => {
  const response = await fetch(`${API_BASE}/rounds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      courseId: input.courseId,
      name: input.name,
      gameType: input.gameType,
      teamsEnabled: input.teamsEnabled,
    }),
  })

  const round = await parseJson<Round>(response)
  const normalized = withDefaults(round)
  await setCachedRound(normalized)
  return normalized
}

export const loadRound = async (roundId: string): Promise<Round | null> => {
  try {
    const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}`, {
      cache: 'no-store',
    })

    if (response.status === 404) {
      await deleteCachedRound(roundId)
      return null
    }

    const stored = await parseJson<Round>(response)
    const normalized = withDefaults(stored)
    await setCachedRound(normalized)
    return normalized
  } catch {
    const cached = await getCachedRound(roundId)
    return cached ? withDefaults(cached) : null
  }
}

export const saveRound = async (round: Round): Promise<Round> => {
  const payload = withDefaults(round)

  try {
    const saved = await putRound(payload, payload.revision)
    await setCachedRound(saved)
    return saved
  } catch (error) {
    if (!(error instanceof RoundConflictError)) {
      throw error
    }

    const mergedScores = mergeRoundScores(payload, error.currentRound)
    const mergedRound: Round = withDefaults({
      ...error.currentRound,
      ...payload,
      ...mergedScores,
      revision: error.currentRound.revision,
      updatedAt: toIsoNow(),
    })

    const saved = await putRound(mergedRound, error.currentRound.revision)
    await setCachedRound(saved)
    return saved
  }
}

export const saveRoundScore = async (
  roundId: string,
  holeId: number,
  targetId: string,
  value: number | null,
  clientTimestamp: string,
): Promise<Round> => {
  const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}/score-entry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      holeId,
      targetId,
      value,
      clientTimestamp,
    }),
  })

  if (response.status === 409) {
    const payload = (await response.json()) as { currentRound?: Round }
    if (payload.currentRound) {
      const normalized = withDefaults(payload.currentRound)
      await setCachedRound(normalized)
      return normalized
    }
  }

  const nextRound = await parseJson<Round>(response)
  const normalized = withDefaults(nextRound)
  await setCachedRound(normalized)
  return normalized
}

export const deleteRound = async (roundId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}`, {
    method: 'DELETE',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  await deleteCachedRound(roundId)
}

export const importRoundFromSync = async (incomingRound: Round): Promise<Round> => {
  const incoming = withDefaults(incomingRound)
  const existing = await getCachedRound(incoming.id)

  const merged = existing
    ? withDefaults({
      ...existing,
      ...incoming,
      ...mergeRoundScores(existing, incoming),
      revision: Math.max(existing.revision, incoming.revision),
      updatedAt: existing.updatedAt > incoming.updatedAt ? existing.updatedAt : incoming.updatedAt,
    })
    : incoming

  await setCachedRound(merged)

  try {
    const saved = await saveRound(merged)
    return saved
  } catch {
    return merged
  }
}
