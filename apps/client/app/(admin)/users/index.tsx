import { View, Text, Pressable } from '@/src/web/reactNative';
import { Link } from '@/src/web/expoRouter';
import { useEffect, useMemo, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { usersApi, User } from '../../../services/usersApi';
import { useResponsive } from '../../../hooks/useResponsive';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../../components/HeaderContext';
import AdminHero, { AdminMetricCard } from '../../../components/admin/AdminHero';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/dashboard/ScreenStates';

const ROLE_VISUAL: Record<string, { tint: string; fg: string }> = {
    admin: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-strong)' },
    superadmin: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-strong)' },
    coach: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)' },
    player: { tint: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
    parent: { tint: 'var(--c-surface-tint)', fg: 'var(--c-purple)' },
    accountant: { tint: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
};

function roleVisual(role: string) {
    return ROLE_VISUAL[role] ?? { tint: 'var(--c-surface-3)', fg: 'var(--c-muted)' };
}

function initialsOf(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)).toUpperCase();
}

export default function UserList() {
    const { isMobile } = useResponsive();
    const { searchValue, setSearchValue, setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await usersApi.getUsers();
            setUsers(data);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError(err instanceof Error ? err.message : 'Nu am putut încărca utilizatorii.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setSearchPlaceholder('Caută utilizatori după nume, email sau rol...');
        setHeaderActions(null);
        setMobileFab(null);
        return () => {
            setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
            setSearchValue('');
            setHeaderActions(null);
            setMobileFab(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredUsers = useMemo(() => {
        const query = searchValue.trim().toLowerCase();
        if (!query) return users;
        return users.filter((user) => [user.name, user.email, user.role].some((value) => value.toLowerCase().includes(query)));
    }, [users, searchValue]);

    const roleCounts = useMemo(() => {
        const admins = users.filter((user) => user.role === 'admin' || (user.role as string) === 'superadmin').length;
        return { total: users.length, admins };
    }, [users]);

    return (
        <View className="w-full max-w-[1000px] mx-auto px-4 md:px-0 pt-6 pb-16">
            <AdminHero title="Users" subtitle="All accounts across every club on the platform.">
                <View className="mt-5 md:mt-0 flex-row flex-wrap gap-3">
                    <AdminMetricCard label="Users" value={roleCounts.total} />
                    <AdminMetricCard label="Admins" value={roleCounts.admins} />
                </View>
            </AdminHero>

            {loading ? (
                <SkeletonList count={5} />
            ) : error ? (
                <ErrorState title="Nu am putut încărca utilizatorii" message={error} onRetry={fetchUsers} />
            ) : filteredUsers.length === 0 ? (
                <EmptyState title="Niciun utilizator găsit" message="Încearcă o altă căutare." icon="person-search" />
            ) : (
                <View className="gap-2.5">
                    {filteredUsers.map((item) => {
                        const rv = roleVisual(item.role);
                        return (
                            <Link key={item.id} href={`/admin/users/${item.id}`} asChild>
                                <Pressable
                                    className="flex-row items-center gap-3.5 rounded-[16px] border p-3.5 md:p-4 transition-colors"
                                    style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
                                >
                                    <View
                                        className="w-11 h-11 rounded-[13px] items-center justify-center flex-none"
                                        style={{ backgroundColor: rv.tint }}
                                    >
                                        <Text className="text-[14px] font-black" style={{ color: rv.fg }}>{initialsOf(item.name)}</Text>
                                    </View>
                                    <View className="flex-1 min-w-0">
                                        <Text
                                            className={isMobile ? 'text-[14px] font-bold' : 'text-[14.5px] font-bold'}
                                            style={{ color: 'var(--c-ink-strong)' }}
                                            numberOfLines={1}
                                        >
                                            {item.name}
                                        </Text>
                                        <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                            {item.email}
                                        </Text>
                                    </View>
                                    <View className="rounded-full px-2.5 py-1 flex-none" style={{ backgroundColor: rv.tint }}>
                                        <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: rv.fg }}>
                                            {item.role}
                                        </Text>
                                    </View>
                                    <MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" />
                                </Pressable>
                            </Link>
                        );
                    })}
                </View>
            )}
        </View>
    );
}
