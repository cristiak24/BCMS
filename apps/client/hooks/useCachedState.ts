import { useCallback, useRef, useState } from 'react';
import { useSession } from '../context/AuthContext';
import { getActiveChildId } from '../services/apiClient';
import { readScreenCache, writeScreenCache } from '../utils/screenCache';

/**
 * useState for a screen's loaded data, remembered per account and selected
 * child (utils/screenCache.ts): it starts from what the screen showed last
 * time and every set is remembered for next time. `fromCache` stays true
 * until the first fresh value arrives, so a screen can skip its skeleton.
 * `fallback` is for a failed request: it fills the screen only when nothing
 * is shown yet and is not remembered — an outage must not replace last
 * time's figures with an empty list. Values must be JSON-safe (no Set/Map/Date).
 */
export function useCachedState<T>(name: string, initial: T) {
  const { session } = useSession();
  const scope = session?.uid ? `${session.uid}:${getActiveChildId() ?? '-'}` : null;

  const initialRef = useRef(initial);
  const [state, setState] = useState(() => {
    const hit = readScreenCache<T>(scope, name);
    return { scope, value: hit === undefined ? initial : hit, fromCache: hit !== undefined };
  });

  // Another account or child: start from that scope's copy, never the old one.
  let current = state;
  if (state.scope !== scope) {
    const hit = readScreenCache<T>(scope, name);
    current = { scope, value: hit === undefined ? initial : hit, fromCache: hit !== undefined };
    setState(current);
  }

  const shown = useRef(current);
  shown.current = current;

  const set = useCallback((value: T) => {
    writeScreenCache(scope, name, value);
    setState({ scope, value, fromCache: false });
  }, [scope, name]);

  const fallback = useCallback((value: T) => {
    if (shown.current.value !== initialRef.current) return;
    setState({ scope, value, fromCache: false });
  }, [scope]);

  return [current.value, set, current.fromCache, fallback] as const;
}
