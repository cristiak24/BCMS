import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import PageHeader from '../../components/ui/PageHeader';
import FilterChips from '../../components/ui/FilterChips';
import InviteLinkGenerator from '../../components/manage-access/InviteLinkGenerator';
import InviteCodesPanel from '../../components/manage-access/InviteCodesPanel';
import PendingAccessRequestList from '../../components/manage-access/PendingAccessRequestList';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ToastHost, useToasts } from '../../components/ui/Toast';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { useManageAccess } from '../../hooks/useManageAccess';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ROLE_LABELS } from '../../components/manage-access/RoleSelector';
import type { AccessRequestItem, AccessRequestStatus } from '../../types/manageAccess';

const STATUS_FILTERS: { key: AccessRequestStatus | 'all'; label: string }[] = [
    { key: 'pending', label: 'În așteptare' },
    { key: 'approved', label: 'Aprobate' },
    { key: 'denied', label: 'Respinse' },
    { key: 'all', label: 'Toate' },
];

type AccessTab = 'requests' | 'link' | 'codes';

const TABS: { key: AccessTab; label: string; icon: string; blurb?: string }[] = [
    { key: 'requests', label: 'Cereri', icon: 'how-to-reg' },
    { key: 'link', label: 'Link', icon: 'link', blurb: 'Un link de înscriere pentru un singur rol, valabil o perioadă scurtă.' },
    { key: 'codes', label: 'Coduri', icon: 'confirmation-number', blurb: 'Un cod scurt pentru un grup. Se introduce la „Creează cont” și intră direct în club.' },
];

const TAB_STORAGE_KEY = 'bcms.access-tab';

function readStoredTab(): AccessTab {
    try {
        const stored = localStorage.getItem(TAB_STORAGE_KEY);
        if (stored === 'requests' || stored === 'link' || stored === 'codes') return stored;
    } catch {
        // storage blocked — fall back to the default tab
    }
    return 'requests';
}

/**
 * The page used to stack everything at once — link generator, code generator
 * (each with its own three big role cards), then the request list — so on a
 * phone the requests that actually need action sat ~2,000px down. Now it is
 * three tabs, one job each, with the pending count on the "Cereri" tab.
 */

