import { useCallback, useEffect } from 'react';

export function useFocusEffect(effect: () => void | (() => void)) {
  const stableEffect = useCallback(effect, [effect]);
  useEffect(() => stableEffect(), [stableEffect]);
}

