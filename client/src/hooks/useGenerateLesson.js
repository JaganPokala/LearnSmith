import { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

/**
 * POST /api/lessons/:id/generate — an ACTION hook.
 *
 * Deliberately the same shape as useGenerateCourse: { run, pending, error }.
 * Two hooks that do the same kind of thing should read the same way, so that
 * the differences between them are the interesting part.
 *
 * The one real difference is what `pending` means to the user. For a course it
 * is ~6 seconds; here it is ~12, and it is the longest wait in the app. The
 * flag is what LessonPage renders its `generating` state from, so it has to be
 * true for the WHOLE call — set before the first await, cleared in `finally`.
 */
export function useGenerateLesson() {
  // 1. Two pieces of state: pending (false at first) and error (null).
  //    No `data` — the caller hands the returned lesson straight to
  //    applyGeneratedLesson, it is never rendered from here.

  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  // 2. An in-flight ref, for the same reason as useGenerateCourse: a
  //    useCallback([]) closes over the FIRST render's `pending` and keeps that
  //    value forever, so reading state inside the guard is permanently false
  //    and the guard never fires. A ref is one object whose .current is live.
  //
  //    This matters more here than on the course form. Twelve seconds is long
  //    enough for a user to decide nothing happened and click again — and a
  //    second POST that slips past means a second billed generation.

  const inFlight = useRef(false);

  // 3. `run(lessonId)` wrapped in useCallback([]):
  //      - if the ref is already true, return null immediately
  //      - raise the ref SYNCHRONOUSLY, before any await
  //      - set pending true, clear any previous error
  //      - const lesson = await api.post(`/api/lessons/${lessonId}/generate`)
  //        (no body — the id is in the URL)
  //      - return the lesson so the caller can merge it
  //      - on failure: store the error and RETURN NULL rather than rethrowing,
  //        so the caller reads `if (!lesson) return;` instead of writing its
  //        own try/catch
  //      - finally: lower the ref, pending false

  const run = useCallback(async (lessonId) => {
    if (inFlight.current) return null;

    // Raised before the first await, so a second click arriving while this call
    // is suspended finds the flag already up.
    inFlight.current = true;

    setPending(true);
    setError(null);

    try {
      return await api.post(`/api/lessons/${lessonId}/generate`);
    } catch (err) {
      setError(err);
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  // 4. A `reset()` that clears the error, so the retry button can clear the
  //    previous failure before trying again.

  const reset = useCallback(() => setError(null), []);

  // 5. Return { run, pending, error, reset }.

  return { run, pending, error, reset };
}
