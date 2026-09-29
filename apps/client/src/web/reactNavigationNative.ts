import { useEffect, useRef } from 'react';

/** Only refresh on return if the page was hidden at least this long. */
const REFOCUS_AFTER_MS = 30_000;

/**
 * Web stand-in for React Navigation's useFocusEffect.
 *
 * "Focus" on the web = the screen mounting (RN semantics: a screen is focused
 * when it appears) PLUS the tab/PWA becoming visible again after a while —
 * e.g. a player reopening the app from the home screen hours later gets fresh
 * data instead of what was loaded yesterday.
 *
 * Callers must NOT also run the same load in a plain useEffect: this already
 * runs on mount, and doing both fired every request twice.
 */
export function useFocusEffect(effect: () => void | (() => void)) {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  // Mount + whenever the (memoised) effect changes, like RN.
  useEffect(() => effect(), [effect]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= REFOCUS_AFTER_MS) {
        effectRef.current();
      }
      hiddenAt = 0;
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
