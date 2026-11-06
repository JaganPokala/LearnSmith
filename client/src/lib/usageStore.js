import { api } from './api.js';

// Each account gets a fresh store. An old account's late response can only
// update its discarded store, never the currently displayed account's counts.
export function createUsageStore({ load = () => api.get('/api/usage') } = {}) {
  let snapshot = { data: null, error: null, pending: false };
  let inFlight = null;
  let refreshAgain = false;
  const listeners = new Set();

  function publish(next) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function refresh() {
    if (inFlight) {
      // A generation may finish while an older usage read is still running.
      // Follow it with a new read instead of publishing that stale response.
      refreshAgain = true;
      return inFlight;
    }

    inFlight = Promise.resolve().then(async () => {
      try {
        do {
          refreshAgain = false;
          try {
            const data = await load();
            if (!refreshAgain) publish({ data, error: null, pending: false });
          } catch (error) {
            if (!refreshAgain) publish({ ...snapshot, error, pending: false });
          }
        } while (refreshAgain);
      } finally {
        inFlight = null;
      }
    });

    publish({ ...snapshot, pending: true });
    return inFlight;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
  };
}
