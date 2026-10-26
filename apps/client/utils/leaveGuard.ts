/**
 * In-app leave guard. `beforeunload` (hooks/useUnloadGuard) only covers closing
 * or reloading the tab; moving to another page inside the app went straight
 * through and dropped unsaved edits. A page with unsaved changes registers a
 * guard (hooks/useLeaveGuard); every programmatic navigation — the router
 * shim's push/replace/back and the „Mai mult” sheet — asks it first. Link
 * clicks are caught by the hook itself.
 *
 * The app runs on <BrowserRouter>, which has no `useBlocker` (that needs a data
 * router), hence this small registry.
 */
export type LeaveGuard = (proceed: () => void) => void;

let current: LeaveGuard | null = null;

export function setLeaveGuard(guard: LeaveGuard) {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

/** Runs `proceed` now, or hands it to the page's guard to run once the person decides. */
export function guardNavigation(proceed: () => void) {
  if (current) current(proceed);
  else proceed();
}
