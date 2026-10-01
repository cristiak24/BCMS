import { useEffect, useState } from 'react';
import { familyApi, type FamilyChild, type FamilyPendingRequest } from '../../services/familyApi';
import { getActiveChildId } from '../../services/apiClient';

/**
 * A parent's linked children and the one being viewed. One request per page
 * load, shared by everything that asks (the switcher bar, the home hero…) —
 * switching child reloads the page, which also resets this cache.
 */

type FamilyState = { children: FamilyChild[]; pending: FamilyPendingRequest[] };

let cached: Promise<FamilyState> | null = null;

export function loadFamily(force = false) {
  if (!cached || force) cached = familyApi.children().catch(() => ({ children: [], pending: [] }));
  return cached;
}

export function useActiveChild(enabled: boolean) {
  const [state, setState] = useState<FamilyState | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void loadFamily().then((data) => { if (!cancelled) setState(data); });
    return () => { cancelled = true; };
  }, [enabled]);

  const activeId = getActiveChildId();
  const active = state ? state.children.find((child) => child.id === activeId) ?? state.children[0] ?? null : null;
  return { family: state, active };
}
