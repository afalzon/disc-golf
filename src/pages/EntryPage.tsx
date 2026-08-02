import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { findCourse, listCourses } from '../lib/storage'

export const EntryPage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    const route = async () => {
      try {
        const courses = await listCourses()
        const defaultCourse = courses.find((course) => course.isDefault)
        const orderedCourses = defaultCourse
          ? [defaultCourse, ...courses.filter((course) => course.id !== defaultCourse.id)]
          : courses

        for (const course of orderedCourses) {
          const exists = await findCourse(course.id)
          if (exists) {
            if (!cancelled) {
              navigate(`/course/${course.id}`, { replace: true })
            }
            return
          }
        }
        } catch {
          // If the API is unavailable, send user to admin portal for recovery.
      }

      if (!cancelled) {
        navigate('/admin-portal', { replace: true })
      }
    }

    void route()

    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <main className="page">
      <p>Loading…</p>
    </main>
  )
}
