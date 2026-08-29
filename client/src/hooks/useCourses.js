import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

/**
 * GET /api/courses — the library list.
 *
 * Returns { count, totals: { courses, lessons, written }, courses: [...] },
 * where each course carries lessonCount and writtenCount.
 *
 * Exposes `refetch` because the library changes from inside the page: creating
 * a course and deleting one both need the list to update afterwards.
 */
export function useCourses() {
  // 1. Three pieces of state: data (null at first), loading (true at first),
  //    error (null at first).
  //
  //    Start loading at TRUE, not false. If it starts false the page renders
  //    its empty state for one frame before the request finishes — a visible
  //    flash of "no courses yet" every single time you open the library.

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 2. A `load` function wrapped in useCallback, so the effect below can depend
  //    on it without re-running every render.
  //    It should: set loading true, clear the old error, await api.get, store
  //    the result, catch and store the error, and set loading false in both
  //    cases. A `finally` is the honest way to do that last part.
  //
  //    No dependencies: this hook takes no arguments, so `load` is created once
  //    and the effect below runs once.

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await api.get('/api/courses'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 3. useEffect(() => { load(); }, [load]) — run on mount.

  useEffect(() => {
    load();
  }, [load]);

  // 4. Return { data, loading, error, refetch: load }.

  return { data, loading, error, refetch: load };
}
