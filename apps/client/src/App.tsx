import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { FirebaseAuthProvider, useFirebaseAuth } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';
import { getHomeRouteForRole, normalizeRole, type UserRole } from '../utils/authSession';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import PublicRoute from '../components/auth/PublicRoute';

import Landing from '../app/index';
import Login from '../app/login';
import Signup from '../app/signup';
import Profile from '../app/profile';
import InviteRegistration from '../app/invite/[token]';

import PlayerHome from '../app/(tabs)/index';
import PlayerAccount from '../app/(tabs)/account';
import PlayerAttendance from '../app/(tabs)/attendance';
import PlayerPayments from '../app/(tabs)/payments';
import PlayerSchedule from '../app/(tabs)/schedule';

import AdminLayout from '../app/(admin)/_layout';
import AdminDashboard from '../app/(admin)/dashboard';
import AdminRoster from '../app/(admin)/roster';
import AdminSchedule from '../app/(admin)/schedule';
import AdminRequests from '../app/(admin)/requests';
import AdminUserAccess from '../app/(admin)/user-access';
import AdminCreateClubAdmin from '../app/(admin)/create-club-admin';
import AdminCreateAccount from '../app/(admin)/create-account';
import AdminManageAccess from '../app/(admin)/manage-access';
import AdminManageAccounts from '../app/(admin)/manage-accounts';
import AdminMyClubAdmin from '../app/(admin)/my-club-admin';
import AdminFinance from '../app/(admin)/finance';
import AdminCompliance from '../app/(admin)/compliance';
import AdminTeamDetails from '../app/(admin)/team/[id]';
import AdminEventDetails from '../app/(admin)/event/[id]';
import AdminAttendanceDetails from '../app/(admin)/attendance/[id]';
import AdminPlayerDetails from '../app/(admin)/player/[id]';
import AdminUsers from '../app/(admin)/users';
import AdminUserDetails from '../app/(admin)/users/[id]';

import SuperAdminLayout from '../app/super-admin/_layout';
import SuperAdminIndex from '../app/super-admin';
import SuperAdminDashboard from '../app/super-admin/dashboard';
import SuperAdminClubs from '../app/super-admin/clubs';
import SuperAdminUsers from '../app/super-admin/users';
import SuperAdminCreateUser from '../app/super-admin/create-user';
import SuperAdminRoles from '../app/super-admin/roles';
import SuperAdminAuditLogs from '../app/super-admin/audit-logs';
import SuperAdminSettings from '../app/super-admin/settings';
import SuperAdminInviteRedirect from '../app/super-admin/invite/[token]';

function PlayerLayout() {
  return <Outlet />;
}


export default function App() {
  return (
    <BrowserRouter>
      <FirebaseAuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/invite/:token" element={<InviteRegistration />} />

          <Route element={<ProtectedRoute roles={['coach', 'player', 'parent']}><PlayerLayout /></ProtectedRoute>}>
            <Route path="/myclub" element={<PlayerHome />} />
            <Route path="/account" element={<PlayerAccount />} />
            <Route path="/attendance" element={<PlayerAttendance />} />
            <Route path="/payments" element={<PlayerPayments />} />
            <Route path="/schedule" element={<PlayerSchedule />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute roles={['admin', 'superadmin', 'accountant', 'staff']}><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="myclub" element={<Navigate to="/admin/my-club-admin" replace />} />
            <Route path="roster" element={<AdminRoster />} />
            <Route path="schedule" element={<AdminSchedule />} />
            <Route path="requests" element={<AdminRequests />} />
            <Route path="user-access" element={<AdminUserAccess />} />
            <Route path="create-club-admin" element={<AdminCreateClubAdmin />} />
            <Route path="create-account" element={<AdminCreateAccount />} />
            <Route path="manage-access" element={<AdminManageAccess />} />
            <Route path="manage-accounts" element={<AdminManageAccounts />} />
            <Route path="my-club-admin" element={<AdminMyClubAdmin />} />
            <Route path="finance" element={<AdminFinance />} />
            <Route path="compliance" element={<AdminCompliance />} />
            <Route path="team/:id" element={<AdminTeamDetails />} />
            <Route path="event/:id" element={<AdminEventDetails />} />
            <Route path="attendance/:id" element={<AdminAttendanceDetails />} />
            <Route path="player/:id" element={<AdminPlayerDetails />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUserDetails />} />
          </Route>

          <Route path="/super-admin" element={<ProtectedRoute roles={['superadmin']}><SuperAdminLayout /></ProtectedRoute>}>
            <Route index element={<SuperAdminIndex />} />
            <Route path="dashboard" element={<SuperAdminDashboard />} />
            <Route path="clubs" element={<SuperAdminClubs />} />
            <Route path="users" element={<SuperAdminUsers />} />
            <Route path="create-user" element={<SuperAdminCreateUser />} />
            <Route path="roles" element={<SuperAdminRoles />} />
            <Route path="audit-logs" element={<SuperAdminAuditLogs />} />
            <Route path="settings" element={<SuperAdminSettings />} />
            <Route path="invite/:token" element={<SuperAdminInviteRedirect />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </FirebaseAuthProvider>
    </BrowserRouter>
  );
}
