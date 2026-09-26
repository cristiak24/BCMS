import { View, Text } from '@/src/web/reactNative';
import { NavLink, useLocation } from 'react-router-dom';
import { MaterialIcons, FontAwesome5 } from '@/src/web/expoVectorIcons';
import { isSuperadmin } from '../utils/authSession';
import { useSession } from '../context/AuthContext';
import { theme } from '../constants/designSystem';
import { useResponsive } from '../hooks/useResponsive';

export type AdminMenuIconName = keyof typeof MaterialIcons.glyphMap;

export const ADMIN_MENU_ITEMS: { label: string; icon: AdminMenuIconName; href: string; superadminOnly?: boolean }[] = [
    { label: 'Dashboard', icon: 'grid-view', href: '/admin/dashboard' },
    { label: 'My Club', icon: 'shield', href: '/admin/my-club-admin' },
    { label: 'Manage Access', icon: 'verified-user', href: '/admin/manage-access' },
    { label: 'Manage Accounts', icon: 'groups', href: '/admin/manage-accounts' },
    { label: 'Roster', icon: 'people', href: '/admin/roster' },
    { label: 'Schedule', icon: 'calendar-today', href: '/admin/schedule' },
    { label: 'Create Club Admin', icon: 'admin-panel-settings', href: '/admin/create-club-admin', superadminOnly: true },
    { label: 'Finances', icon: 'payments', href: '/admin/finance' },
    // Compliance and Users were reachable only by typing the URL: with no menu
    // entry the header title also fell back to the first item ("Dashboard").
    { label: 'Compliance', icon: 'verified-user', href: '/admin/compliance' },
    { label: 'Users', icon: 'people', href: '/admin/users', superadminOnly: true },
];

type SidebarProps = {
    items?: typeof ADMIN_MENU_ITEMS;
};

export default function Sidebar({ items = ADMIN_MENU_ITEMS }: SidebarProps) {
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
        // tracks light/dark like the rest of the shell.
        <View
            className="w-[244px] h-full flex flex-col shrink-0 border-r"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
        >
            {/* Logo Area */}
            <View className="pt-5 px-4 pb-4 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-[12px] items-center justify-center" style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any}>
                    <FontAwesome5 name="basketball-ball" size={16} color="var(--c-on-brand)" />
                </View>
                <View className="flex-col">
                    <Text className="text-[17px] font-black tracking-tight leading-tight" style={{ color: 'var(--c-ink-strong)' }}>BCMS</Text>
                    <Text className="text-[9px] font-black tracking-widest uppercase mt-1" style={{ color: 'var(--c-brand-fg)' }}>Club Workspace</Text>
                </View>
            </View>

            {/* Navigation Links */}
            <View className="flex-1 py-1 px-2.5 gap-1 relative">
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
                                    <Text className="text-[13px]" style={{ color: isActive ? 'var(--c-brand-fg)' : 'var(--c-muted)', fontWeight: isActive ? '800' : '600' } as any} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                </View>
                            </NavLink>
                            {isActive && (
                                <View className="absolute -left-2.5 top-2.5 bottom-2.5 w-1 rounded-r-full" style={{ backgroundColor: 'var(--c-brand-surface)' }} />
                            )}
                        </View>
                    );
                })}
            </View>
            <View className="m-2.5 p-3 rounded-[12px] border" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
                <Text className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-faint)' }}>Active Workspace</Text>
                <Text className="text-[12px] font-bold" style={{ color: 'var(--c-ink) ' }} numberOfLines={1}>
                    {session?.clubName ?? 'Club workspace'}
                </Text>
            </View>
        </View>
    );
}
