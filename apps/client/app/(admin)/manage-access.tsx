import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../components/ui/GlassCard';
import AdminActionButton from '../../components/admin/AdminActionButton';
import AdminHero, { AdminMetricCard } from '../../components/admin/AdminHero';
import InviteLinkGenerator from '../../components/manage-access/InviteLinkGenerator';
import PendingAccessRequestList from '../../components/manage-access/PendingAccessRequestList';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ToastHost, useToasts } from '../../components/ui/Toast';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { useManageAccess } from '../../hooks/useManageAccess';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AccessRequestItem, AccessRequestStatus } from '../../types/manageAccess';

const STATUS_FILTERS: { key: AccessRequestStatus | 'all'; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'denied', label: 'Denied' },
    { key: 'all', label: 'All' },
];

export default function ManageAccessScreen() {
    const router = useRouter();
    const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
    const { toasts, showToast, dismissToast } = useToasts();
    const [customMinutes, setCustomMinutes] = useState('');
    const [pendingDeny, setPendingDeny] = useState<AccessRequestItem | null>(null);
    // Default to "pending" so the list stays focused on what needs action — resolved
    // requests are still reachable via the Approved/Denied/All tabs but no longer
    // grow the working list unbounded.
    const [statusFilter, setStatusFilter] = useState<AccessRequestStatus | 'all'>('pending');
    const debouncedSearch = useDebouncedValue(searchValue, 200);
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
        const query = debouncedSearch.trim().toLowerCase();

        return requests.filter((request) => {
            const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
            const matchesSearch = !query || [
                request.userName,
                request.userEmail,
                request.requestedRole,
                request.status,
            ].some((value) => value.toLowerCase().includes(query));

            return matchesStatus && matchesSearch;
        });
    }, [requests, statusFilter, debouncedSearch]);

    const displayedPendingCount = useMemo(
        () => filteredRequests.filter((request) => request.status === 'pending').length,
        [filteredRequests]
    );

    const statusCounts = useMemo(() => ({
        pending: requests.filter((request) => request.status === 'pending').length,
        approved: requests.filter((request) => request.status === 'approved').length,
        denied: requests.filter((request) => request.status === 'denied').length,
        all: requests.length,
    }), [requests]);

    const handleGenerateInviteLink = () => {
        const parsedMinutes = Number(customMinutes);
        const nextMinutes = Number.isFinite(parsedMinutes) && parsedMinutes > 0
            ? parsedMinutes
            : refreshIntervalMinutes;

        setRefreshIntervalMinutes(nextMinutes);
        void regenerateInviteLink(selectedRole, nextMinutes).then((ok) => {
            if (ok) {
                showToast({ variant: 'success', message: `New ${selectedRole} invite link generated.` });
            }
        });
    };

    const handleApprove = (id: number) => {
        const request = requests.find((item) => item.id === id);
        void approveRequest(id).then((ok) => {
            showToast(ok
                ? { variant: 'success', message: request ? `${request.userName} was approved.` : 'Request approved.' }
                : { variant: 'error', message: 'Could not approve the request.' });
        });
    };

    const handleDeny = (id: number) => {
        const request = requests.find((item) => item.id === id);
        void denyRequest(id).then((ok) => {
            showToast(ok
                ? { variant: 'success', message: request ? `${request.userName}'s request was denied.` : 'Request denied.' }
                : { variant: 'error', message: 'Could not deny the request.' });
        });
    };

    const handleRoleChange = (role: typeof selectedRole) => {
        // The invite-link fetch is driven by the selectedRole effect in
        // useManageAccess, so we only need to update the selection here.
        setSelectedRole(role);
    };

    if (!hasResolvedSession) {
        return (
            <View className="flex-1 items-center justify-center bg-[#F1F5F9]">
                <ActivityIndicator size="large" color="var(--c-blue-deep)" />
                <Text className="text-slate-500 mt-4">Checking your club permissions…</Text>
            </View>
        );
    }

    if (!isAdmin) {
        return (
            <View className="flex-1 bg-[#F1F5F9] px-4 md:px-12 pt-10 pb-20">
                <GlassCard className="items-center py-12">
                    <MaterialIcons name="lock-outline" size={40} color="var(--c-danger)" />
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
                        <View className="mt-5 lg:mt-0 flex-row flex-wrap gap-3">
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

                                <View className="flex-row flex-wrap gap-2 mb-4">
                                    {STATUS_FILTERS.map((item) => {
                                        const active = statusFilter === item.key;
                                        return (
                                            <Pressable
                                                key={item.key}
                                                onPress={() => setStatusFilter(item.key)}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected: active }}
                                                className={`px-4 py-2 min-h-[40px] flex-row items-center gap-2 rounded-full border ${active ? 'bg-[#123A97] border-[#123A97]' : 'bg-white border-slate-200 hover:border-blue-200'}`}
                                            >
                                                <Text className={`font-bold text-[12px] ${active ? 'text-white' : 'text-[#56627F]'}`}>
                                                    {item.label}
                                                </Text>
                                                <View className={`rounded-full px-2 py-0.5 ${active ? 'bg-white/20' : 'bg-slate-100'}`}>
                                                    <Text className={`text-[11px] font-bold ${active ? 'text-white' : 'text-[#56627F]'}`}>
                                                        {statusCounts[item.key]}
                                                    </Text>
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <PendingAccessRequestList
                                    items={filteredRequests}
                                    loading={requestsLoading}
                                    error={requestsError}
                                    actionState={requestAction}
                                    onApprove={handleApprove}
                                    onDeny={(id) => {
                                        const request = filteredRequests.find((item) => item.id === id);
                                        if (request) {
                                            setPendingDeny(request);
                                        }
                                    }}
                                    onRetry={() => void loadRequests()}
                                />
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>

            <ConfirmDialog
                visible={pendingDeny != null}
                destructive
                title={pendingDeny ? `Deny ${pendingDeny.userName}?` : ''}
                message="This request will be rejected, but their account stays as-is (it is not disabled). You can approve a future request from them at any time."
                confirmLabel="Deny request"
                onConfirm={() => {
                    if (pendingDeny) {
                        handleDeny(pendingDeny.id);
                    }
                    setPendingDeny(null);
                }}
                onCancel={() => setPendingDeny(null)}
            />

            <ToastHost toasts={toasts} onDismiss={dismissToast} />
        </View>
    );
}
