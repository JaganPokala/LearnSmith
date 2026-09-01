import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { mergeGeneratedLesson } from '../lib/mergeLesson.js';

/**
 * GET /api/lessons/:id — a lesson plus the context the page frames it with.
 * Returns { lesson, course, module, siblings, position, total }.
 *
 * @param {string} id  from useParams().lessonId
 */
export function useLesson(id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
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
  }, [id]);

  // POST /generate returns the lesson alone — no siblings, no position — so the
  // page merges it locally rather than paying another round trip. The merge
  // itself lives in lib/mergeLesson.js: it is where F3 was, and keeping it pure
  // is what makes it testable.
  const applyGeneratedLesson = useCallback((newLesson) => {
    setData((current) => mergeGeneratedLesson(current, newLesson));
  }, []);

  return { data, loading, error, applyGeneratedLesson };
}