export default function ManageAccessScreen() {
    const router = useRouter();
    const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
    const { toasts, showToast, dismissToast } = useToasts();
    const [tab, setTabState] = useState<AccessTab>(readStoredTab);
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
        setSearchPlaceholder('Caută cereri după nume, email sau rol…');
        setHeaderActions(null);
        setMobileFab(null);
        return () => {
            setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
            setSearchValue('');
            setHeaderActions(null);
            setMobileFab(null);
        };
    }, [setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

    const setTab = (next: AccessTab) => {
        setTabState(next);
        try {
            localStorage.setItem(TAB_STORAGE_KEY, next);
        } catch {
            // non-essential
        }
    };

    // The header search only filters requests — typing on another tab jumps there.
    useEffect(() => {
        if (debouncedSearch.trim()) {
            setTabState('requests');
        }
    }, [debouncedSearch]);

    const filteredRequests = useMemo(() => {
        const query = debouncedSearch.trim().toLowerCase();

        return requests.filter((request) => {
            const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
            const matchesSearch = !query || [
                request.userName,
                request.userEmail,
                request.requestedRole,
                ROLE_LABELS[request.requestedRole] ?? '',
                request.status,
            ].some((value) => value.toLowerCase().includes(query));

            return matchesStatus && matchesSearch;
        });
    }, [requests, statusFilter, debouncedSearch]);

    const statusCounts = useMemo(() => ({
        pending: requests.filter((request) => request.status === 'pending').length,
        approved: requests.filter((request) => request.status === 'approved').length,
        denied: requests.filter((request) => request.status === 'denied').length,
        all: requests.length,
    }), [requests]);

    const handleGenerateInviteLink = (minutes: number) => {
        void regenerateInviteLink(selectedRole, minutes).then((ok) => {
            if (ok) {
                showToast({ variant: 'success', message: `Link nou pentru ${ROLE_LABELS[selectedRole].toLowerCase()} generat.` });
            }
        });
    };

    const handleApprove = (id: number) => {
        const request = requests.find((item) => item.id === id);
        void approveRequest(id).then((ok) => {
            showToast(ok
                ? { variant: 'success', message: request ? `${request.userName} a fost aprobat.` : 'Cerere aprobată.' }
                : { variant: 'error', message: 'Nu am putut aproba cererea.' });
        });
    };

    const handleDeny = (id: number) => {
        const request = requests.find((item) => item.id === id);
        void denyRequest(id).then((ok) => {
            showToast(ok
                ? { variant: 'success', message: request ? `Cererea lui ${request.userName} a fost respinsă.` : 'Cerere respinsă.' }
                : { variant: 'error', message: 'Nu am putut respinge cererea.' });
        });
    };

    if (!hasResolvedSession) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'var(--c-bg)' }}>
                <ActivityIndicator size="large" color="var(--c-brand-fg)" />
                <Text className="t-meta mt-4" style={{ color: 'var(--c-muted)' }}>Se verifică permisiunile…</Text>
            </View>
        );
    }

    if (!isAdmin) {
        return (
            <View className="flex-1 px-4 md:px-12 pt-10 pb-20" style={{ backgroundColor: 'var(--c-bg)' }}>
                <View className="items-center py-12 rounded-[16px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                    <MaterialIcons name="lock-outline" size={36} color="var(--c-danger-fg)" />
                    <Text className="text-[18px] font-bold mt-3" style={{ color: 'var(--c-ink)' }}>Acces doar pentru administratori</Text>
                    <Text className="t-meta text-center mt-2 max-w-[520px] px-4" style={{ color: 'var(--c-muted)' }}>
                        {authError ?? 'Doar administratorii clubului pot aproba cereri și genera invitații.'}
                    </Text>
                </View>
            </View>
        );
    }

    const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

    return (
        <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingTop: 16, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[880px] px-4 lg:px-6">
                    <PageHeader
                        title="Acces & invitații"
                        subtitle="Invită membri noi și aprobă cererile de înscriere."
                        actions={(
                            <>
                                <HeaderButton icon="groups" label="Conturi" onPress={() => router.push('/admin/manage-accounts')} />
                                <HeaderButton icon="person-add-alt-1" label="Cont nou" primary onPress={() => router.push('/admin/create-account')} />
                            </>
                        )}
                    />

                    <View
                        className="flex-row p-[3px] rounded-[12px] mb-2 sm:self-start"
                        style={{ backgroundColor: 'var(--c-surface-3)' }}
                        accessibilityRole={'tablist' as any}
                    >
                        {TABS.map((item) => {
                            const active = item.key === tab;
                            const badge = item.key === 'requests' ? pendingCount : 0;
                            return (
                                <Pressable
                                    key={item.key}
                                    onPress={() => setTab(item.key)}
                                    accessibilityRole={'tab' as any}
                                    accessibilityState={{ selected: active }}
                                    className="flex-1 sm:flex-none min-w-0 h-10 sm:px-5 rounded-[9px] flex-row items-center justify-center gap-1.5"
                                    style={active ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
                                >
                                    <MaterialIcons name={item.icon} size={16} color={active ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
                                    <Text className="text-[13.5px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>
                                        {item.label}
                                    </Text>
                                    {badge > 0 ? (
                                        <View className="min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-danger)' }}>
                                            <Text className="text-[10.5px] font-bold t-num" style={{ color: '#FFFFFF' }}>{badge > 99 ? '99+' : badge}</Text>
                                        </View>
                                    ) : null}
                                </Pressable>
                            );
                        })}
                    </View>

                    {activeTab.blurb ? (
                        <Text className="t-meta mb-3 px-0.5" style={{ color: 'var(--c-muted)' }}>{activeTab.blurb}</Text>
                    ) : null}

                    <View key={tab} className="ui-rise mt-2">
                        {tab === 'requests' ? (
                            <View className="gap-3">
                                <View className="flex-row items-center gap-2">
                                    <View className="flex-1 min-w-0">
                                        <FilterChips
                                            label="Status cerere"
                                            options={STATUS_FILTERS.map((item) => ({ ...item, count: statusCounts[item.key] }))}
                                            value={statusFilter}
                                            onChange={setStatusFilter}
                                        />
                                    </View>
                                    <Pressable
                                        onPress={() => void loadRequests()}
                                        accessibilityRole="button"
                                        accessibilityLabel="Reîncarcă cererile"
                                        className="ui-press w-8 h-8 rounded-[9px] border items-center justify-center shrink-0"
                                        style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
                                    >
                                        <MaterialIcons name="refresh" size={17} color="var(--c-muted)" />
                                    </Pressable>
                                </View>

                                <PendingAccessRequestList
                                    items={filteredRequests}
                                    filter={statusFilter}
                                    searching={Boolean(debouncedSearch.trim())}
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
                        ) : tab === 'link' ? (
                            <InviteLinkGenerator
                                inviteLink={inviteLink}
                                loading={inviteLoading}
                                regenerating={regenerating}
                                error={inviteError}
                                selectedRole={selectedRole}
                                refreshIntervalMinutes={refreshIntervalMinutes}
                                onRoleChange={setSelectedRole}
                                onRefreshIntervalChange={setRefreshIntervalMinutes}
                                onGenerate={handleGenerateInviteLink}
                                onCopied={() => showToast({ variant: 'success', message: 'Link copiat.' })}
                                onInvalidMinutes={(message) => showToast({ variant: 'error', message })}
                            />
                        ) : (
                            <InviteCodesPanel onNotify={showToast} />
                        )}
                    </View>
                </View>
            </ScrollView>

            <ConfirmDialog
                visible={pendingDeny != null}
                destructive
                title={pendingDeny ? `Respingi cererea lui ${pendingDeny.userName}?` : ''}
                message="Cererea va fi respinsă, dar contul rămâne neschimbat (nu este dezactivat). Poți aproba o cerere viitoare oricând."
                confirmLabel="Respinge"
                cancelLabel="Anulează"
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

/** Header action: icon-only on phones (the title needs the row), labelled from sm. */
function HeaderButton({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="ui-press h-10 w-10 sm:w-auto sm:px-3.5 rounded-[10px] border flex-row items-center justify-center gap-1.5"
            style={primary
                ? { backgroundColor: 'var(--c-brand-surface)', borderColor: 'transparent' } as any
                : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
        >
            <MaterialIcons name={icon} size={18} color={primary ? 'var(--c-on-brand)' : 'var(--c-ink-soft)'} />
            <Text className="hidden sm:flex text-[13px] font-bold" style={{ color: primary ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                {label}
            </Text>
        </Pressable>
    );
}
