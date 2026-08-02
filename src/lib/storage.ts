import { defaultCourse } from '../data/defaultCourse'
import {
  deleteCachedCourse,
  deleteCachedCourseSummary,
  getCachedCourse,
  getCachedCourseSummaries,
  getCachedDefaultCourseId,
  replaceCachedCourseSummaries,
  setCachedCourse,
  setCachedDefaultCourseId,
  upsertCachedCourseSummary,
} from './syncCache'
import type { Course } from '../types/course'

export type CourseSummary = {
  id: string
  name: string
  isDefault: boolean
}

const API_BASE = '/api'

const generateCourseId = (): string => `course-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const withDefaults = (course: Course): Course => ({
  ...defaultCourse,
  ...course,
  mapStart: course.mapStart ?? course.center ?? defaultCourse.mapStart,
  pois: course.pois ?? defaultCourse.pois,
})

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  return parseJson<T>(response)
}

const requestVoid = async (path: string, init?: RequestInit): Promise<void> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }
}

export const getDefaultCourseId = async (): Promise<string | null> => {
  try {
    const payload = await request<{ courseId: string | null }>('/default-course')
    await setCachedDefaultCourseId(payload.courseId ?? null)
    return payload.courseId ?? null
  } catch {
    return getCachedDefaultCourseId()
  }
}

export const setDefaultCourse = async (courseId: string): Promise<void> => {
  await requestVoid('/default-course', {
    method: 'PUT',
    body: JSON.stringify({ courseId }),
  })

  await setCachedDefaultCourseId(courseId)
}

export const findCourse = async (courseId: string): Promise<Course | null> => {
  try {
    const response = await fetch(`${API_BASE}/courses/${encodeURIComponent(courseId)}`, {
      cache: 'no-store',
    })

    if (response.status === 404) {
      await Promise.all([
        deleteCachedCourse(courseId),
        deleteCachedCourseSummary(courseId),
      ])
      return null
    }

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`)
    }

    const stored = (await response.json()) as Course
    const normalized = withDefaults(stored)
    await Promise.all([
      setCachedCourse(normalized),
      upsertCachedCourseSummary({ id: normalized.id, name: normalized.name }),
    ])

    if (normalized.mapStart !== stored.mapStart || normalized.pois !== stored.pois) {
      await saveCourse(normalized)
    }

    return normalized
  } catch {
    const cached = await getCachedCourse(courseId)
    return cached ? withDefaults(cached) : null
  }
}

export const loadCourse = async (courseId: string): Promise<Course> => {
  const existing = await findCourse(courseId)
  if (existing) {
    return existing
  }

  const seed = withDefaults({ ...defaultCourse, id: courseId })
  await saveCourse(seed)
  return seed
}

export const saveCourse = async (course: Course): Promise<void> => {
  const payload = withDefaults(course)
  const saved = await request<Course>(`/courses/${encodeURIComponent(payload.id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })

  const normalized = withDefaults(saved)
  await Promise.all([
    setCachedCourse(normalized),
    upsertCachedCourseSummary({ id: normalized.id, name: normalized.name }),
  ])
}

export const listCourses = async (): Promise<CourseSummary[]> => {
  try {
    const summaries = await request<CourseSummary[]>('/courses')
    await Promise.all([
      replaceCachedCourseSummaries(summaries.map(({ id, name }) => ({ id, name }))),
      setCachedDefaultCourseId(summaries.find((course) => course.isDefault)?.id ?? null),
    ])
    return summaries
  } catch {
    const [summaries, defaultCourseId] = await Promise.all([
      getCachedCourseSummaries(),
      getCachedDefaultCourseId(),
    ])

    return summaries
      .map((course) => ({
        id: course.id,
        name: course.name,
        isDefault: course.id === defaultCourseId,
      }))
      .sort((left, right) => {
        if (left.isDefault === right.isDefault) {
          return left.name.localeCompare(right.name)
        }

        return left.isDefault ? -1 : 1
      })
  }
}

export const createCourse = async (courseName: string): Promise<Course> => {
  const payload = {
    name: courseName.trim() || 'New Course',
    template: withDefaults({
      ...defaultCourse,
      id: generateCourseId(),
      name: courseName.trim() || 'New Course',
    }),
  }

  const created = await request<Course>('/courses', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const normalized = withDefaults(created)
  await Promise.all([
    setCachedCourse(normalized),
    upsertCachedCourseSummary({ id: normalized.id, name: normalized.name }),
  ])

  return normalized
}

export const deleteCourse = async (courseId: string): Promise<void> => {
  await requestVoid(`/courses/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
  })

  const defaultCourseId = await getCachedDefaultCourseId()
  await Promise.all([
    deleteCachedCourse(courseId),
    deleteCachedCourseSummary(courseId),
    defaultCourseId === courseId ? setCachedDefaultCourseId(null) : Promise.resolve(),
  ])
}

export const renameCourse = async (courseId: string, courseName: string): Promise<Course> => {
  const renamed = await request<Course>(`/courses/${encodeURIComponent(courseId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: courseName.trim() }),
  })

  const normalized = withDefaults(renamed)
  await Promise.all([
    setCachedCourse(normalized),
    upsertCachedCourseSummary({ id: normalized.id, name: normalized.name }),
  ])

  return normalized
}

export const duplicateCourse = async (courseId: string): Promise<Course> => {
  const copy = await request<Course>(`/courses/${encodeURIComponent(courseId)}/duplicate`, {
    method: 'POST',
  })

  const normalized = withDefaults(copy)
  await Promise.all([
    setCachedCourse(normalized),
    upsertCachedCourseSummary({ id: normalized.id, name: normalized.name }),
  ])

  return normalized
}

export const importCourse = async (course: Course): Promise<Course> => {
  const imported = await request<Course>('/courses/import', {
    method: 'POST',
    body: JSON.stringify({ course }),
  })

  const normalized = withDefaults(imported)
  await Promise.all([
    setCachedCourse(normalized),
    upsertCachedCourseSummary({ id: normalized.id, name: normalized.name }),
  ])

  return normalized
}

export const exportCourse = async (courseId: string): Promise<Course | null> => {
  return findCourse(courseId)
}
