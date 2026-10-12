import { useEffect } from 'react';
import { useRouter } from '@/src/web/expoRouter';
import { getHomeRouteForRole, normalizeRole } from '../utils/authSession';
import { useSession } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';
import Welcome from '../components/marketing/Welcome';

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
    return <LoadingScreen message="Opening BCMS..." backgroundColor="var(--c-surface)" color="var(--c-blue)" />;
  }

  return <Welcome />;
}
