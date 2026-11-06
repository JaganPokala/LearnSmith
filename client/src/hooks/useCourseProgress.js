import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export function useCourseProgress(id, enabled, identity) {
  const key = `${id}:${identity}`;
  const [state, setState] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    api.get(`/api/courses/${id}/progress`).then(
      (data) => { if (!cancelled) setState({ key, data, error: null }); },
      (error) => { if (!cancelled) setState({ key, data: null, error }); },
    );
    return () => { cancelled = true; };
  }, [id, enabled, key, version]);
  return { data: state?.key === key ? state.data : null, error: state?.key === key ? state.error : null, refresh };
}
