import { Navigate } from 'react-router-dom';
import ProfileScreen from '../components/profile/ProfileScreen';
import { useSession } from '../context/AuthContext';
import { normalizeRole } from '../utils/authSession';

/**
 * A player, parent or coach has their profile inside the app shell at /account; the
 * avatar menu's /profile opened the same screen at a second address.
 */
export default function ProfileRoute() {
  const role = normalizeRole(useSession().session?.role);
  if (role === 'player' || role === 'parent' || role === 'coach') {
    return <Navigate to="/account" replace />;
  }
  return <ProfileScreen />;
}
