import { Navigate, useLocation, Outlet } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useFirebaseAuth } from '../../context/AuthContext';
import { LoadingScreen } from '../ui/ScreenState';
import { getHomeRouteForRole, normalizeRole, type UserRole } from '../../utils/authSession';

interface ProtectedRouteProps {
  children?: ReactElement;
  roles?: UserRole[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const location = useLocation();
  const { initializing, session } = useFirebaseAuth();

  if (initializing) {
    return <LoadingScreen message="Preparing your workspace..." color="#1D3E90" />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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
