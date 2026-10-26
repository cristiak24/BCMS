import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setLeaveGuard } from '../utils/leaveGuard';
import { useUnloadGuard } from './useUnloadGuard';

/**
 * While `active` (unsaved changes), any way out of the page asks first:
 * closing or reloading the tab (beforeunload), the router's push/replace/back,
 * the „Mai mult” sheet and in-app link clicks (sidebar, bottom bar). The page
 * renders a dialog while `pending` and calls `leave()` or `stay()`.
 */
export function useLeaveGuard(active: boolean) {
  useUnloadGuard(active);
  const navigate = useNavigate();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!active) {
      setPending(null);
      return undefined;
    }
    const unregister = setLeaveGuard((proceed) => {
      if (bypass.current) proceed();
      else setPending(() => proceed);
    });

    // Sidebar and bottom-bar items are links: react-router handles their click
    // itself, so the capture phase stops it before it does.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = `${url.pathname}${url.search}${url.hash}`;
      if (to === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(() => () => navigate(to));
    };
    document.addEventListener('click', onClick, true);
    return () => {
      unregister();
      document.removeEventListener('click', onClick, true);
    };
  }, [active, navigate]);

  /** Go where the person was heading (after saving or discarding). */
  const leave = useCallback(() => {
    const proceed = pending;
    setPending(null);
    if (!proceed) return;
    bypass.current = true;
    try {
      proceed();
    } finally {
      bypass.current = false;
    }
  }, [pending]);

  const stay = useCallback(() => setPending(null), []);

  return { pending: pending != null, leave, stay };
}
