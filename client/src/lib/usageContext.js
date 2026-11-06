import { createContext, useContext } from 'react';

export const UsageContext = createContext(null);

export function useUsage() {
  const usage = useContext(UsageContext);
  if (!usage) throw new Error('UsageProvider is required.');
  return usage;
}
