import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../components/ui/GlassCard';
import AdminActionButton from '../../components/admin/AdminActionButton';
import AdminHero, { AdminMetricCard } from '../../components/admin/AdminHero';
import InviteLinkGenerator from '../../components/manage-access/InviteLinkGenerator';
import PendingAccessRequestList from '../../components/manage-access/PendingAccessRequestList';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { useManageAccess } from '../../hooks/useManageAccess';

export default function ManageAccessScreen() {
    const router = useRouter();
    const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
    const [customMinutes, setCustomMinutes] = useState('');
    const {
        isAdmin,
        hasResolvedSession,
        requests,
        pendingCount,
        requestsLoading,
        requestsError,
        inviteLink,
        inviteLoading,
        inviteError,
        regenerating,
        selectedRole,
        refreshIntervalMinutes,
        requestAction,
        setSelectedRole,
        setRefreshIntervalMinutes,
        loadRequests,
        loadInviteLink,
        approveRequest,
        denyRequest,
        regenerateInviteLink,
        authError,
    } = useManageAccess();

    useEffect(() => {
        setSearchPlaceholder('Search access requests by name, email, or role...');
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
        if (refreshIntervalMinutes > 0) {
            setCustomMinutes(String(refreshIntervalMinutes));
        }
    }, [refreshIntervalMinutes]);

    const filteredRequests = useMemo(() => {
        const query = searchValue.trim().toLowerCase();

        if (!query) {
            return requests;
        }

        return requests.filter((request) => {
            return [
                request.userName,
                request.userEmail,
                request.requestedRole,
                request.status,
            ].some((value) => value.toLowerCase().includes(query));
        });
    }, [requests, searchValue]);

    const displayedPendingCount = useMemo(
        () => filteredRequests.filter((request) => request.status === 'pending').length,
        [filteredRequests]
    );

    const handleGenerateInviteLink = () => {
        const parsedMinutes = Number(customMinutes);
        const nextMinutes = Number.isFinite(parsedMinutes) && parsedMinutes > 0
            ? parsedMinutes
            : refreshIntervalMinutes;

        setRefreshIntervalMinutes(nextMinutes);
        void regenerateInviteLink(selectedRole, nextMinutes);
    };

    const handleRoleChange = (role: typeof selectedRole) => {
        setSelectedRole(role);
        void loadInviteLink(role);
    };

    if (!hasResolvedSession) {
        return (
            <View className="flex-1 items-center justify-center bg-[#F1F5F9]">
                <ActivityIndicator size="large" color="#1D4ED8" />
                <Text className="text-slate-500 mt-4">Checking your club permissions…</Text>
            </View>
        );
    }

    if (!isAdmin) {
        return (
            <View className="flex-1 bg-[#F1F5F9] px-4 md:px-12 pt-10 pb-20">
                <GlassCard className="items-center py-12">
                    <MaterialIcons name="lock-outline" size={40} color="#DC2626" />
                    <Text className="text-slate-900 text-xl font-black mt-4">Admin access required</Text>
                    <Text className="text-slate-500 text-center mt-2 max-w-[520px]">
                        {authError ?? 'Only club admins can review requests and generate invite links for this page.'}
                    </Text>
                </GlassCard>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#EDF4FB]">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingTop: 40, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full px-4 lg:px-10">
                    <AdminHero
                        title="Manage Access"
                        subtitle="Approve club access requests and generate role-based registration links."
                        className="lg:flex-row lg:items-end lg:justify-between"
                    >
                        <View className="mt-5 lg:mt-0 flex-row gap-3">
                            <AdminMetricCard label="Pending" value={pendingCount} />
                            <AdminMetricCard label="Showing" value={filteredRequests.length} />
                        </View>
                    </AdminHero>

                    <View className="gap-6">
                        <View className="flex-row flex-wrap gap-3">
                            <AdminActionButton
                                label="Manage Accounts"
                                icon="groups"
                                onPress={() => router.push('/admin/manage-accounts')}
                            />
                            <AdminActionButton
                                label="Create Account"
                                icon="person-add-alt-1"
                                onPress={() => router.push('/admin/create-account')}
                                variant="primary"
                            />
                        </View>

                        <View className="flex-col lg:flex-row lg:items-start gap-6">
                            <View className="w-full lg:flex-[1.15]">
                                <InviteLinkGenerator
                                    inviteLink={inviteLink}
                                    loading={inviteLoading}
                                    regenerating={regenerating}
                                    error={inviteError}
                                    selectedRole={selectedRole}
                                    refreshIntervalMinutes={refreshIntervalMinutes}
                                    customMinutes={customMinutes}
                                    onRoleChange={handleRoleChange}
                                    onRefreshIntervalChange={setRefreshIntervalMinutes}
                                    onCustomMinutesChange={setCustomMinutes}
                                    onGenerate={handleGenerateInviteLink}
                                />
                            </View>

                            <View className="w-full lg:flex-1">
                                <View className="flex-row items-center justify-between mb-4">
                                    <View className="flex-1 pr-4">
                                        <Text className="text-xl font-black text-slate-900">Access Requests</Text>
                                        <Text className="text-slate-500 mt-1">
                                            {searchValue.trim()
                                                ? `${displayedPendingCount} pending request${displayedPendingCount === 1 ? '' : 's'} match your search.`
                                                : 'Review and approve incoming registrations for your club.'}
                                        </Text>
                                    </View>

                                    <AdminActionButton
                                        label="Refresh"
                                        icon="refresh"
                                        onPress={() => void loadRequests()}
                                    />
                                </View>

                                <PendingAccessRequestList
                                    items={filteredRequests}
                                    loading={requestsLoading}
                                    error={requestsError}
                                    actionState={requestAction}
                                    onApprove={approveRequest}
                                    onDeny={denyRequest}
                                    onRetry={() => void loadRequests()}
                                />
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
