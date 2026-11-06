// Signal that usage may have changed. Never increment counters in the browser:
// cache hits, failed claims, and paid failures have different quota behavior.
const listeners = new Set();

export function subscribeToGeneration(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function generationSettled() {
  for (const listener of listeners) {
    // An advisory display must never turn a successful generation into an
    // error, which could prompt the user to repeat paid work.
    try { listener(); } catch { /* Other listeners must still receive the signal. */ }
  }
}
