import { useEffect } from 'react';

/**
 * While `active`, the browser asks before a reload or closing the tab drops
 * unsaved edits. In-app navigation is the screen's job (BrowserRouter has no
 * blocker): confirm on its own back button.
 */
export function useUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
