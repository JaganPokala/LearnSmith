import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

/**
 * GET /api/courses/:id — one course with its modules and lesson titles.
 *
 * Lesson CONTENT is not included (the endpoint excludes it deliberately); this
 * is enough to draw the module list and the built/empty chips.
 *
 * @param {string} id  from useParams().courseId
 */
export function useCourse(id) {
  // Same three states as useCourses.

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // THE TRAP IN THIS FILE — the effect must depend on `id`.
  //
  //   useEffect(() => { ...fetch... }, [id]);
  //
  // React reuses the same component instance when you navigate from one course
  // to another; only the URL changes. With an empty dependency array the fetch
  // runs once, ever, and the second course shows the FIRST course's content —
  // with no error anywhere. It looks like a caching bug or a backend bug.

  // A SECOND, SUBTLER PROBLEM: two requests can be in flight at once.
  // Click course A then quickly course B. If A's response arrives after B's,
  // it overwrites B and you are looking at the wrong course.
  //
  // The fix is a "stale" flag captured in the effect:
  //
  //   let cancelled = false;
  //   ...
  //   if (!cancelled) setData(result);
  //   return () => { cancelled = true; };
  //
  // React runs that cleanup before re-running the effect, so the older request
  // sets nothing when it finally lands.

  useEffect(() => {
    // Guard the empty id: if `id` is falsy, do not fetch at all.
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Clearing `data` matters as much as the id dependency: without it the new
    // course renders the OLD course's modules while its own request is still in
    // flight, which is the same wrong-content bug arriving a different way.
    setData(null);
    setError(null);
    setLoading(true);

    async function load() {
      try {
        const result = await api.get(`/api/courses/${id}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, loading, error };
}
