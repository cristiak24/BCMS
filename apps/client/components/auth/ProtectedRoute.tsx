import { Navigate, useLocation, Outlet } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useFirebaseAuth } from '../../context/AuthContext';
import { LoadingScreen } from '../ui/ScreenState';
import { getHomeRouteForRole, normalizeRole, type UserRole } from '../../utils/authSession';
import PendingApproval from './PendingApproval';

interface ProtectedRouteProps {
  children?: ReactElement;
  roles?: UserRole[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const location = useLocation();
  const { initializing, session, signOut } = useFirebaseAuth();

  if (initializing) {
    return <LoadingScreen message="Preparing your workspace..." color="var(--c-brand-fg)" />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // An account awaiting club approval authenticates successfully but has no
  // data behind it, so the normal shell rendered as a wall of empty panels and
  // failed requests. Show them what is actually happening instead.
  if (normalizeRole(session.status) === 'pending') {
    return <PendingApproval session={session} onSignOut={signOut} />;
  }

  if (roles && roles.length > 0) {
    const role = normalizeRole(session.role);
    const allowed = roles.some((allowedRole) => normalizeRole(allowedRole) === role);

    if (!allowed) {
      return <Navigate to={getHomeRouteForRole(session.role)} replace />;
    }
  }

  return children ? children : <Outlet />;
}
