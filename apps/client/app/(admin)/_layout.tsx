import { Suspense, useEffect, useMemo, useState } from 'react';
import { ContentLoading } from '../../components/ui/ScreenState';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { ADMIN_MENU_ITEMS } from '../../components/Sidebar';
import { HeaderProvider, useHeader } from '../../components/HeaderContext';
import { normalizeRole, isSuperadmin } from '../../utils/authSession';
import { useSession } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import AppHeader from '../../components/AppHeader';
import { InstallBanner } from '../../components/pwa/InstallApp';
import { MobileBottomNavigation, MobileNavigationSheet } from '../../components/MobileNavigation';
import { privacyRequestsApi } from '../../services/privacyApi';

// Pages that read the header search (useHeader().searchValue). Everywhere else
// the field is hidden: on Acasă, Echipă, Jucător, Cont nou, Jurnal… typing in it
// changed nothing. Add a route here when its page starts filtering by it.
const SEARCHABLE_PREFIXES = [
    '/admin/roster', '/admin/schedule', '/admin/attendance/', '/admin/manage-access', '/admin/manage-accounts',
    '/admin/compliance', '/admin/contacts', '/admin/documents', '/admin/users',
];

const MOBILE_NAV_ITEMS = [
    { href: '/admin/dashboard' as const, label: 'Acasă', icon: 'grid-view' as const, match: 'dashboard' },
    { href: '/admin/finance' as const, label: 'Finanțe', icon: 'payments' as const, match: 'finance' },
    { href: '/admin/roster' as const, label: 'Lot', icon: 'groups' as const, match: 'roster' },
    { href: '/admin/schedule' as const, label: 'Program', icon: 'calendar-today' as const, match: 'schedule' },
];

// The accountant role shares this exact shell (same sidebar, same header,
// same /admin/* pages) but only ever needs the finance-related corner of it —
// club ops (roster, schedule, compliance, access management) isn't theirs to
// see. Same pattern as the coach/player split in (tabs)/_layout.tsx.
const ACCOUNTANT_MENU_ITEMS: typeof ADMIN_MENU_ITEMS = [
    { label: 'Finanțe', icon: 'payments', href: '/admin/finance' },
    { label: 'Documente', icon: 'folder', href: '/admin/documents' },
    { label: 'Contacte', icon: 'contacts', href: '/admin/contacts' },
];

const ACCOUNTANT_MOBILE_NAV_ITEMS = [
    { href: '/admin/finance' as const, label: 'Finanțe', icon: 'payments' as const, match: 'finance' },
    { href: '/admin/documents' as const, label: 'Documente', icon: 'folder' as const, match: 'documents' },
    { href: '/admin/contacts' as const, label: 'Contacte', icon: 'contacts' as const, match: 'contacts' },
];

// Staff (scorekeepers, team managers) can read the schedule, keep live stats
// and open staff documents; every other admin screen answered them with 403s.
const STAFF_MENU_ITEMS: typeof ADMIN_MENU_ITEMS = [
    { label: 'Program', icon: 'calendar-today', href: '/admin/schedule' },
    { label: 'Documente', icon: 'folder', href: '/admin/documents' },
    { label: 'Contacte', icon: 'contacts', href: '/admin/contacts' },
];

const STAFF_MOBILE_NAV_ITEMS = [
    { href: '/admin/schedule' as const, label: 'Program', icon: 'calendar-today' as const, match: 'schedule' },
    { href: '/admin/documents' as const, label: 'Documente', icon: 'folder' as const, match: 'documents' },
    { href: '/admin/contacts' as const, label: 'Contacte', icon: 'contacts' as const, match: 'contacts' },
];

/**
 * Titles for admin screens that intentionally have no sidebar entry (detail
 * pages and sub-flows reached from another screen).
 *
 * Without this, `getActiveAdminItem` fell through to `ADMIN_MENU_ITEMS[0]` and
 * every one of these pages was labelled "Dashboard" in the header.
 */
const ADMIN_SECTION_TITLES: { prefix: string; label: string }[] = [
    { prefix: '/admin/create-account', label: 'Cont nou' },
    { prefix: '/admin/create-club-admin', label: 'Admin club nou' },
    { prefix: '/admin/team/', label: 'Echipă' },
    { prefix: '/admin/player/', label: 'Jucător' },
    { prefix: '/admin/event/', label: 'Eveniment' },
    // „Fișa meciului” is the live statistics everywhere else; this is FRB's own sheet.
    { prefix: '/admin/match/', label: 'Fișa FRB' },
    { prefix: '/admin/attendance/', label: 'Prezență' },
    { prefix: '/admin/stats/', label: 'Statistică meci' },
    { prefix: '/admin/users/', label: 'Utilizator' },
    { prefix: '/admin/privacy', label: 'Cereri date personale' },
];

