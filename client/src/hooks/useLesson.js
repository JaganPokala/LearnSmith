import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { mergeGeneratedLesson } from '../lib/mergeLesson.js';

/**
 * GET /api/lessons/:id — a lesson plus the context the page frames it with.
 * Returns { lesson, course, module, siblings, position, total }.
 *
 * @param {boolean} [ready]  false while auth is still resolving
 * @param {string} id  from useParams().lessonId
 */
export function useLesson(id, ready = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Wait until we know whether there is a token. These routes are readable by
    // a guest, so this is NOT "is the user signed in" — it is "has auth
    // settled". On a hard reload Auth0 needs a moment, and a request that
    // leaves first carries no Authorization header: the server sees a guest and
    // a signed-in user's own course comes back 404. Same URL, fine when you
    // navigate to it, broken when you refresh it.
    //
    // `loading` stays true here on purpose — the fetch is coming.
    if (!ready) return;

    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Cleared so a sibling's content is never on screen under the new lesson's
    // title while its request is still in flight.
    setData(null);
    setError(null);
    setLoading(true);

    async function load() {
      try {
        const result = await api.get(`/api/lessons/${id}`);
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
  }, [id, ready]);

  // POST /generate returns the lesson alone — no siblings, no position — so the
  // page merges it locally rather than paying another round trip. The merge
  // itself lives in lib/mergeLesson.js: it is where F3 was, and keeping it pure
  // is what makes it testable.
  const applyGeneratedLesson = useCallback((newLesson) => {
    setData((current) => mergeGeneratedLesson(current, newLesson));
  }, []);

  return { data, loading, error, applyGeneratedLesson };
}
