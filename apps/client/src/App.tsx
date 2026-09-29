import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { LoadingScreen } from '../components/ui/ScreenState';
import { lazyRoute, prefetchRoutes } from './lazyRoute';
import RouteProgress from '../components/ui/RouteProgress';
import { useSession } from '../context/AuthContext';
import { normalizeRole } from '../utils/authSession';
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
const loadSignup = () => import('../app/signup');
const Signup = lazyRoute(loadSignup);
const loadProfile = () => import('../app/profile');
const Profile = lazyRoute(loadProfile);
const loadNotFound = () => import('../app/not-found');
const NotFound = lazyRoute(loadNotFound);
const loadInviteRegistration = () => import('../app/invite/[token]');
const InviteRegistration = lazyRoute(loadInviteRegistration);

const loadPlayerLayout = () => import('../app/(tabs)/_layout');
const PlayerLayout = lazyRoute(loadPlayerLayout);
const loadPlayerHome = () => import('../app/(tabs)/index');
const PlayerHome = lazyRoute(loadPlayerHome);
const loadPlayerAccount = () => import('../app/(tabs)/account');
const PlayerAccount = lazyRoute(loadPlayerAccount);
const loadPlayerAttendance = () => import('../app/(tabs)/attendance');
const PlayerAttendance = lazyRoute(loadPlayerAttendance);
const loadPlayerPayments = () => import('../app/(tabs)/payments');
const PlayerPayments = lazyRoute(loadPlayerPayments);
const loadPlayerSchedule = () => import('../app/(tabs)/schedule');
const PlayerSchedule = lazyRoute(loadPlayerSchedule);
const loadPlayerTeam = () => import('../app/(tabs)/team/index');
const PlayerTeam = lazyRoute(loadPlayerTeam);
const loadPlayerTeamDetail = () => import('../app/(tabs)/team/[id]');
const PlayerTeamDetail = lazyRoute(loadPlayerTeamDetail);

// Coach screens share the player shell (same sidebar, same header) but get
// their own `/coach/*` paths — they used to be rendered *inside* the player
// routes, so a coach's roster lived at `/payments`.
const loadCoachDashboard = () => import('../app/(coach)/dashboard');
const CoachDashboard = lazyRoute(loadCoachDashboard);
const loadCoachTeams = () => import('../app/(coach)/teams');
const CoachTeams = lazyRoute(loadCoachTeams);
const loadCoachAttendance = () => import('../app/(coach)/attendance');
const CoachAttendance = lazyRoute(loadCoachAttendance);

const loadAdminLayout = () => import('../app/(admin)/_layout');
const AdminLayout = lazyRoute(loadAdminLayout);
const loadAdminDashboard = () => import('../app/(admin)/dashboard');
const AdminDashboard = lazyRoute(loadAdminDashboard);
const loadAdminRoster = () => import('../app/(admin)/roster');
const AdminRoster = lazyRoute(loadAdminRoster);
const loadAdminSchedule = () => import('../app/(admin)/schedule');
const AdminSchedule = lazyRoute(loadAdminSchedule);
const loadAdminRequests = () => import('../app/(admin)/requests');
const AdminRequests = lazyRoute(loadAdminRequests);
const loadAdminUserAccess = () => import('../app/(admin)/user-access');
const AdminUserAccess = lazyRoute(loadAdminUserAccess);
const loadAdminCreateClubAdmin = () => import('../app/(admin)/create-club-admin');
const AdminCreateClubAdmin = lazyRoute(loadAdminCreateClubAdmin);
const loadAdminCreateAccount = () => import('../app/(admin)/create-account');
const AdminCreateAccount = lazyRoute(loadAdminCreateAccount);
const loadAdminManageAccess = () => import('../app/(admin)/manage-access');
const AdminManageAccess = lazyRoute(loadAdminManageAccess);
const loadAdminManageAccounts = () => import('../app/(admin)/manage-accounts');
const AdminManageAccounts = lazyRoute(loadAdminManageAccounts);
const loadAdminMyClubAdmin = () => import('../app/(admin)/my-club-admin');
const AdminMyClubAdmin = lazyRoute(loadAdminMyClubAdmin);
const loadAdminFinance = () => import('../app/(admin)/finance');
const AdminFinance = lazyRoute(loadAdminFinance);
const loadAdminCompliance = () => import('../app/(admin)/compliance');
const AdminCompliance = lazyRoute(loadAdminCompliance);
const loadAdminTeamDetails = () => import('../app/(admin)/team/[id]');
const AdminTeamDetails = lazyRoute(loadAdminTeamDetails);
const loadAdminEventDetails = () => import('../app/(admin)/event/[id]');
const AdminEventDetails = lazyRoute(loadAdminEventDetails);
const loadAdminAttendanceDetails = () => import('../app/(admin)/attendance/[id]');
const AdminAttendanceDetails = lazyRoute(loadAdminAttendanceDetails);
const loadAdminPlayerDetails = () => import('../app/(admin)/player/[id]');
const AdminPlayerDetails = lazyRoute(loadAdminPlayerDetails);
const loadAdminUsers = () => import('../app/(admin)/users');
const AdminUsers = lazyRoute(loadAdminUsers);
const loadAdminUserDetails = () => import('../app/(admin)/users/[id]');
const AdminUserDetails = lazyRoute(loadAdminUserDetails);

