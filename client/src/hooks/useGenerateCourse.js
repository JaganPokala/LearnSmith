import { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

/**
 * POST /api/courses/generate — an ACTION hook.
 *
 * Different shape from the read hooks on purpose:
 *   read   → { data, loading, error }   runs on mount
 *   action → { run, pending, error }    runs when you call it
 *
 * Lives in a hook rather than inside PromptForm so the library page and the
 * landing hero share one implementation — including the pending flag that
 * stops a double submit.
 */
export function useGenerateCourse() {
  // 1. Two pieces of state: pending (false at first) and error (null).
  //    No `data` — the caller uses the returned course immediately to navigate,
  //    it never needs to be rendered from here.

  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  // The guard below reads THIS, not `pending`. useCallback([]) closes over the
  // first render's `pending` and keeps it forever, so a state read there is
  // permanently false and the guard never fires. A ref is a single object whose
  // .current is always the live value.
  const inFlight = useRef(false);

  // 2. `run(topic)` wrapped in useCallback([]):
  //      - set pending true, clear any previous error
  //      - const course = await api.post('/api/courses/generate', { prompt: topic })
  //      - return the course so the caller can navigate to course._id
  //      - on failure: store the error and RETURN NULL rather than rethrowing.
  //        The caller then reads `if (!course) return;` instead of needing its
  //        own try/catch. One place decides what a failure looks like.
  //      - finally: pending false
  //
  //    GUARD AGAINST RE-ENTRY at the top: if pending is already true, return
  //    null immediately. The disabled button is the visible defence; this is the
  //    one that still holds if a keyboard Enter or a fast double-click slips
  //    past the render.

  const run = useCallback(async (topic) => {
    if (inFlight.current) return null;

    // Set synchronously, before the first await. Anything that arrives while
    // this function is suspended finds the flag already up.
    inFlight.current = true;

    setPending(true);
    setError(null);

    try {
      return await api.post('/api/courses/generate', { prompt: topic });
    } catch (err) {
      setError(err);
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  // 3. A `reset()` that clears the error, for when the user starts typing again.

  const reset = useCallback(() => setError(null), []);

  // 4. Return { run, pending, error, reset }.

  return { run, pending, error, reset };
}
