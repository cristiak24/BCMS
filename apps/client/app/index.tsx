import { useEffect } from 'react';
import { useRouter } from '@/src/web/expoRouter';
import { getHomeRouteForRole, normalizeRole } from '../utils/authSession';
import { useFirebaseAuth } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';

export default function Landing() {
  const router = useRouter();
  const { session, initializing } = useFirebaseAuth();

  useEffect(() => {
    if (initializing) {
      return;
    }

    router.replace(session ? getHomeRouteForRole(normalizeRole(session.role)) : '/login');
  }, [initializing, router, session]);

  return <LoadingScreen message="Opening BCMS..." backgroundColor="#FFFFFF" color="#2563EB" />;
}
