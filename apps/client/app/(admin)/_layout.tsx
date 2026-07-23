import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { ADMIN_MENU_ITEMS } from '../../components/Sidebar';
import { HeaderProvider, useHeader } from '../../components/HeaderContext';
import { normalizeRole, isSuperadmin } from '../../utils/authSession';
import { useFirebaseAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import AppHeader from '../../components/AppHeader';
import { MobileBottomNavigation, MobileNavigationSheet } from '../../components/MobileNavigation';

const MOBILE_NAV_ITEMS = [
    { href: '/admin/dashboard' as const, label: 'Dashboard', icon: 'grid-view' as const, match: 'dashboard' },
    { href: '/admin/finance' as const, label: 'Finance', icon: 'payments' as const, match: 'finance' },
    { href: '/admin/roster' as const, label: 'Roster', icon: 'groups' as const, match: 'roster' },
    { href: '/admin/schedule' as const, label: 'Schedule', icon: 'calendar-today' as const, match: 'schedule' },
];

function getAdminPath(pathname: string) {
    return pathname || '/admin/dashboard';
}

function getActiveAdminItem(pathname: string) {
    const normalizedPathname = getAdminPath(pathname);
    return ADMIN_MENU_ITEMS.find((item) => {
        const cleanHref = item.href;
        return normalizedPathname.startsWith(cleanHref) || (cleanHref === '/admin/dashboard' && normalizedPathname === '/admin');
    }) ?? ADMIN_MENU_ITEMS[0];
}

// Split into two components so HeaderProvider wraps the consumer.
// AdminLayout = provider shell, AdminLayoutContent = the actual UI.
export default function AdminLayout() {
    return (
        <HeaderProvider>
            <AdminLayoutContent />
        </HeaderProvider>
    );
}

function AdminLayoutContent() {
    const location = useLocation();
    const pathname = location.pathname;
    const { searchPlaceholder, searchValue, setSearchValue, headerActions, mobileFab } = useHeader();
    const { session } = useFirebaseAuth();
    const { isMobile } = useResponsive();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    
    const activeAdminItem = getActiveAdminItem(pathname);
    const availableMenuItems = useMemo(
        () => ADMIN_MENU_ITEMS.filter((item) => !item.superadminOnly || isSuperadmin(session)),
        [session],
    );

    const isDashboard = pathname.includes('dashboard') || pathname === '/admin';
    const normalizedAdminPath = getAdminPath(pathname);
    const primaryMobileMatches = MOBILE_NAV_ITEMS.map((item) => item.match);
    const moreIsActive = availableMenuItems.some((item) => {
        const section = item.href.split('/').filter(Boolean).pop() ?? '';
        return normalizedAdminPath.startsWith(item.href) && !primaryMobileMatches.includes(section);
    });

    const getInitials = () => {
        const first = session?.firstName?.[0] ?? session?.name?.[0] ?? 'A';
        const last = session?.lastName?.[0] ?? '';
        return `${first}${last}`.toUpperCase();
    };

    // The ProtectedRoute wrapper in App.tsx already guarantees `session` exists 
    // and the user has an admin-level role before this renders.

    return (
        <div className="flex flex-1 min-h-screen bg-[#EAF1F8] lg:flex-row flex-col">
            <Sidebar />

            <div className="flex flex-1 min-w-0 flex-col h-full relative">
                <div className="lg:hidden sticky top-0 z-30">
                    <AppHeader
                        mobile
                        title={activeAdminItem.label}
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
                        title={activeAdminItem.label}
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

                {/* ── Mobile FAB slot (absolute, above bottom nav) ─ */}
                <div className="lg:hidden">{mobileFab}</div>

                <div className="lg:hidden">
                    <MobileBottomNavigation
                        items={MOBILE_NAV_ITEMS}
                        pathname={pathname}
                        isDashboard={isDashboard}
                        moreIsActive={moreIsActive}
                        bottomInset={0}
                        onOpenMore={() => setMobileMenuOpen(true)}
                    />

                    <MobileNavigationSheet
                        visible={mobileMenuOpen}
                        items={availableMenuItems}
                        activeHref={activeAdminItem.href}
                        onClose={() => setMobileMenuOpen(false)}
                        bottomInset={0}
                    />
                </div>
            </div>
        </div>
    );
}
