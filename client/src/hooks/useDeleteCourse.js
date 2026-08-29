import { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

/**
 * DELETE /api/courses/:id — an ACTION hook.
 *
 * Third of its kind, same shape as useGenerateCourse and useGenerateLesson:
 * { run, pending, error, reset }. The one difference is what a failure means.
 * A failed generation costs six seconds; a delete that half-succeeded would
 * leave orphaned modules and lessons behind, which is why the server does the
 * cascade in one place and returns the counts (D34).
 *
 * The response is `{ deleted: { lessons, modules, course } }`, and `run`
 * returns it — those counts are the only evidence the cascade actually ran.
 */
export function useDeleteCourse() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  // Same reason as the other two action hooks: useCallback([]) closes over the
  // first render's `pending` forever, so the guard has to read a ref.
  const inFlight = useRef(false);

  const run = useCallback(async (courseId) => {
    if (inFlight.current) return null;

    inFlight.current = true;
    setPending(true);
    setError(null);

    try {
      return await api.delete(`/api/courses/${courseId}`);
    } catch (err) {
      setError(err);
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
