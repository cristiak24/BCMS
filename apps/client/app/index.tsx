import { useEffect } from 'react';
import { useRouter } from '@/src/web/expoRouter';
import { getHomeRouteForRole, normalizeRole } from '../utils/authSession';
import { useSession } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';
import { lazyRoute } from '../src/lazyRoute';

// The marketing page is for visitors only: kept out of the main chunk, so a
// signed-in user (sent straight home from here) never downloads it. App.tsx
// preloads it for a visitor without a saved session.
export const loadWelcome = () => import('../components/marketing/Welcome');
const Welcome = lazyRoute(loadWelcome);

export default function Landing() {
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    // No waiting on Clerk here: a cached session forwards home immediately;
    // without one, the welcome page renders below and offers its own login
    // button, so there is nothing to redirect to yet.
    if (session) {
      router.replace(getHomeRouteForRole(normalizeRole(session.role)));
    }
  }, [router, session]);

  if (session) {
    return <LoadingScreen message="Se deschide BCMS…" backgroundColor="var(--c-surface)" color="var(--c-blue)" />;
  }

  return <Welcome />;
}
