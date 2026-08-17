'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks dirty form state and guards navigation:
 * - beforeunload (refresh / close tab)
 * - explicit confirmNavigation() for in-app tab switches / Link clicks
 *
 * "Saved" means markClean() after a successful server response.
 */
export function useUnsavedChanges(message: string) {
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = message;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [message]);

  /**
   * Returns true if navigation may proceed (clean, or user confirmed leave).
   * Returns false if user chose to stay.
   */
  const confirmNavigation = useCallback((): boolean => {
    if (!dirtyRef.current) return true;
    return window.confirm(message);
  }, [message]);

  return { dirty, markDirty, markClean, confirmNavigation, isDirty: () => dirtyRef.current };
}

/** Stable JSON compare for form snapshots. */
export function formSnapshot(value: unknown): string {
  return JSON.stringify(value);
}
