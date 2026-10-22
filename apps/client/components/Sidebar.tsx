import { View, Text } from '@/src/web/reactNative';
import { NavLink, useLocation } from 'react-router-dom';
import { MaterialIcons, FontAwesome5 } from '@/src/web/expoVectorIcons';
import { isSuperadmin } from '../utils/authSession';
import { useSession } from '../context/AuthContext';
import { theme } from '../constants/designSystem';
import { useResponsive } from '../hooks/useResponsive';

export type AdminMenuIconName = keyof typeof MaterialIcons.glyphMap;

export const ADMIN_MENU_ITEMS: { label: string; icon: AdminMenuIconName; href: string; superadminOnly?: boolean; badge?: number }[] = [
    { label: 'Acasă', icon: 'grid-view', href: '/admin/dashboard' },
    // One distinct glyph per entry: three shields (club, access, compliance)
    // and one silhouette for both Conturi and Lot read as the same item.
    { label: 'Clubul meu', icon: 'domain', href: '/admin/my-club-admin' },
    { label: 'Acces & invitații', icon: 'vpn-key', href: '/admin/manage-access' },
    { label: 'Conturi', icon: 'manage-accounts', href: '/admin/manage-accounts' },
    { label: 'Lot', icon: 'groups', href: '/admin/roster' },
    { label: 'Program', icon: 'calendar-today', href: '/admin/schedule' },
    { label: 'L12', icon: 'assignment', href: '/admin/l12' },
    { label: 'Documente', icon: 'folder', href: '/admin/documents' },
    // "Contacte", not "Agendă": Program has an "Agendă" view (the event list).
    { label: 'Contacte', icon: 'contacts', href: '/admin/contacts' },
    { label: 'Admin club nou', icon: 'person-add', href: '/admin/create-club-admin', superadminOnly: true },
    { label: 'Finanțe', icon: 'payments', href: '/admin/finance' },
    // Compliance and Users were reachable only by typing the URL: with no menu
    // entry the header title also fell back to the first item ("Dashboard").
    { label: 'Conformitate', icon: 'medical-services', href: '/admin/compliance' },
    { label: 'Jurnal', icon: 'history', href: '/admin/audit-log' },
    // GDPR requests have a 30-day legal deadline; they were reachable only from a notification.
    { label: 'Date personale', icon: 'security', href: '/admin/privacy' },
    { label: 'Utilizatori', icon: 'person-search', href: '/admin/users', superadminOnly: true },
];

type SidebarProps = {
    items?: typeof ADMIN_MENU_ITEMS;
    /** Line under the logo; defaults to the signed-in user's club. */
    subtitle?: string;
};

/** Open-items count next to a menu label (e.g. open GDPR requests). */
export function MenuBadge({ count }: { count: number }) {
    return (
        <View className="min-w-[20px] h-5 px-1.5 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-danger-bg)' }}>
            <Text className="t-num text-[11px] font-bold" style={{ color: 'var(--c-danger-fg)' }}>{count}</Text>
        </View>
    );
}

export default function Sidebar({ items = ADMIN_MENU_ITEMS, subtitle }: SidebarProps) {
    const { pathname } = useLocation();
    const { session } = useSession();
    const { width } = useResponsive();
    const normalizedPathname = pathname || '/admin/dashboard';

    if (width < 1024) {
        return null;
    }

    return (
        // Structural surfaces use tokens (not opacity-modifier utilities like
        // bg-white/95, which the palette layer can't retarget) so the sidebar
        // tracks light/dark like the rest of the shell. Pinned to the viewport:
        // `h-full` against a min-h-screen parent never resolved, so the sidebar
        // stopped at its content and left a darker seam below it.
        <View
            className="w-[244px] sticky top-0 h-screen overflow-y-auto flex flex-col shrink-0 border-r"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
        >
            {/* Logo Area */}
            <View className="pt-5 px-4 pb-4 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-[12px] items-center justify-center" style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any}>
                    <FontAwesome5 name="basketball-ball" size={16} color="var(--c-on-brand)" />
                </View>
                <View className="flex-col">
                    <Text className="text-[17px] font-black tracking-tight leading-tight" style={{ color: 'var(--c-ink-strong)' }}>BCMS</Text>
                    <Text className="text-[11.5px] font-semibold mt-0.5 max-w-[160px]" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{subtitle ?? session?.clubName ?? 'Clubul tău'}</Text>
                </View>
            </View>

            {/* Navigation Links */}
            <View role="navigation" aria-label="Meniu principal" className="flex-1 py-1 px-2.5 gap-1 relative">
                {items.map((item) => {
                    if (item.superadminOnly && !isSuperadmin(session)) {
                        return null;
                    }

                    const cleanHref = item.href;
                    const isActive = normalizedPathname.startsWith(cleanHref) || (cleanHref === '/admin/dashboard' && normalizedPathname === '/admin');
                    return (
                        <View key={item.href} className="relative">
                            <NavLink
                                to={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                className="block no-underline"
                            >
                                <View
                                    className="flex-row items-center px-3 py-2.5 rounded-[12px] border"
                                    style={isActive
                                        ? { backgroundColor: 'var(--c-surface-tint)', borderColor: 'var(--c-brand-border)' } as any
                                        : { borderColor: 'transparent' } as any}
                                >
                                    <View
                                        className="w-8 h-8 rounded-[10px] items-center justify-center mr-2.5 border"
                                        style={isActive
                                            ? { backgroundColor: 'var(--c-brand-surface)', borderColor: 'transparent' } as any
                                            : { backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
                                    >
                                        <MaterialIcons
                                            name={item.icon}
                                            size={17}
                                            color={isActive ? 'var(--c-on-brand)' : 'var(--c-muted)'}
                                        />
                                    </View>
                                    <Text className="flex-1 min-w-0 text-[13px]" style={{ color: isActive ? 'var(--c-brand-fg)' : 'var(--c-muted)', fontWeight: isActive ? '800' : '600' } as any} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                    {item.badge ? <MenuBadge count={item.badge} /> : null}
                                </View>
                            </NavLink>
                            {isActive && (
                                <View className="absolute -left-2.5 top-2.5 bottom-2.5 w-1 rounded-r-full" style={{ backgroundColor: 'var(--c-brand-surface)' }} />
                            )}
                        </View>
                    );
                })}
            </View>
        </View>
    );
}
