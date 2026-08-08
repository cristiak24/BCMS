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

// (tabs)/payments.tsx renders CoachTeams (a roster view) instead of payments
// info for coach sessions — the nav item at that route has to match. Coaches
// already get a full roster there, so "Echipa mea" (teammate-safe view) is
// player/parent-only and left out of this list.
const COACH_MENU_ITEMS = PLAYER_MENU_ITEMS
    .filter((item) => item.href !== '/team')
    .map((item) => (item.href === '/payments' ? { ...item, label: 'Teams', icon: 'groups' as const } : item));

// Bottom bar stays at 4 primary destinations on mobile so it never crowds or
// needs horizontal scroll — everything else (Account, Echipa mea) lives in
// the "More" sheet, same pattern as the admin mobile nav.
const MOBILE_PRIMARY_MATCHES = ['myclub', 'schedule', 'attendance', 'payments'];

function getActivePlayerItem(pathname: string, items: typeof PLAYER_MENU_ITEMS) {
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
    const menuItems = isCoach ? COACH_MENU_ITEMS : PLAYER_MENU_ITEMS;
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
