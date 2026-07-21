import { View, Text } from '@/src/web/reactNative';
import { NavLink, useLocation } from 'react-router-dom';
import { MaterialIcons, FontAwesome5 } from '@/src/web/expoVectorIcons';
import { isSuperadmin } from '../utils/authSession';
import { useFirebaseAuth } from '../context/AuthContext';
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
];

export default function Sidebar() {
    const { pathname } = useLocation();
    const { session } = useFirebaseAuth();
    const { width } = useResponsive();
    const normalizedPathname = pathname || '/admin/dashboard';

    if (width < 1024) {
        return null;
    }

    return (
        <View className="w-[244px] h-full bg-[#F7FAFD]/95 flex flex-col shrink-0 border-r border-white/70" style={{ boxShadow: '12px 0 34px rgba(11, 30, 61, 0.06)' } as any}>
            {/* Logo Area */}
            <View className="pt-5 px-4 pb-4 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-[15px] bg-[#123B95] items-center justify-center border border-white" style={theme.shadow.lift}>
                    <FontAwesome5 name="basketball-ball" size={16} color="#ffffff" />
                </View>
                <View className="flex-col">
                    <Text className="text-[#07152F] text-[17px] font-black tracking-tight leading-tight">BCMS</Text>
                    <Text className="text-[#2563EB] text-[9px] font-black tracking-widest uppercase mt-1">Club Workspace</Text>
                </View>
            </View>

            {/* Navigation Links */}
            <View className="flex-1 py-1 px-2.5 gap-1 relative">
                {ADMIN_MENU_ITEMS.map((item) => {
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
                                    className={`flex-row items-center px-3 py-2.5 rounded-[17px] ${isActive ? 'bg-white border border-white' : 'border border-transparent'}`}
                                    style={isActive ? { boxShadow: '0 18px 38px rgba(18, 59, 149, 0.10)' } as any : undefined}
                                >
                                    <View className={`w-8 h-8 rounded-[13px] items-center justify-center mr-2.5 ${isActive ? 'bg-[#123B95]' : 'bg-white border border-[#E4ECF7]'}`}>
                                        <MaterialIcons
                                            name={item.icon}
                                            size={17}
                                            color={isActive ? '#FFFFFF' : '#66809F'}
                                        />
                                    </View>
                                    <Text className={`text-[13px] ${isActive ? 'font-black text-[#07152F]' : 'font-bold text-[#64748B]'}`} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                    {isActive ? (
                                        <View className="ml-auto w-2 h-2 rounded-full bg-[#D97706]" />
                                    ) : null}
                                </View>
                            </NavLink>
                            {isActive && (
                                <View className="absolute -left-3 top-3 bottom-3 w-1 rounded-r-full bg-[#D97706]" />
                            )}
                        </View>
                    );
                })}
            </View>
            <View className="m-2.5 p-3 rounded-[18px] bg-white/92 border border-white" style={{ boxShadow: '0 12px 24px rgba(11, 30, 61, 0.06)' } as any}>
                <Text className="text-[#07152F] text-[12px] font-black mb-1">Active Workspace</Text>
                <Text className="text-[#94A3B8] text-[11px] font-black uppercase tracking-widest">
                    {session?.clubName ?? 'Club workspace'}
                </Text>
            </View>
        </View>
    );
}
