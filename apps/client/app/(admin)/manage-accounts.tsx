import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../components/ui/GlassCard';
import AdminActionButton from '../../components/admin/AdminActionButton';
import AdminHero, { AdminMetricCard } from '../../components/admin/AdminHero';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { clubAdminApi, type ClubAdminAccount, type ClubAdminAccountRole } from '../../services/clubAdminApi';
import { useResponsive } from '../../hooks/useResponsive';

const FILTERS = ['all', 'coach', 'player', 'invite', 'inactive'] as const;

export default function ManageAccountsScreen() {
    const router = useRouter();
    const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
    const { isMobile } = useResponsive();
    const [accounts, setAccounts] = useState<ClubAdminAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
    const [busyId, setBusyId] = useState<string | number | null>(null);

    const loadAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const response = await clubAdminApi.listAccounts();
            setAccounts(response.users);
        } catch (error) {
            Alert.alert('Manage Accounts', error instanceof Error ? error.message : 'Could not load club accounts.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setSearchPlaceholder('Search accounts by name, email, or role...');
        setHeaderActions(null);
        setMobileFab(null);
        return () => {
            setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
            setSearchValue('');
            setHeaderActions(null);
            setMobileFab(null);
        };
    }, [setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

    useEffect(() => {
        void loadAccounts();
    }, [loadAccounts]);

    const filteredAccounts = useMemo(() => {
        const query = searchValue.trim().toLowerCase();

        return accounts.filter((account) => {
            const matchesFilter = filter === 'all'
                ? true
                : filter === 'invite'
                    ? account.source === 'invite'
                    : filter === 'inactive'
                        ? account.status === 'inactive'
                        : account.role === filter;

            const matchesSearch = !query || [
                account.name,
                account.email,
                account.role,
                account.status,
                account.clubName ?? '',
            ].some((value) => value.toLowerCase().includes(query));

            return matchesFilter && matchesSearch;
        });
    }, [accounts, filter, searchValue]);

    const counts = useMemo(() => ({
        total: accounts.length,
        invites: accounts.filter((item) => item.source === 'invite').length,
        active: accounts.filter((item) => item.source === 'user' && item.status === 'active').length,
    }), [accounts]);

    const updateRole = async (accountId: number, role: ClubAdminAccountRole) => {
        try {
            setBusyId(accountId);
            await clubAdminApi.updateUserRole(accountId, role);
            await loadAccounts();
        } catch (error) {
            Alert.alert('Update role', error instanceof Error ? error.message : 'Could not update the user role.');
        } finally {
            setBusyId(null);
        }
    };

    const deactivate = async (accountId: string | number) => {
        try {
            setBusyId(accountId);
            await clubAdminApi.deactivateAccount(accountId);
            await loadAccounts();
        } catch (error) {
            Alert.alert('Update account', error instanceof Error ? error.message : 'Could not update this account.');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-[#F1F5F9]">
                <ActivityIndicator size="large" color="#173AA8" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#EDF4FB]">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{
                    paddingHorizontal: isMobile ? 16 : 32,
                    paddingTop: isMobile ? 24 : 40,
                    paddingBottom: 120,
                }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full">
                    <AdminHero
                        title="Manage Accounts"
                        subtitle="Search, invite, and manage only the accounts that belong to your club."
                        className="md:flex-row md:items-end md:justify-between"
                    >
                        <View className="mt-5 md:mt-0 flex-row gap-3">
                            <AdminMetricCard label="Accounts" value={counts.total} />
                            <AdminMetricCard label="Pending Invites" value={counts.invites} />
                            <AdminMetricCard label="Active" value={counts.active} />
                        </View>
                    </AdminHero>

                    <View className="mb-6 flex-row flex-wrap gap-3">
                        <AdminActionButton
                            label="Manage Access"
                            icon="verified-user"
                            onPress={() => router.push('/admin/manage-access')}
                        />
                        <AdminActionButton
                            label="Create Account"
                            icon="person-add-alt-1"
                            onPress={() => router.push('/admin/create-account')}
                            variant="primary"
                        />
                        <AdminActionButton
                            label="Refresh"
                            icon="refresh"
                            onPress={() => void loadAccounts()}
                        />
                    </View>

                    <GlassCard className="mb-6">
                        <Text className="text-[#102A72] text-[18px] font-black">Filters</Text>
                        <View className="mt-4 flex-row flex-wrap gap-2">
                            {FILTERS.map((item) => {
                                const active = filter === item;
                                return (
                                    <Pressable
                                        key={item}
                                        onPress={() => setFilter(item)}
                                    className={`px-4 py-3 rounded-full border ${active ? 'bg-[#123A97] border-[#123A97]' : 'bg-[#F7F9FF] border-[#E4EAF7]'}`}
                                    >
                                        <Text className={`font-bold text-[12px] capitalize ${active ? 'text-white' : 'text-[#56627F]'}`}>
                                            {item === 'all' ? 'All' : item}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </GlassCard>

                    <View className="gap-4">
                        {filteredAccounts.length === 0 ? (
                            <GlassCard className="items-center py-12">
                                <MaterialIcons name="group-off" size={42} color="#64748B" />
                                <Text className="text-slate-900 font-bold text-lg mt-3">No accounts found</Text>
                                <Text className="text-slate-500 text-center mt-2">
                                    Try another search or create a new invite for your club.
                                </Text>
                            </GlassCard>
                        ) : filteredAccounts.map((account) => {
                            const isBusy = busyId === account.id;
                            const isInvite = account.source === 'invite';
                            const isInactive = account.status === 'inactive';
                            const canPromoteToCoach = !isInvite && account.role !== 'coach' && account.status === 'active';
                            const canSwitchToPlayer = !isInvite && account.role !== 'player' && account.status === 'active';

                            return (
                                <GlassCard key={`${account.source}-${account.id}`} className="p-5">
                                    <View className="md:flex-row md:items-start md:justify-between gap-4">
                                        <View className="flex-1">
                                            <View className="flex-row flex-wrap items-center gap-2">
                                                <Text className="text-lg font-black text-slate-900">{account.name}</Text>
                                                <View className={`rounded-full px-3 py-1 ${isInvite ? 'bg-amber-100' : isInactive ? 'bg-rose-100' : 'bg-emerald-100'}`}>
                                                    <Text className={`text-xs font-bold uppercase ${isInvite ? 'text-amber-700' : isInactive ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                        {isInvite ? 'pending invite' : account.status}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text className="text-slate-500 mt-1">{account.email}</Text>
                                            <Text className="text-slate-500 mt-2 capitalize">
                                                {account.clubName ?? 'Club account'} • {account.role}
                                            </Text>
                                        </View>

                                        <View className="md:items-end">
                                            <Text className="text-xs uppercase tracking-wide text-slate-500">
                                                Created {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'recently'}
                                            </Text>
                                            {account.lastLoginAt ? (
                                                <Text className="text-xs text-slate-500 mt-1">
                                                    Last login {new Date(account.lastLoginAt).toLocaleDateString()}
                                                </Text>
                                            ) : null}
                                        </View>
                                    </View>

                                    <View className="mt-4 flex-row flex-wrap gap-3">
                                        {canPromoteToCoach ? (
                                            <Pressable
                                                onPress={() => void updateRole(Number(account.id), 'coach')}
                                                disabled={isBusy}
                                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                                            >
                                                <Text className="font-bold text-slate-700">
                                                    {isBusy ? 'Updating...' : 'Set as Coach'}
                                                </Text>
                                            </Pressable>
                                        ) : null}

                                        {canSwitchToPlayer ? (
                                            <Pressable
                                                onPress={() => void updateRole(Number(account.id), 'player')}
                                                disabled={isBusy}
                                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                                            >
                                                <Text className="font-bold text-slate-700">
                                                    {isBusy ? 'Updating...' : 'Set as Player'}
                                                </Text>
                                            </Pressable>
                                        ) : null}

                                        {!isInactive ? (
                                            <Pressable
                                                onPress={() => void deactivate(account.id)}
                                                disabled={isBusy}
                                                className={`rounded-2xl px-4 py-3 ${isInvite ? 'bg-amber-50' : 'bg-rose-50'}`}
                                            >
                                                <Text className={`font-bold ${isInvite ? 'text-amber-700' : 'text-rose-700'}`}>
                                                    {isBusy ? 'Working...' : isInvite ? 'Cancel Invite' : 'Deactivate'}
                                                </Text>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                </GlassCard>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
