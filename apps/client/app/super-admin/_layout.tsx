import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { ADMIN_MENU_ITEMS } from '../../components/Sidebar';
import AppHeader from '../../components/AppHeader';
import { InstallBanner } from '../../components/pwa/InstallApp';
import { HeaderProvider, useHeader } from '../../components/HeaderContext';
import { MobileBottomNavigation, MobileNavigationSheet } from '../../components/MobileNavigation';
import { ContentLoading } from '../../components/ui/ScreenState';
import { useSession } from '../../context/AuthContext';
import { SUPER_ADMIN_SEARCH_PLACEHOLDER } from '../../components/super-admin/format';

/**
 * Platform console shell for the superadmin role — the same frame as the club
 * admin area (sidebar on desktop, bottom bar + sheet on phones), so moving
 * between the two feels like one product. ProtectedRoute in App.tsx already
 * guarantees a superadmin session.
 */

const MENU_ITEMS: typeof ADMIN_MENU_ITEMS = [
  { label: 'Acasă', icon: 'grid-view', href: '/super-admin/dashboard' },
  { label: 'Cluburi', icon: 'apartment', href: '/super-admin/clubs' },
  { label: 'Utilizatori', icon: 'groups', href: '/super-admin/users' },
  { label: 'Facturare', icon: 'payments', href: '/super-admin/billing' },
  { label: 'Invită utilizator', icon: 'person-add', href: '/super-admin/create-user' },
  { label: 'Jurnal', icon: 'history', href: '/super-admin/audit-logs' },
  { label: 'Cereri GDPR', icon: 'verified-user', href: '/super-admin/privacy' },
  { label: 'Setări', icon: 'settings', href: '/super-admin/settings' },
];

const MOBILE_NAV_ITEMS = [
  { href: '/super-admin/dashboard', label: 'Acasă', icon: 'grid-view' as const, match: 'dashboard' },
  { href: '/super-admin/clubs', label: 'Cluburi', icon: 'apartment' as const, match: '/super-admin/clubs' },
  { href: '/super-admin/users', label: 'Utilizatori', icon: 'groups' as const, match: '/super-admin/users' },
  { href: '/super-admin/billing', label: 'Facturare', icon: 'payments' as const, match: '/super-admin/billing' },
];

function activeItem(pathname: string) {
  if (/^\/super-admin\/clubs\/[^/]+/.test(pathname)) return { label: 'Club', href: '/super-admin/clubs' };
  return MENU_ITEMS.find((item) => pathname.startsWith(item.href)) ?? MENU_ITEMS[0];
}

/** Screens that filter by the header search; typing anywhere else opens Utilizatori. */
function consumesSearch(pathname: string) {
  return pathname.startsWith('/super-admin/users') || pathname === '/super-admin/clubs';
}

export default function SuperAdminLayout() {
  return (
    <HeaderProvider>
      <SuperAdminShell />
    </HeaderProvider>
  );
}

function SuperAdminShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const { searchPlaceholder, setSearchPlaceholder, searchValue, setSearchValue, headerActions, mobileFab } = useHeader();
  const [menuOpen, setMenuOpen] = useState(false);
  const keepSearch = useRef(false);
  const current = activeItem(pathname);

  useEffect(() => {
    setSearchPlaceholder(SUPER_ADMIN_SEARCH_PLACEHOLDER);
  }, [setSearchPlaceholder]);

  // A new section starts with an empty search — unless the search itself
  // brought us here.
  useEffect(() => {
    if (keepSearch.current) {
      keepSearch.current = false;
      return;
    }
    setSearchValue('');
  }, [current.href, setSearchValue]);

  const onSearchChange = (value: string) => {
    setSearchValue(value);
    if (value.trim() && !consumesSearch(pathname)) {
      keepSearch.current = true;
      navigate('/super-admin/users');
    }
  };

  const initials = `${session?.firstName?.[0] ?? session?.name?.[0] ?? 'S'}${session?.lastName?.[0] ?? ''}`.toUpperCase();
  const isDashboard = pathname === '/super-admin' || pathname.startsWith('/super-admin/dashboard');
  const primary = MOBILE_NAV_ITEMS.map((item) => item.href);
  const moreIsActive = !isDashboard && !primary.some((href) => pathname.startsWith(href));

  return (
    <div className="flex flex-1 min-h-screen lg:flex-row flex-col" style={{ backgroundColor: 'var(--c-bg)' }}>
      <Sidebar items={MENU_ITEMS} subtitle="Administrare platformă" />

      <div className="flex flex-1 min-w-0 flex-col relative">
        <div className="lg:hidden sticky top-0 z-30">
          <AppHeader
            mobile
            title={current.label}
            subtitle="Super admin"
            topInset={0}
            searchPlaceholder={searchPlaceholder}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            avatarUrl={session?.avatarUrl ?? undefined}
            initials={initials}
            onOpenMenu={() => setMenuOpen(true)}
          />
        </div>

        <div className="hidden lg:block">
          <AppHeader
            title={current.label}
            searchPlaceholder={searchPlaceholder}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            headerActions={headerActions}
            avatarUrl={session?.avatarUrl ?? undefined}
            initials={initials}
            userName={session?.name}
            role={session?.role}
          />
        </div>

        <main className="flex-1 min-w-0 overflow-x-hidden flex flex-col relative">
          <div className="flex-1 min-w-0 pb-28 lg:pb-10 relative w-full flex flex-col">
            <InstallBanner placement="inline" />
            <Suspense fallback={<ContentLoading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>

        <div className="lg:hidden">{mobileFab}</div>

        <div className="lg:hidden">
          <MobileBottomNavigation
            items={MOBILE_NAV_ITEMS}
            pathname={pathname}
            isDashboard={isDashboard}
            moreIsActive={moreIsActive}
            bottomInset={0}
            onOpenMore={() => setMenuOpen(true)}
          />
          <MobileNavigationSheet
            visible={menuOpen}
            items={MENU_ITEMS}
            activeHref={current.href}
            onClose={() => setMenuOpen(false)}
            bottomInset={0}
          />
        </div>
      </div>
    </div>
  );
}
