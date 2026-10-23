import { openDB } from 'idb'
import type { Course } from '../types/course'
import type { Round } from '../types/round'

type CachedCourseSummary = {
  id: string
  name: string
}

type SyncCacheDb = {
  courses: {
    key: string
    value: Course
  }
  rounds: {
    key: string
    value: Round
  }
  courseSummaries: {
    key: string
    value: CachedCourseSummary
  }
  settings: {
    key: string
    value: string
  }
}

const DB_NAME = 'disc-golf-sync-cache'
const COURSES_STORE = 'courses'
const ROUNDS_STORE = 'rounds'
const COURSE_SUMMARIES_STORE = 'courseSummaries'
const SETTINGS_STORE = 'settings'
const DEFAULT_COURSE_KEY = 'default-course-id'
const activeRoundKey = (courseId: string): string => `active-round:${courseId}`

const dbPromise = openDB<SyncCacheDb>(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(COURSES_STORE)) {
      db.createObjectStore(COURSES_STORE)
    }

    if (!db.objectStoreNames.contains(ROUNDS_STORE)) {
      db.createObjectStore(ROUNDS_STORE)
    }

    if (!db.objectStoreNames.contains(COURSE_SUMMARIES_STORE)) {
      db.createObjectStore(COURSE_SUMMARIES_STORE)
    }

    if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
      db.createObjectStore(SETTINGS_STORE)
    }
  },
})

export const getCachedDefaultCourseId = async (): Promise<string | null> => {
  const db = await dbPromise
  const value = await db.get(SETTINGS_STORE, DEFAULT_COURSE_KEY)
  return value ?? null
}

export const setCachedDefaultCourseId = async (courseId: string | null): Promise<void> => {
  const db = await dbPromise

  if (!courseId) {
    await db.delete(SETTINGS_STORE, DEFAULT_COURSE_KEY)
    return
  }

  await db.put(SETTINGS_STORE, courseId, DEFAULT_COURSE_KEY)
}

export const getCachedActiveRoundId = async (courseId: string): Promise<string | null> => {
  const db = await dbPromise
  const value = await db.get(SETTINGS_STORE, activeRoundKey(courseId))
  return value ?? null
}

export const setCachedActiveRoundId = async (
  courseId: string,
  roundId: string | null,
): Promise<void> => {
  const db = await dbPromise
  const key = activeRoundKey(courseId)

  if (!roundId) {
    await db.delete(SETTINGS_STORE, key)
    return
  }

  await db.put(SETTINGS_STORE, roundId, key)
}

export const getCachedCourse = async (courseId: string): Promise<Course | null> => {
  const db = await dbPromise
  return (await db.get(COURSES_STORE, courseId)) ?? null
}

export const setCachedCourse = async (course: Course): Promise<void> => {
  const db = await dbPromise
  await db.put(COURSES_STORE, course, course.id)
}

export const deleteCachedCourse = async (courseId: string): Promise<void> => {
  const db = await dbPromise
  await db.delete(COURSES_STORE, courseId)
}

export const getCachedCourseSummaries = async (): Promise<CachedCourseSummary[]> => {
  const db = await dbPromise
  return db.getAll(COURSE_SUMMARIES_STORE)
}

export const replaceCachedCourseSummaries = async (
  summaries: CachedCourseSummary[],
): Promise<void> => {
  const db = await dbPromise
  const tx = db.transaction(COURSE_SUMMARIES_STORE, 'readwrite')
  await tx.store.clear()

  for (const summary of summaries) {
    await tx.store.put(summary, summary.id)
  }

  await tx.done
}

export const upsertCachedCourseSummary = async (summary: CachedCourseSummary): Promise<void> => {
  const db = await dbPromise
  await db.put(COURSE_SUMMARIES_STORE, summary, summary.id)
}

export const deleteCachedCourseSummary = async (courseId: string): Promise<void> => {
  const db = await dbPromise
  await db.delete(COURSE_SUMMARIES_STORE, courseId)
}

export const getCachedRound = async (roundId: string): Promise<Round | null> => {
  const db = await dbPromise
  return (await db.get(ROUNDS_STORE, roundId)) ?? null
}

export const setCachedRound = async (round: Round): Promise<void> => {
  const db = await dbPromise
  await db.put(ROUNDS_STORE, round, round.id)
}

export const deleteCachedRound = async (roundId: string): Promise<void> => {
  const db = await dbPromise
  await db.delete(ROUNDS_STORE, roundId)
}