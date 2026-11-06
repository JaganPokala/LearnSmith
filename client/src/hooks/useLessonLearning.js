import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { api } from '../lib/api.js';
import { createLearningStore } from '../lib/learningStore.js';

export function useLessonLearning(lessonId, enabled, written, identity) {
  const store = useMemo(() => createLearningStore({ api, lessonId, identity }), [lessonId, identity]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    if (!enabled) return undefined;
    store.start();
    return () => store.stop();
  }, [store, enabled]);
  useEffect(() => {
    if (enabled) void store.refresh();
  }, [store, enabled, written]);
  return { ...snapshot, refresh: store.refresh, complete: store.complete, submit: store.submit, loadMore: store.loadMore };
}