function getAdminPath(pathname: string) {
    return pathname || '/admin/dashboard';
}

function getActiveAdminItem(pathname: string, menuItems: typeof ADMIN_MENU_ITEMS) {
    const normalizedPathname = getAdminPath(pathname);

    // Longest matching href wins, so /admin/users/12 does not match /admin/users
    // before the more specific detail-page title below.
    const menuMatch = menuItems
        .filter((item) => normalizedPathname.startsWith(item.href)
            || (item.href === '/admin/dashboard' && normalizedPathname === '/admin'))
        .sort((a, b) => b.href.length - a.href.length)[0];

    const sectionMatch = ADMIN_SECTION_TITLES
        .filter((section) => normalizedPathname.startsWith(section.prefix))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];

    if (sectionMatch && (!menuMatch || sectionMatch.prefix.length > menuMatch.href.length)) {
        return { label: sectionMatch.label, href: sectionMatch.prefix };
    }

    return menuMatch ?? menuItems[0];
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
    const { session } = useSession();
    const { isMobile } = useResponsive();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const role = normalizeRole(session?.role);
    const isAccountant = role === 'accountant';
    const isStaff = role === 'staff';
    const menuItems = isAccountant ? ACCOUNTANT_MENU_ITEMS : isStaff ? STAFF_MENU_ITEMS : ADMIN_MENU_ITEMS;
    const mobileNavItems = isAccountant ? ACCOUNTANT_MOBILE_NAV_ITEMS : isStaff ? STAFF_MOBILE_NAV_ITEMS : MOBILE_NAV_ITEMS;

    const activeAdminItem = getActiveAdminItem(pathname, menuItems);
    const showHeaderSearch = SEARCHABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    // Open GDPR requests as a badge on „Date personale” (admin menu only).
    // Re-read when leaving that page, so a resolved request clears the count.
    const isClubAdmin = role === 'admin' || role === 'superadmin';
    const onPrivacyPage = pathname.startsWith('/admin/privacy');
    const [openPrivacyRequests, setOpenPrivacyRequests] = useState(0);
    useEffect(() => {
        if (!isClubAdmin || onPrivacyPage) return undefined;
        let active = true;
        privacyRequestsApi.list('open')
            .then((rows) => { if (active) setOpenPrivacyRequests(rows.length); })
            .catch(() => undefined);
        return () => { active = false; };
    }, [isClubAdmin, onPrivacyPage]);

    const availableMenuItems = useMemo(
        () => menuItems
            .filter((item) => !item.superadminOnly || isSuperadmin(session))
            .map((item) => (item.href === '/admin/privacy' && openPrivacyRequests ? { ...item, badge: openPrivacyRequests } : item)),
        [session, menuItems, openPrivacyRequests],
    );

    const isDashboard = pathname.includes('dashboard') || pathname === '/admin';
    const normalizedAdminPath = getAdminPath(pathname);
    const primaryMobileMatches = mobileNavItems.map((item) => item.match);
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
            {/* Keyboard users skip the menu (12+ stops) straight to the page. */}
            <a href="#continut" className="skip-link">Sari la conținut</a>
            <Sidebar items={availableMenuItems} />

            <div className="flex flex-1 min-w-0 flex-col relative">
                <div className="lg:hidden sticky top-0 z-30">
                    <AppHeader
                        mobile
                        title={activeAdminItem.label}
                        topInset={0}
                        searchPlaceholder={searchPlaceholder}
                        searchValue={searchValue}
                        onSearchChange={setSearchValue}
                        showSearch={showHeaderSearch}
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
                        showSearch={showHeaderSearch}
                        headerActions={headerActions}
                        avatarUrl={session?.avatarUrl ?? undefined}
                        initials={getInitials()}
                        userName={session?.name}
                        role={session?.role}
                    />
                </div>

                {/* ── Main Content ────────────────────────────────── */}
                <main id="continut" tabIndex={-1} className="outline-none flex-1 min-w-0 overflow-auto overflow-x-hidden flex flex-col relative h-full">
                    {/* With a floating "+" button the last row needs to clear it too,
                        not only the bottom bar (it sat under "+ Eveniment"). */}
                    <div className={`flex-1 min-w-0 ${mobileFab ? 'pb-40' : 'pb-24'} lg:pb-0 relative w-full flex flex-col`}>
                        <InstallBanner placement="inline" />
                        <Suspense fallback={<ContentLoading />}>
                            <Outlet />
                        </Suspense>
                    </div>
                </main>

                {/* ── Mobile FAB slot (absolute, above bottom nav) ─ */}
                <div className="lg:hidden">{mobileFab}</div>

                <div className="lg:hidden">
                    <MobileBottomNavigation
                        items={mobileNavItems}
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
