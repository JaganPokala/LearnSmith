import { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

/**
 * POST /api/lessons/:id/generate — an action hook.
 *
 * Both pieces of state are keyed by lesson id rather than being bare flags.
 * LessonPage stays mounted when you move between siblings, so a plain boolean
 * `pending` made the NEXT lesson render "Writing this lesson…" for a write that
 * was never its own — the second half of F3.
 */
export function useGenerateLesson() {
  // The lesson currently being written, or null. Not a boolean: the page has to
  // be able to ask "is it MINE that is generating?".
  const [pendingId, setPendingId] = useState(null);

  // { lessonId, error } — a failure belongs to the lesson it happened to, for
  // the same reason.
  const [failure, setFailure] = useState(null);

  // A useCallback([]) closes over the first render's state forever, so a guard
  // reading `pendingId` would be permanently null. A ref is one live object.
  // Twelve seconds is long enough for a user to click again, and a second POST
  // that slips past is a second billed generation.
  const inFlight = useRef(false);

  const run = useCallback(async (lessonId) => {
    if (inFlight.current) return null;

    // Raised before the first await, so a second click arriving while this call
    // is suspended finds the flag already up.
    inFlight.current = true;

    setPendingId(lessonId);
    setFailure(null);

    try {
      return await api.post(`/api/lessons/${lessonId}/generate`);
    } catch (err) {
      setFailure({ lessonId, error: err });
      return null;
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }, []);

  const reset = useCallback(() => setFailure(null), []);

  return { run, pendingId, failure, reset };
}