const loadSuperAdminLayout = () => import('../app/super-admin/_layout');
const SuperAdminLayout = lazyRoute(loadSuperAdminLayout);
const loadSuperAdminIndex = () => import('../app/super-admin');
const SuperAdminIndex = lazyRoute(loadSuperAdminIndex);
const loadSuperAdminDashboard = () => import('../app/super-admin/dashboard');
const SuperAdminDashboard = lazyRoute(loadSuperAdminDashboard);
const loadSuperAdminClubs = () => import('../app/super-admin/clubs');
const SuperAdminClubs = lazyRoute(loadSuperAdminClubs);
const loadSuperAdminUsers = () => import('../app/super-admin/users');
const SuperAdminUsers = lazyRoute(loadSuperAdminUsers);
const loadSuperAdminCreateUser = () => import('../app/super-admin/create-user');
const SuperAdminCreateUser = lazyRoute(loadSuperAdminCreateUser);
const loadSuperAdminRoles = () => import('../app/super-admin/roles');
const SuperAdminRoles = lazyRoute(loadSuperAdminRoles);
const loadSuperAdminAuditLogs = () => import('../app/super-admin/audit-logs');
const SuperAdminAuditLogs = lazyRoute(loadSuperAdminAuditLogs);
const loadSuperAdminSettings = () => import('../app/super-admin/settings');
const SuperAdminSettings = lazyRoute(loadSuperAdminSettings);
const loadSuperAdminInviteRedirect = () => import('../app/super-admin/invite/[token]');
const SuperAdminInviteRedirect = lazyRoute(loadSuperAdminInviteRedirect);

/**
 * Once the session is known, warm the chunks of the screens this role actually
 * navigates between (bottom-nav destinations first), so a tap on a phone swaps
 * the page immediately instead of waiting on the network.
 */
function RoutePrefetcher() {
  const { session } = useSession();
  const role = normalizeRole(session?.role);

  useEffect(() => {
    if (!role) return;
    if (role === 'coach') {
      prefetchRoutes([loadPlayerLayout, loadCoachDashboard, loadPlayerSchedule, loadCoachAttendance, loadCoachTeams, loadPlayerAccount]);
    } else if (role === 'player' || role === 'parent') {
      prefetchRoutes([loadPlayerLayout, loadPlayerHome, loadPlayerSchedule, loadPlayerAttendance, loadPlayerPayments, loadPlayerTeam, loadPlayerAccount]);
    } else if (role === 'superadmin') {
      prefetchRoutes([loadSuperAdminLayout, loadSuperAdminDashboard, loadSuperAdminClubs, loadSuperAdminUsers, loadAdminLayout, loadAdminDashboard]);
    } else {
      prefetchRoutes([loadAdminLayout, loadAdminDashboard, loadAdminFinance, loadAdminRoster, loadAdminSchedule, loadAdminMyClubAdmin, loadProfile]);
    }
  }, [role]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <RouteProgress />
            <RoutePrefetcher />
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
                  {PLAYER_FEATURE_FLAGS.teammatesView ? (
                    <Route path="/team/:id" element={<PlayerTeamDetail />} />
                  ) : null}
                </Route>

                {/* Coach-only, and enforced by the router rather than by a role
                    check inside each screen — a player following a `/coach/*`
                    link is bounced by ProtectedRoute, not served a blank page. */}
                <Route path="/coach" element={<ProtectedRoute roles={['coach']}><PlayerLayout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="/coach/dashboard" replace />} />
                  <Route path="dashboard" element={<CoachDashboard />} />
                  <Route path="teams" element={<CoachTeams />} />
                  <Route path="attendance" element={<CoachAttendance />} />
                  <Route path="*" element={<NotFound />} />
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
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
