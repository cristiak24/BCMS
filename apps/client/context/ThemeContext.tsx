import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'bcms.theme';

type ThemeContextValue = {
  /** The user's stored preference ('system' follows the OS). */
  mode: ThemeMode;
  /** The theme actually applied right now ('light' | 'dark'). */
  theme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Flip between light and dark (resolves 'system' to its opposite first). */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system';
  } catch {
    // Storage can throw (Safari private mode, blocked site data).
    return 'system';
  }
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light';
  return mode;
}

/** Browser chrome colour (mobile address bar / PWA title bar) per theme — the page background. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#F4F5F8', dark: '#0A0B11' };

/**
 * Apply the resolved theme to <html> so all `[data-theme]` tokens switch.
 *
 * Transitions are suspended for the swap: components that transition their
 * colours (inputs, toggles, cards) otherwise fade from the old palette over
 * ~200ms, so for a moment dark cards carried light borders — most visibly in
 * the Appearance picker itself, right where the user just clicked.
 */
function applyTheme(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === theme) return;

  root.classList.add('theme-switching');
  root.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  // Two frames: the first commits the new colours with transitions off, the
  // second restores them.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(readStoredMode()));

  // Apply + persist whenever the mode changes.
  useEffect(() => {
    const resolved = resolve(mode);
    setTheme(resolved);
    applyTheme(resolved);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Non-persistent storage: the choice still applies for this session.
      }
    }
  }, [mode]);

  // Follow the OS when in 'system' mode.
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const resolved = prefersDark() ? 'dark' : 'light';
      setTheme(resolved);
      applyTheme(resolved);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggle = useCallback(() => {
    setModeState((current) => (resolve(current) === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ mode, theme, setMode, toggle }), [mode, theme, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
