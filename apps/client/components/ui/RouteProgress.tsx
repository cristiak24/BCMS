import { useEffect, useState } from 'react';
import { useRouteLoading } from '../../src/lazyRoute';

/**
 * Thin indeterminate bar at the very top while a screen's code is loading.
 *
 * React Router wraps navigations in a transition, so while the next screen's
 * chunk downloads the CURRENT screen stays up — correct, but on a slow phone
 * connection a tap then looked like it did nothing. This is the "your tap
 * registered" signal. It waits 120ms before showing so instant (prefetched)
 * navigations never flash it.
 */
export default function RouteProgress() {
  const loading = useRouteLoading();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(timer);
  }, [loading]);

  return (
    <div
      className={`route-progress ${visible ? 'is-visible' : ''}`}
      role="progressbar"
      aria-hidden={!visible}
      aria-label="Se încarcă pagina"
    >
      <div className="route-progress-bar" />
    </div>
  );
}
