import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { ThemeSession } from './ThemeSession';

const Context = createContext<ThemeSession | null>(null);

export function ThemeProvider({ session, children }: { session: ThemeSession; children: ReactNode }) {
  return <Context.Provider value={session}>{children}</Context.Provider>;
}

export function useTheme() {
  const session = useContext(Context);
  if (!session) throw new Error('ThemeProvider is required');
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { session, state };
}
