import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import { HeaderProvider, useHeader } from '../../components/HeaderContext';
import { useFirebaseAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/authSession';
import AppHeader from '../../components/AppHeader';
import { MobileBottomNavigation, MobileNavigationSheet } from '../../components/MobileNavigation';
import { PLAYER_FEATURE_FLAGS } from '../../config/playerFeatureFlags';

const PLAYER_MENU_ITEMS = [
    { href: '/myclub' as const, label: 'Home', icon: 'grid-view' as const, match: 'myclub' },
    { href: '/schedule' as const, label: 'Schedule', icon: 'calendar-today' as const, match: 'schedule' },
    { href: '/attendance' as const, label: 'Attendance', icon: 'fact-check' as const, match: 'attendance' },
    { href: '/payments' as const, label: 'Payments', icon: 'payments' as const, match: 'payments' },
    ...(PLAYER_FEATURE_FLAGS.teammatesView
        ? [{ href: '/team' as const, label: 'Echipa mea', icon: 'groups' as const, match: 'team' }]
        : []),
    { href: '/account' as const, label: 'Account', icon: 'person' as const, match: 'account' },
];

// A coach gets their own `/coach/*` screens plus the two shared ones
// (schedule, account). This list used to be the player list with `/payments`
// relabelled "Teams", because the coach roster was rendered inside the player
// payments route. No "Echipa mea": that is the teammate-safe view, and a coach
// already sees the full roster on /coach/teams.
// `match` is tested with `pathname.includes(...)` by the bottom bar, so these
// have to be real path fragments — 'coach-teams' would never highlight on
// /coach/teams.
const COACH_MENU_ITEMS = [
    { href: '/coach/dashboard' as const, label: 'Home', icon: 'grid-view' as const, match: 'coach/dashboard' },
    { href: '/schedule' as const, label: 'Schedule', icon: 'calendar-today' as const, match: 'schedule' },
    { href: '/coach/attendance' as const, label: 'Attendance', icon: 'fact-check' as const, match: 'coach/attendance' },
    { href: '/coach/teams' as const, label: 'Teams', icon: 'groups' as const, match: 'coach/teams' },
    { href: '/account' as const, label: 'Account', icon: 'person' as const, match: 'account' },
];

// Bottom bar stays at 4 primary destinations on mobile so it never crowds or
// needs horizontal scroll — everything else (Account, Echipa mea) lives in
// the "More" sheet, same pattern as the admin mobile nav.
const MOBILE_PRIMARY_MATCHES = [
    'myclub', 'schedule', 'attendance', 'payments',
    'coach/dashboard', 'coach/attendance', 'coach/teams',
];

type TabMenuItem = (typeof PLAYER_MENU_ITEMS)[number] | (typeof COACH_MENU_ITEMS)[number];

function getActivePlayerItem<T extends { href: string; match: string }>(pathname: string, items: T[]) {
    const normalizedPathname = pathname || '/myclub';
    return items.find((item) => normalizedPathname.startsWith(item.href)) ?? items[0];
}

// Split into two components so HeaderProvider wraps the consumer, matching
// the (admin)/_layout.tsx pattern.
export default function PlayerTabsLayout() {
    return (
        <HeaderProvider>
            <PlayerTabsLayoutContent />
        </HeaderProvider>
    );
}

function PlayerTabsLayoutContent() {
    const location = useLocation();
    const pathname = location.pathname;
    const { searchPlaceholder, searchValue, setSearchValue, headerActions } = useHeader();
    const { session } = useFirebaseAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isCoach = normalizeRole(session?.role) === 'coach';
    // Annotated so the two lists collapse into one element type — without it
    // the ternary is `PlayerItem[] | CoachItem[]`, which nothing downstream
    // (filter, the nav components) can take as a single array.
    const menuItems: TabMenuItem[] = isCoach ? COACH_MENU_ITEMS : PLAYER_MENU_ITEMS;
    const primaryMobileItems = menuItems.filter((item) => MOBILE_PRIMARY_MATCHES.includes(item.match));
    const activePlayerItem = getActivePlayerItem(pathname, menuItems);
    const moreIsActive = !MOBILE_PRIMARY_MATCHES.includes(activePlayerItem.match);

    const getInitials = () => {
        const first = session?.firstName?.[0] ?? session?.name?.[0] ?? 'P';
        const last = session?.lastName?.[0] ?? '';
        return `${first}${last}`.toUpperCase();
    };

    // The ProtectedRoute wrapper in App.tsx already guarantees `session` exists
    // and the user has a coach/player/parent role before this renders.

    return (
        <div className="flex flex-1 min-h-screen bg-[#EAF1F8] lg:flex-row flex-col">
            <Sidebar items={menuItems} />

            <div className="flex flex-1 min-w-0 flex-col h-full relative">
                <div className="lg:hidden sticky top-0 z-30">
                    <AppHeader
                        mobile
                        title={activePlayerItem.label}
                        topInset={0}
                        searchPlaceholder={searchPlaceholder}
                        searchValue={searchValue}
                        onSearchChange={setSearchValue}
                        avatarUrl={session?.avatarUrl ?? undefined}
                        initials={getInitials()}
                        onOpenMenu={() => setMobileMenuOpen(true)}
                    />
                </div>

                <div className="hidden lg:block">
                    <AppHeader
                        title={activePlayerItem.label}
                        searchPlaceholder={searchPlaceholder}
                        searchValue={searchValue}
                        onSearchChange={setSearchValue}
                        headerActions={headerActions}
                        avatarUrl={session?.avatarUrl ?? undefined}
                        initials={getInitials()}
                        userName={session?.name}
                        role={session?.role}
                    />
                </div>

                {/* ── Main Content ────────────────────────────────── */}
                <div className="flex-1 min-w-0 overflow-auto overflow-x-hidden flex flex-col relative h-full">
                    <div className="flex-1 min-w-0 pb-24 lg:pb-0 relative w-full">
                        <Outlet />
                    </div>
                </div>

                <div className="lg:hidden">
                    <MobileBottomNavigation
                        items={primaryMobileItems}
                        pathname={pathname}
                        isDashboard={false}
                        moreIsActive={moreIsActive}
                        bottomInset={0}
                        onOpenMore={() => setMobileMenuOpen(true)}
                    />

                    <MobileNavigationSheet
                        visible={mobileMenuOpen}
                        items={menuItems}
                        activeHref={activePlayerItem.href}
                        onClose={() => setMobileMenuOpen(false)}
                        bottomInset={0}
                    />
                </div>
            </div>
        </div>
    );
}
