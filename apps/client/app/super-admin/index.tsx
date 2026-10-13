import { Navigate } from 'react-router-dom';

export default function SuperAdminIndex() {
  return <Navigate to="/super-admin/dashboard" replace />;
}
