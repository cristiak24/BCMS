import { Navigate, Outlet } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useSession } from '../../context/AuthContext';
import { getHomeRouteForRole } from '../../utils/authSession';

interface PublicRouteProps {
  children?: ReactElement;
}

export default function PublicRoute({ children }: PublicRouteProps) {
  const { session } = useSession();

  // No spinner while Clerk loads: a visitor with no cached session is almost
  // always signed out, so show the page now. If Clerk does find a session, the
  // profile load sets `session` and this redirects.
  if (session) {
    return <Navigate to={getHomeRouteForRole(session.role)} replace />;
  }

  return children ? children : <Outlet />;
}
