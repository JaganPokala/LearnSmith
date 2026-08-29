import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

/**
 * GET /api/lessons/:id — a lesson plus the context the page frames it with.
 *
 * Returns { lesson, course, module, siblings, position, total }.
 * This READ never generates; POST /generate is a separate call (Task 5.8).
 *
 * @param {string} id  from useParams().lessonId
 */
export function useLesson(id) {
  // Same shape as useCourse — including the [id] dependency and the cancelled
  // flag. Navigating between sibling lessons is the single most common thing a
  // user will do here, so this hook meets the stale-response race more than any
  // other.

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

  // ONE EXTRA THING THIS HOOK NEEDS: a way to replace the lesson locally.
  //
  // After Task 5.8 generates a lesson, POST returns the new lesson but NOT the
  // surrounding context — no siblings, no position. Refetching the GET would
  // work but costs another round trip right after a 12-second wait.
  //
  // So expose something like `applyGeneratedLesson(newLesson)` that:
  //   - replaces data.lesson with the new one
  //   - and flips this lesson's entry inside data.siblings to isEnriched: true
  //     so the sidebar chip updates without a reload
  //
  // Build the new object immutably (spread, map) rather than mutating `data`.
  // Mutating it in place changes nothing on screen: React compares by
  // reference, sees the same object, and does not re-render.

  const applyGeneratedLesson = useCallback((newLesson) => {
    // The updater form reads the freshest state, so this callback does not
    // depend on `data` and stays stable across renders.
    setData((current) => {
      if (!current) return current;

      return {
        ...current,
        lesson: newLesson,
        siblings: current.siblings?.map((sibling) =>
          String(sibling._id) === String(newLesson._id)
            ? { ...sibling, isEnriched: true }
            : sibling,
        ),
      };
    });
  }, []);

  // Return { data, loading, error, applyGeneratedLesson }.

  return { data, loading, error, applyGeneratedLesson };
}
