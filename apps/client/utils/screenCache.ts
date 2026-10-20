/**
 * "Show what you saw last time, then refresh": the home screens keep their
 * last loaded data per account (and per selected child, for a parent), so
 * opening Acasă — or coming back to it — paints at once instead of skeletons
 * while the requests (and a cold Render) catch up. The screens still refetch
 * on every focus; this only decides what shows in the meantime.
 *
 * In memory for the session, mirrored to localStorage so a reopened app
 * paints instantly too. Never across accounts: entries are keyed by scope,
 * and sign-out clears everything (personal data on a shared phone).
 */
type Entry = { at: number; value: unknown };
type Store = Record<string, Entry>;
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

const STORAGE_KEY = 'bcms.screen-cache.v1';
/** Older than this, a cached screen is not worth showing. */
export const SCREEN_CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Stop persisting past this size; memory still works. */
const MAX_PERSISTED_CHARS = 1_500_000;

let memory: Store | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): Store {
  if (memory) return memory;
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    memory = raw ? JSON.parse(raw) as Store : {};
  } catch {
    memory = {};
  }
  return memory!;
}

function persist(store: Store) {
  try {
    const text = JSON.stringify(store);
    if (text.length > MAX_PERSISTED_CHARS) storage()?.removeItem(STORAGE_KEY);
    else storage()?.setItem(STORAGE_KEY, text);
  } catch {
    // Quota or blocked storage: the in-memory copy still serves this session.
  }
}

export function screenCacheKey(scope: string, name: string) {
  return `${scope}::${name}`;
}

export function readScreenCache<T>(scope: string | null, name: string, now = Date.now()): T | undefined {
  if (!scope) return undefined;
  const entry = load()[screenCacheKey(scope, name)];
  if (!entry || now - entry.at > SCREEN_CACHE_MAX_AGE_MS) return undefined;
  return entry.value as T;
}

export function writeScreenCache(scope: string | null, name: string, value: unknown, now = Date.now()) {
  if (!scope) return;
  const store = load();
  store[screenCacheKey(scope, name)] = { at: now, value };
  // Drop what has aged out, so the stored copy doesn't grow forever.
  for (const [key, entry] of Object.entries(store)) {
    if (now - entry.at > SCREEN_CACHE_MAX_AGE_MS) delete store[key];
  }
  persist(store);
}

/** Sign-out / dead session: nothing of the previous account stays on the device. */
export function clearScreenCache() {
  memory = {};
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Test hook: forget the in-memory copy (as on a fresh page load). */
export function resetScreenCacheMemory() {
  memory = null;
}
