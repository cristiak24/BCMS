import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FirebaseAuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { LoadingScreen } from '../components/ui/ScreenState';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import PublicRoute from '../components/auth/PublicRoute';
import { PLAYER_FEATURE_FLAGS } from '../config/playerFeatureFlags';

// Entry screens stay in the main chunk: they are what an unauthenticated visitor
// hits first, so lazy-loading them would only add a round trip.
import Landing from '../app/index';
import Login from '../app/login';

// Everything behind a login is code-split. The app previously shipped as a single
// ~812 kB chunk, so a player on mobile downloaded the entire super-admin console
// and the finance module before they could see their own schedule.
const Signup = lazy(() => import('../app/signup'));
const Profile = lazy(() => import('../app/profile'));
const NotFound = lazy(() => import('../app/not-found'));
const InviteRegistration = lazy(() => import('../app/invite/[token]'));

const PlayerLayout = lazy(() => import('../app/(tabs)/_layout'));
const PlayerHome = lazy(() => import('../app/(tabs)/index'));
const PlayerAccount = lazy(() => import('../app/(tabs)/account'));
const PlayerAttendance = lazy(() => import('../app/(tabs)/attendance'));
const PlayerPayments = lazy(() => import('../app/(tabs)/payments'));
const PlayerSchedule = lazy(() => import('../app/(tabs)/schedule'));
const PlayerTeam = lazy(() => import('../app/(tabs)/team'));

const AdminLayout = lazy(() => import('../app/(admin)/_layout'));
const AdminDashboard = lazy(() => import('../app/(admin)/dashboard'));
const AdminRoster = lazy(() => import('../app/(admin)/roster'));
const AdminSchedule = lazy(() => import('../app/(admin)/schedule'));
const AdminRequests = lazy(() => import('../app/(admin)/requests'));
const AdminUserAccess = lazy(() => import('../app/(admin)/user-access'));
const AdminCreateClubAdmin = lazy(() => import('../app/(admin)/create-club-admin'));
const AdminCreateAccount = lazy(() => import('../app/(admin)/create-account'));
const AdminManageAccess = lazy(() => import('../app/(admin)/manage-access'));
const AdminManageAccounts = lazy(() => import('../app/(admin)/manage-accounts'));
const AdminMyClubAdmin = lazy(() => import('../app/(admin)/my-club-admin'));
const AdminFinance = lazy(() => import('../app/(admin)/finance'));
const AdminCompliance = lazy(() => import('../app/(admin)/compliance'));
const AdminTeamDetails = lazy(() => import('../app/(admin)/team/[id]'));
const AdminEventDetails = lazy(() => import('../app/(admin)/event/[id]'));
const AdminAttendanceDetails = lazy(() => import('../app/(admin)/attendance/[id]'));
const AdminPlayerDetails = lazy(() => import('../app/(admin)/player/[id]'));
const AdminUsers = lazy(() => import('../app/(admin)/users'));
const AdminUserDetails = lazy(() => import('../app/(admin)/users/[id]'));

const SuperAdminLayout = lazy(() => import('../app/super-admin/_layout'));
const SuperAdminIndex = lazy(() => import('../app/super-admin'));
const SuperAdminDashboard = lazy(() => import('../app/super-admin/dashboard'));
const SuperAdminClubs = lazy(() => import('../app/super-admin/clubs'));
const SuperAdminUsers = lazy(() => import('../app/super-admin/users'));
const SuperAdminCreateUser = lazy(() => import('../app/super-admin/create-user'));
const SuperAdminRoles = lazy(() => import('../app/super-admin/roles'));
const SuperAdminAuditLogs = lazy(() => import('../app/super-admin/audit-logs'));
const SuperAdminSettings = lazy(() => import('../app/super-admin/settings'));
const SuperAdminInviteRedirect = lazy(() => import('../app/super-admin/invite/[token]'));

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <FirebaseAuthProvider>
            <Suspense fallback={<LoadingScreen message="Se încarcă..." />}>
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
                  {PLAYER_FEATURE_FLAGS.teammatesView ? (
                    <Route path="/team" element={<PlayerTeam />} />
                  ) : null}
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
                  <Route path="*" element={<NotFound />} />
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
                  <Route path="*" element={<NotFound />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </FirebaseAuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
