import { useEffect } from 'react';
import { useRouter } from '@/src/web/expoRouter';
import { getHomeRouteForRole, normalizeRole } from '../utils/authSession';
import { useSession } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';

export default function Landing() {
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    // No waiting on Clerk here: without a cached session, /login renders
    // immediately and forwards to the home screen itself if Clerk turns up a
    // session after all.
    router.replace(session ? getHomeRouteForRole(normalizeRole(session.role)) : '/login');
  }, [router, session]);

  return <LoadingScreen message="Opening BCMS..." backgroundColor="var(--c-surface)" color="var(--c-blue)" />;
}
