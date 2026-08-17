'use client';

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

type Guard = () => boolean;

interface UnsavedChangesContextValue {
  /** Register a guard that returns true if navigation is allowed. */
  register: (id: string, guard: Guard) => () => void;
  /** Ask all registered guards; returns true if all allow navigation. */
  allowNavigation: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const guards = useRef(new Map<string, Guard>());

  const register = useCallback((id: string, guard: Guard) => {
    guards.current.set(id, guard);
    return () => {
      guards.current.delete(id);
    };
  }, []);

  const allowNavigation = useCallback(() => {
    for (const guard of guards.current.values()) {
      if (!guard()) return false;
    }
    return true;
  }, []);

  const value = useMemo(() => ({ register, allowNavigation }), [register, allowNavigation]);

  return (
    <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesRegistry() {
  return useContext(UnsavedChangesContext);
}
