import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates a number from its previous value to `target` (ease-out cubic).
 *
 * Used for KPI figures on the coach/player home so a value that lands after a
 * fetch counts up instead of popping in. Non-finite targets are returned as-is,
 * and reduced-motion users get the final value immediately.
 */
export function useCountUp(target: number | null | undefined, duration = 900) {
  const [value, setValue] = useState<number | null | undefined>(() => (
    target == null || !Number.isFinite(target) || prefersReducedMotion() ? target : 0
  ));
  // Last value actually rendered, so a target change mid-animation continues
  // from where the number visibly is rather than jumping.
  const shownRef = useRef(0);

  useEffect(() => {
    if (target == null || !Number.isFinite(target) || prefersReducedMotion()) {
      setValue(target);
      if (target != null && Number.isFinite(target)) shownRef.current = target;
      return;
    }

    const from = shownRef.current;
    if (from === target) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);
      shownRef.current = next;
      setValue(next);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
