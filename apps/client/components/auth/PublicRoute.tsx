import { Navigate, Outlet } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useSession } from '../../context/AuthContext';
import { LoadingScreen } from '../ui/ScreenState';
import { getHomeRouteForRole } from '../../utils/authSession';

interface PublicRouteProps {
  children?: ReactElement;
}

export default function PublicRoute({ children }: PublicRouteProps) {
  const { initializing, session } = useSession();

  if (initializing) {
    return <LoadingScreen message="Checking your session..." backgroundColor="var(--c-surface)" color="var(--c-blue)" />;
  }

  if (session) {
    return <Navigate to={getHomeRouteForRole(session.role)} replace />;
  }

  return children ? children : <Outlet />;
}
