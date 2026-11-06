import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../lib/auth.js';
import { createUsageStore } from '../lib/usageStore.js';
import { subscribeToGeneration } from '../lib/generationEvents.js';
import { UsageContext } from '../lib/usageContext.js';

function AccountUsageProvider({ ready, children }) {
  const [store] = useState(() => createUsageStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    if (!ready) return undefined;
    store.refresh();
    const unsubscribe = subscribeToGeneration(store.refresh);
    const onFocus = () => store.refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') store.refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, store]);

  const resetAt = snapshot.data?.resetAt;
  useEffect(() => {
    if (!ready || !resetAt) return undefined;
    const delay = new Date(resetAt).getTime() - Date.now();
    if (!Number.isFinite(delay)) return undefined;
    // Re-read server state after its UTC reset; never reset counters locally.
    const timer = setTimeout(store.refresh, Math.max(1000, delay + 1000));
    return () => clearTimeout(timer);
  }, [ready, resetAt, store]);

  return (
    <UsageContext.Provider value={{ ...snapshot, ready, refresh: store.refresh }}>
      {children}
    </UsageContext.Provider>
  );
}

export default function UsageProvider({ children }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const identity = isLoading ? 'loading' : isAuthenticated ? `user:${user?.sub}` : 'guest';
  return (
    <AccountUsageProvider key={identity} ready={!isLoading}>
      {children}
    </AccountUsageProvider>
  );
}

