import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../components/ui/GlassCard';
import AdminActionButton from '../../components/admin/AdminActionButton';
import AdminHero, { AdminMetricCard } from '../../components/admin/AdminHero';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { SkeletonList } from '../../components/ui/Skeleton';
import { ToastHost, useToasts } from '../../components/ui/Toast';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { clubAdminApi, type ClubAdminAccount, type ClubAdminAccountRole } from '../../services/clubAdminApi';
import { useResponsive } from '../../hooks/useResponsive';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const FILTERS = ['all', 'coach', 'player', 'parent', 'invite', 'inactive'] as const;

const PRIVILEGED_ROLES = new Set(['admin', 'superadmin']);

const SORT_OPTIONS = [
    { key: 'created', label: 'Created' },
    { key: 'lastLogin', label: 'Last login' },
    { key: 'name', label: 'Name' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['key'];

type BulkKind = 'deactivate' | 'reactivate' | ClubAdminAccountRole;

type PendingAction =
    | { kind: 'deactivate'; account: ClubAdminAccount }
    | { kind: 'reactivate'; account: ClubAdminAccount }
    | { kind: 'resend'; account: ClubAdminAccount }
    | { kind: 'role'; account: ClubAdminAccount; role: ClubAdminAccountRole }
    | { kind: 'bulk'; action: BulkKind; ids: (string | number)[] };

// A member account (not an invite, not an admin) that can be bulk-managed.
function isManageableMember(account: ClubAdminAccount) {
    return account.source !== 'invite' && !PRIVILEGED_ROLES.has(account.role);
}

const PAGE_SIZE = 8;

// Role-tinted avatar palette so the list scans by colour instead of reading as a
// wall of identical white cards.
const ROLE_VISUAL: Record<string, { tint: string; fg: string }> = {
    coach: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)' },
    player: { tint: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
    parent: { tint: 'var(--c-surface-tint)', fg: '#6D28D9' },
    admin: { tint: 'var(--c-surface-tint)', fg: '#4338CA' },
    superadmin: { tint: 'var(--c-surface-tint)', fg: '#4338CA' },
    accountant: { tint: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
    staff: { tint: 'var(--c-surface-3)', fg: 'var(--c-muted)' },
};

function roleVisual(role: string) {
    return ROLE_VISUAL[role] ?? { tint: 'var(--c-surface-3)', fg: 'var(--c-muted)' };
}

function initialsOf(name: string, email: string) {
    const base = (name && name.trim()) || email || '?';
    const parts = base.split(/\s+/).filter(Boolean);
    const letters = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : base.slice(0, 2);
    return letters.toUpperCase();
}

type StatusVisual = { dot: string; bg: string; fg: string; label: string };
function statusVisual(account: ClubAdminAccount): StatusVisual {
    if (account.source === 'invite') {
        return { dot: 'var(--c-warning)', bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)', label: 'Pending invite' };
    }
    if (account.status === 'inactive') {
        return { dot: '#E11D48', bg: 'var(--c-danger-bg)', fg: 'var(--c-danger)', label: 'Inactive' };
    }
    if (account.status === 'pending_registration') {
        return { dot: '#0EA5E9', bg: 'var(--c-surface-tint)', fg: '#0369A1', label: 'Pending registration' };
    }
    return { dot: 'var(--c-success)', bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', label: 'Active' };
}

function formatDate(value?: string | null) {
    return value ? new Date(value).toLocaleDateString() : null;
}

// Compact page list: all pages when few, otherwise first/last + a window around
// the current page with 'gap' markers for the ellipses.
function pageWindow(current: number, total: number): (number | 'gap')[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }
    const wanted = new Set<number>([1, total, current, current - 1, current + 1]);
    const sorted = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    const result: (number | 'gap')[] = [];
    let previous = 0;
    for (const page of sorted) {
        if (page - previous > 1) {
            result.push('gap');
        }
        result.push(page);
        previous = page;
    }
    return result;
}

// Pill styling for the per-row action buttons, keyed by intent.
const ACTION_STYLE = {
    coach: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)' },
    player: { tint: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
    parent: { tint: 'var(--c-surface-tint)', fg: '#6D28D9' },
    resend: { tint: 'var(--c-surface-tint)', fg: 'var(--c-blue-deep)' },
    reactivate: { tint: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
    deactivate: { tint: 'var(--c-danger-bg)', fg: 'var(--c-danger)' },
    cancel: { tint: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
} as const;

const ROLE_ACTIONS = [
    { role: 'coach', icon: 'sports', label: 'Set coach' },
    { role: 'player', icon: 'sports-basketball', label: 'Set player' },
    { role: 'parent', icon: 'family-restroom', label: 'Set parent' },
] as const;

export default function ManageAccountsScreen() {
    const router = useRouter();
    const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
    const { isMobile } = useResponsive();
    const { toasts, showToast, dismissToast } = useToasts();
    const debouncedSearch = useDebouncedValue(searchValue, 200);
    const [accounts, setAccounts] = useState<ClubAdminAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
    const [busyId, setBusyId] = useState<string | number | null>(null);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('created');
    const [sortDesc, setSortDesc] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [page, setPage] = useState(1);

    const loadAccounts = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'refresh') {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            const response = await clubAdminApi.listAccounts();
            setAccounts(response.users);
        } catch (error) {
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Could not load club accounts.' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

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
        void loadAccounts('initial');
    }, [loadAccounts]);

    const filteredAccounts = useMemo(() => {
        const query = debouncedSearch.trim().toLowerCase();

        const matched = accounts.filter((account) => {
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

        const compare = (a: ClubAdminAccount, b: ClubAdminAccount) => {
            if (sortKey === 'name') {
                return a.name.localeCompare(b.name);
            }
            // created / lastLogin: missing timestamps sort last (treated as oldest).
            const field = sortKey === 'created' ? a.createdAt : a.lastLoginAt;
            const fieldB = sortKey === 'created' ? b.createdAt : b.lastLoginAt;
            return String(field ?? '').localeCompare(String(fieldB ?? ''));
        };

        return [...matched].sort((a, b) => (sortDesc ? -compare(a, b) : compare(a, b)));
    }, [accounts, filter, debouncedSearch, sortKey, sortDesc]);

    const counts = useMemo(() => ({
        total: accounts.length,
        invites: accounts.filter((item) => item.source === 'invite').length,
        active: accounts.filter((item) => item.source === 'user' && item.status === 'active').length,
    }), [accounts]);

    // Selection only tracks manageable members that are still visible under the
    // current filter/search — so a "select all" never touches hidden rows.
    const selectableAccounts = useMemo(
        () => filteredAccounts.filter(isManageableMember),
        [filteredAccounts]
    );
    const selectedAccounts = useMemo(
        () => accounts.filter((account) => selectedIds.has(account.id) && isManageableMember(account)),
        [accounts, selectedIds]
    );
    const allSelectableSelected = selectableAccounts.length > 0
        && selectableAccounts.every((account) => selectedIds.has(account.id));

    const toggleSelected = useCallback((id: string | number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds((current) => {
            if (selectableAccounts.length > 0 && selectableAccounts.every((account) => current.has(account.id))) {
                return new Set();
            }
            return new Set(selectableAccounts.map((account) => account.id));
        });
    }, [selectableAccounts]);

    const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));

    // Jump back to page 1 whenever the filtered set changes shape (filter, search, sort).
    useEffect(() => {
        setPage(1);
    }, [filter, debouncedSearch, sortKey, sortDesc]);

    // Keep the current page in range as rows come and go (e.g. after a deactivate
    // or an invite being cancelled shrinks the list).
    useEffect(() => {
        setPage((current) => Math.min(current, totalPages));
    }, [totalPages]);

    const pagedAccounts = useMemo(
        () => filteredAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [filteredAccounts, page]
    );
    const rangeStart = filteredAccounts.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(page * PAGE_SIZE, filteredAccounts.length);

    // Optimistic role change: reflect immediately, roll back on failure.
    const performUpdateRole = useCallback(async (account: ClubAdminAccount, role: ClubAdminAccountRole) => {
        const previous = accounts;
        setBusyId(account.id);
        setAccounts((current) => current.map((item) => (
            item.id === account.id ? { ...item, role } : item
        )));
        try {
            await clubAdminApi.updateUserRole(Number(account.id), role);
            showToast({ variant: 'success', message: `${account.name} is now a ${role}.` });
        } catch (error) {
            setAccounts(previous); // rollback
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Could not update the user role.' });
        } finally {
            setBusyId(null);
        }
    }, [accounts, showToast]);

    // Optimistic deactivate / cancel invite.
    const performDeactivate = useCallback(async (account: ClubAdminAccount) => {
        const previous = accounts;
        const isInvite = account.source === 'invite';
        setBusyId(account.id);
        setAccounts((current) => (
            isInvite
                ? current.filter((item) => item.id !== account.id) // revoked invites drop out of the list
                : current.map((item) => (item.id === account.id ? { ...item, status: 'inactive' } : item))
        ));
        try {
            await clubAdminApi.deactivateAccount(account.id);
            showToast({ variant: 'success', message: isInvite ? `Invite for ${account.email} cancelled.` : `${account.name} was deactivated.` });
        } catch (error) {
            setAccounts(previous); // rollback
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Could not update this account.' });
        } finally {
            setBusyId(null);
        }
    }, [accounts, showToast]);

    // Optimistic reactivate: flip back to active, roll back on failure.
    const performReactivate = useCallback(async (account: ClubAdminAccount) => {
        const previous = accounts;
        setBusyId(account.id);
        setAccounts((current) => current.map((item) => (
            item.id === account.id ? { ...item, status: 'active' } : item
        )));
        try {
            await clubAdminApi.reactivateAccount(account.id);
            showToast({ variant: 'success', message: `${account.name} was reactivated.` });
        } catch (error) {
            setAccounts(previous); // rollback
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Could not reactivate this account.' });
        } finally {
            setBusyId(null);
        }
    }, [accounts, showToast]);

    // Resend a pending invitation (mints a fresh link + expiry, re-sends the email).
    const performResend = useCallback(async (account: ClubAdminAccount) => {
        setBusyId(account.id);
        try {
            await clubAdminApi.resendInvitation(account.id);
            showToast({ variant: 'success', message: `Invitation resent to ${account.email}.` });
        } catch (error) {
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Could not resend the invitation.' });
        } finally {
            setBusyId(null);
        }
    }, [showToast]);

    // Bulk apply an action to every selected member it is valid for. Ineligible
    // rows (e.g. deactivating an already-inactive member) are skipped, and the
    // toast reports how many were changed vs skipped.
    const performBulk = useCallback(async (action: BulkKind, ids: (string | number)[]) => {
        const targets = accounts.filter((account) => ids.includes(account.id) && isManageableMember(account));
        const eligible = targets.filter((account) => {
            if (action === 'deactivate') {
                return account.status === 'active';
            }
            if (action === 'reactivate') {
                return account.status === 'inactive';
            }
            return account.status === 'active' && account.role !== action; // role change
        });

        if (eligible.length === 0) {
            showToast({ variant: 'info', message: 'No selected accounts are eligible for that action.' });
            return;
        }

        const previous = accounts;
        setBulkBusy(true);
        // Optimistic update for the whole batch.
        setAccounts((current) => current.map((item) => {
            if (!eligible.some((account) => account.id === item.id)) {
                return item;
            }
            if (action === 'deactivate') {
                return { ...item, status: 'inactive' };
            }
            if (action === 'reactivate') {
                return { ...item, status: 'active' };
            }
            return { ...item, role: action };
        }));

        const results = await Promise.allSettled(eligible.map((account) => {
            if (action === 'deactivate') {
                return clubAdminApi.deactivateAccount(account.id);
            }
            if (action === 'reactivate') {
                return clubAdminApi.reactivateAccount(account.id);
            }
            return clubAdminApi.updateUserRole(Number(account.id), action);
        }));

        const failed = results.filter((result) => result.status === 'rejected').length;
        const succeeded = eligible.length - failed;
        const skipped = targets.length - eligible.length;

        if (failed > 0) {
            // Roll back and re-sync from the server so partial failures don't leave
            // the list in an inconsistent optimistic state.
            setAccounts(previous);
            showToast({ variant: 'error', message: `${failed} of ${eligible.length} account${eligible.length === 1 ? '' : 's'} could not be updated.` });
            void loadAccounts('refresh');
        } else {
            const skippedSuffix = skipped > 0 ? ` (${skipped} skipped)` : '';
            showToast({ variant: 'success', message: `${succeeded} account${succeeded === 1 ? '' : 's'} updated${skippedSuffix}.` });
        }

        setBulkBusy(false);
        clearSelection();
    }, [accounts, showToast, loadAccounts, clearSelection]);

    const confirmPending = useCallback(() => {
        if (!pending) {
            return;
        }
        const action = pending;
        setPending(null);
        if (action.kind === 'role') {
            void performUpdateRole(action.account, action.role);
        } else if (action.kind === 'reactivate') {
            void performReactivate(action.account);
        } else if (action.kind === 'resend') {
            void performResend(action.account);
        } else if (action.kind === 'bulk') {
            void performBulk(action.action, action.ids);
        } else {
            void performDeactivate(action.account);
        }
    }, [pending, performUpdateRole, performDeactivate, performReactivate, performResend, performBulk]);

    const confirmCopy = useMemo(() => {
        if (!pending) {
            return null;
        }
        if (pending.kind === 'role') {
            return {
                title: `Set ${pending.account.name} as ${pending.role}?`,
                message: `Their permissions will change to match the ${pending.role} role immediately.`,
                confirmLabel: `Set as ${pending.role}`,
                destructive: false,
            };
        }
        if (pending.kind === 'reactivate') {
            return {
                title: `Reactivate ${pending.account.name}?`,
                message: 'They will regain access to the club with their previous role.',
                confirmLabel: 'Reactivate',
                destructive: false,
            };
        }
        if (pending.kind === 'resend') {
            return {
                title: `Resend invite to ${pending.account.email}?`,
                message: 'A fresh invitation link will be emailed and any previous link will stop working.',
                confirmLabel: 'Resend invite',
                destructive: false,
            };
        }
        if (pending.kind === 'bulk') {
            const n = pending.ids.length;
            const label = pending.action === 'deactivate'
                ? 'Deactivate'
                : pending.action === 'reactivate'
                    ? 'Reactivate'
                    : `Set as ${pending.action}`;
            return {
                title: `${label} ${n} account${n === 1 ? '' : 's'}?`,
                message: pending.action === 'deactivate'
                    ? 'Selected active members will lose access until reactivated. Others are skipped.'
                    : pending.action === 'reactivate'
                        ? 'Selected deactivated members will regain access. Others are skipped.'
                        : `Selected active members will be set to ${pending.action}. Others are skipped.`,
                confirmLabel: label,
                destructive: pending.action === 'deactivate',
            };
        }
        const isInvite = pending.account.source === 'invite';
        return isInvite
            ? {
                title: 'Cancel this invite?',
                message: `The invitation for ${pending.account.email} will be revoked and the link will stop working.`,
                confirmLabel: 'Cancel invite',
                destructive: true,
            }
            : {
                title: `Deactivate ${pending.account.name}?`,
                message: 'They will lose access to the club until an admin reactivates the account.',
                confirmLabel: 'Deactivate',
                destructive: true,
            };
    }, [pending]);

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
                        <View className="mt-5 md:mt-0 flex-row flex-wrap gap-3">
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
                            label={refreshing ? 'Refreshing…' : 'Refresh'}
                            icon="refresh"
                            disabled={refreshing || loading}
                            onPress={() => void loadAccounts('refresh')}
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
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        className={`px-4 py-3 min-h-[44px] items-center justify-center rounded-full border ${active ? 'bg-[#123A97] border-[#123A97]' : 'bg-[#F7F9FF] border-[#E4EAF7] hover:border-blue-200'}`}
                                    >
                                        <Text className={`font-bold text-[12px] capitalize ${active ? 'text-white' : 'text-[#56627F]'}`}>
                                            {item === 'all' ? 'All' : item}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View className="mt-5 flex-row flex-wrap items-center gap-2">
                            <Text className="text-[11px] font-bold uppercase tracking-wide text-[#56627F] mr-1">Sort by</Text>
                            {SORT_OPTIONS.map((option) => {
                                const active = sortKey === option.key;
                                return (
                                    <Pressable
                                        key={option.key}
                                        onPress={() => {
                                            if (active) {
                                                setSortDesc((value) => !value);
                                            } else {
                                                setSortKey(option.key);
                                                setSortDesc(true);
                                            }
                                        }}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        className={`px-4 py-2 min-h-[40px] flex-row items-center gap-1 rounded-full border ${active ? 'bg-[#EEF3FF] border-[#123A97]' : 'bg-white border-[#E4EAF7] hover:border-blue-200'}`}
                                    >
                                        <Text className={`font-bold text-[12px] ${active ? 'text-[#123A97]' : 'text-[#56627F]'}`}>{option.label}</Text>
                                        {active ? (
                                            <MaterialIcons name={sortDesc ? 'arrow-downward' : 'arrow-upward'} size={14} color="var(--c-brand-fg)" />
                                        ) : null}
                                    </Pressable>
                                );
                            })}

                            {selectableAccounts.length > 0 ? (
                                <Pressable
                                    onPress={toggleSelectAll}
                                    accessibilityRole="button"
                                    className="ml-auto px-4 py-2 min-h-[40px] flex-row items-center gap-2 rounded-full border border-[#E4EAF7] bg-white hover:border-blue-200"
                                >
                                    <MaterialIcons
                                        name={allSelectableSelected ? 'check-box' : 'check-box-outline-blank'}
                                        size={18}
                                        color="var(--c-brand-fg)"
                                    />
                                    <Text className="font-bold text-[12px] text-[#56627F]">
                                        {allSelectableSelected ? 'Clear selection' : `Select all (${selectableAccounts.length})`}
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    </GlassCard>

                    {selectedAccounts.length > 0 ? (
                        <View className="mb-6 flex-col sm:flex-row sm:items-center gap-2.5 bg-[#EBF1FF] border border-[#BFDBFE] rounded-2xl px-4 py-3">
                            <View className="flex-row items-center gap-2">
                                <Text className="text-[#1D3E90] text-[13px] font-black">
                                    {selectedAccounts.length} selected
                                </Text>
                                <Pressable onPress={clearSelection} className="w-7 h-7 rounded-full items-center justify-center hover:bg-white/60">
                                    <MaterialIcons name="close" size={16} color="var(--c-brand-fg)" />
                                </Pressable>
                            </View>
                            <View className="flex-row flex-wrap items-center gap-2 sm:ml-auto">
                                {(['coach', 'player', 'parent'] as ClubAdminAccountRole[]).map((role) => (
                                    <Pressable
                                        key={role}
                                        disabled={bulkBusy}
                                        onPress={() => setPending({ kind: 'bulk', action: role, ids: selectedAccounts.map((account) => account.id) })}
                                        className={`px-3 py-2 rounded-full border border-[#1D3E90] bg-white ${bulkBusy ? 'opacity-60' : ''}`}
                                    >
                                        <Text className="text-[#1D3E90] text-[11.5px] font-bold capitalize">Set {role}</Text>
                                    </Pressable>
                                ))}
                                <Pressable
                                    disabled={bulkBusy}
                                    onPress={() => setPending({ kind: 'bulk', action: 'reactivate', ids: selectedAccounts.map((account) => account.id) })}
                                    className={`px-3 py-2 rounded-full border border-emerald-300 bg-white ${bulkBusy ? 'opacity-60' : ''}`}
                                >
                                    <Text className="text-emerald-700 text-[11.5px] font-bold">Reactivate</Text>
                                </Pressable>
                                <Pressable
                                    disabled={bulkBusy}
                                    onPress={() => setPending({ kind: 'bulk', action: 'deactivate', ids: selectedAccounts.map((account) => account.id) })}
                                    className={`px-3 py-2 rounded-full border border-rose-300 bg-white ${bulkBusy ? 'opacity-60' : ''}`}
                                >
                                    <Text className="text-rose-700 text-[11.5px] font-bold">Deactivate</Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : null}

                    {loading ? (
                        <SkeletonList count={4} />
                    ) : filteredAccounts.length === 0 ? (
                        <GlassCard className="items-center py-12">
                            <MaterialIcons name="group-off" size={42} color="var(--c-muted)" />
                            <Text className="text-slate-900 font-bold text-lg mt-3">No accounts found</Text>
                            <Text className="text-slate-500 text-center mt-2">
                                Try another search or create a new invite for your club.
                            </Text>
                        </GlassCard>
                    ) : (
                        <>
                            <View className="gap-3">
                                {pagedAccounts.map((account) => {
                                    const isBusy = busyId === account.id;
                                    const isInvite = account.source === 'invite';
                                    const isInactive = account.status === 'inactive';
                                    // Admin/superadmin accounts are read-only here — role changes and
                                    // deactivation are blocked server-side to prevent admin lockout, so
                                    // their controls are hidden (this also covers the current admin's
                                    // own card, since they are privileged).
                                    const isPrivileged = PRIVILEGED_ROLES.has(account.role);
                                    const canChangeRole = !isInvite && !isPrivileged && account.status === 'active';
                                    const canReactivate = !isInvite && !isPrivileged && isInactive;
                                    const canDeactivate = !isPrivileged && !isInactive;
                                    const canResend = isInvite;
                                    const roleActions = canChangeRole ? ROLE_ACTIONS.filter((option) => option.role !== account.role) : [];
                                    const hasActions = roleActions.length > 0 || canReactivate || canDeactivate || canResend;
                                    const isSelectable = isManageableMember(account);
                                    const isSelected = selectedIds.has(account.id);
                                    const rv = roleVisual(account.role);
                                    const sv = statusVisual(account);
                                    const created = formatDate(account.createdAt);
                                    const lastLogin = formatDate(account.lastLoginAt);

                                    return (
                                        <View
                                            key={`${account.source}-${account.id}`}
                                            className={`flex-col bg-white rounded-[20px] border p-4 md:p-5 transition-all duration-150 ${
                                                isSelected
                                                    ? 'border-[#1D3E90] shadow-[0_0_0_3px_rgba(29,62,144,0.10)]'
                                                    : 'border-[#E3E9F2] shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-[#CBD8EC] hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]'
                                            } ${isInactive ? 'opacity-70' : ''}`}
                                        >
                                            <View className="flex-row items-center gap-3">
                                                {isSelectable ? (
                                                    <Pressable
                                                        onPress={() => toggleSelected(account.id)}
                                                        accessibilityRole="checkbox"
                                                        accessibilityState={{ checked: isSelected }}
                                                        className="flex-none w-6 h-6 items-center justify-center"
                                                    >
                                                        <MaterialIcons
                                                            name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                                                            size={22}
                                                            color={isSelected ? 'var(--c-brand-fg)' : 'var(--c-border-strong)'}
                                                        />
                                                    </Pressable>
                                                ) : (
                                                    <View className="flex-none w-6" />
                                                )}

                                                <View
                                                    className="w-12 h-12 rounded-2xl items-center justify-center flex-none"
                                                    style={{ backgroundColor: isInvite ? 'var(--c-warning-bg)' : rv.tint }}
                                                >
                                                    {isInvite ? (
                                                        <MaterialIcons name="mail-outline" size={20} color="var(--c-warning-fg)" />
                                                    ) : (
                                                        <Text className="text-[15px] font-black" style={{ color: rv.fg }}>
                                                            {initialsOf(account.name, account.email)}
                                                        </Text>
                                                    )}
                                                </View>

                                                <View className="flex-1 min-w-0">
                                                    <View className="flex-row items-center flex-wrap gap-2">
                                                        <Text className="text-[15px] md:text-[16px] font-black text-[#0E2041]" numberOfLines={1}>
                                                            {account.name}
                                                        </Text>
                                                        <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: rv.tint }}>
                                                            <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: rv.fg }}>
                                                                {account.role}
                                                            </Text>
                                                        </View>
                                                        {isBusy ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : null}
                                                    </View>
                                                    <Text className="text-[12.5px] font-semibold text-[#94A3B8] mt-0.5" numberOfLines={1}>
                                                        {account.email}
                                                    </Text>
                                                    <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                                                        <View className="flex-row items-center gap-1.5 rounded-full px-2 py-0.5" style={{ backgroundColor: sv.bg }}>
                                                            <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sv.dot }} />
                                                            <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: sv.fg }}>
                                                                {sv.label}
                                                            </Text>
                                                        </View>
                                                        {created ? (
                                                            <View className="flex-row items-center gap-1">
                                                                <MaterialIcons name="event" size={12} color="var(--c-faint)" />
                                                                <Text className="text-[11px] font-semibold text-[#94A3B8]">{created}</Text>
                                                            </View>
                                                        ) : null}
                                                        {lastLogin ? (
                                                            <View className="flex-row items-center gap-1">
                                                                <MaterialIcons name="login" size={12} color="var(--c-faint)" />
                                                                <Text className="text-[11px] font-semibold text-[#94A3B8]">{lastLogin}</Text>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                </View>
                                            </View>

                                            {hasActions ? (
                                                <View className="mt-3.5 pt-3.5 border-t border-[#F1F5F9] flex-row flex-wrap gap-2">
                                                    {roleActions.map((option) => {
                                                        const v = ACTION_STYLE[option.role];
                                                        return (
                                                            <Pressable
                                                                key={option.role}
                                                                onPress={() => setPending({ kind: 'role', account, role: option.role })}
                                                                disabled={isBusy}
                                                                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 min-h-[36px] ${isBusy ? 'opacity-60' : ''}`}
                                                                style={{ backgroundColor: v.tint }}
                                                            >
                                                                <MaterialIcons name={option.icon} size={14} color={v.fg} />
                                                                <Text className="text-[12px] font-bold" style={{ color: v.fg }}>{option.label}</Text>
                                                            </Pressable>
                                                        );
                                                    })}

                                                    {canResend ? (
                                                        <Pressable
                                                            onPress={() => setPending({ kind: 'resend', account })}
                                                            disabled={isBusy}
                                                            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 min-h-[36px] ${isBusy ? 'opacity-60' : ''}`}
                                                            style={{ backgroundColor: ACTION_STYLE.resend.tint }}
                                                        >
                                                            <MaterialIcons name="mail" size={14} color={ACTION_STYLE.resend.fg} />
                                                            <Text className="text-[12px] font-bold" style={{ color: ACTION_STYLE.resend.fg }}>Resend invite</Text>
                                                        </Pressable>
                                                    ) : null}

                                                    {canReactivate ? (
                                                        <Pressable
                                                            onPress={() => setPending({ kind: 'reactivate', account })}
                                                            disabled={isBusy}
                                                            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 min-h-[36px] ${isBusy ? 'opacity-60' : ''}`}
                                                            style={{ backgroundColor: ACTION_STYLE.reactivate.tint }}
                                                        >
                                                            <MaterialIcons name="restart-alt" size={14} color={ACTION_STYLE.reactivate.fg} />
                                                            <Text className="text-[12px] font-bold" style={{ color: ACTION_STYLE.reactivate.fg }}>Reactivate</Text>
                                                        </Pressable>
                                                    ) : null}

                                                    {canDeactivate ? (
                                                        <Pressable
                                                            onPress={() => setPending({ kind: 'deactivate', account })}
                                                            disabled={isBusy}
                                                            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 min-h-[36px] ${isBusy ? 'opacity-60' : ''}`}
                                                            style={{ backgroundColor: isInvite ? ACTION_STYLE.cancel.tint : ACTION_STYLE.deactivate.tint }}
                                                        >
                                                            <MaterialIcons
                                                                name={isInvite ? 'close' : 'block'}
                                                                size={14}
                                                                color={isInvite ? ACTION_STYLE.cancel.fg : ACTION_STYLE.deactivate.fg}
                                                            />
                                                            <Text
                                                                className="text-[12px] font-bold"
                                                                style={{ color: isInvite ? ACTION_STYLE.cancel.fg : ACTION_STYLE.deactivate.fg }}
                                                            >
                                                                {isInvite ? 'Cancel invite' : 'Deactivate'}
                                                            </Text>
                                                        </Pressable>
                                                    ) : null}
                                                </View>
                                            ) : null}
                                        </View>
                                    );
                                })}
                            </View>

                            <View className="mt-6 flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <Text className="text-[12px] font-semibold text-[#64748B]">
                                    Showing {rangeStart}–{rangeEnd} of {filteredAccounts.length}
                                </Text>
                                {totalPages > 1 ? (
                                    <View className="flex-row items-center gap-1.5">
                                        <Pressable
                                            onPress={() => setPage((current) => Math.max(1, current - 1))}
                                            disabled={page === 1}
                                            accessibilityLabel="Previous page"
                                            className={`w-9 h-9 rounded-xl items-center justify-center border ${page === 1 ? 'border-[#E4EAF7] opacity-50' : 'border-[#CBD8EC] bg-white hover:border-blue-200'}`}
                                        >
                                            <MaterialIcons name="chevron-left" size={20} color="var(--c-brand-fg)" />
                                        </Pressable>

                                        {pageWindow(page, totalPages).map((item, index) => (
                                            item === 'gap' ? (
                                                <Text key={`gap-${index}`} className="px-1 text-[#94A3B8] font-bold">…</Text>
                                            ) : (
                                                <Pressable
                                                    key={item}
                                                    onPress={() => setPage(item)}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ selected: item === page }}
                                                    className={`min-w-[36px] h-9 px-2 rounded-xl items-center justify-center border ${item === page ? 'bg-[#123A97] border-[#123A97]' : 'border-[#CBD8EC] bg-white hover:border-blue-200'}`}
                                                >
                                                    <Text className={`text-[13px] font-bold ${item === page ? 'text-white' : 'text-[#56627F]'}`}>{item}</Text>
                                                </Pressable>
                                            )
                                        ))}

                                        <Pressable
                                            onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
                                            disabled={page === totalPages}
                                            accessibilityLabel="Next page"
                                            className={`w-9 h-9 rounded-xl items-center justify-center border ${page === totalPages ? 'border-[#E4EAF7] opacity-50' : 'border-[#CBD8EC] bg-white hover:border-blue-200'}`}
                                        >
                                            <MaterialIcons name="chevron-right" size={20} color="var(--c-brand-fg)" />
                                        </Pressable>
                                    </View>
                                ) : null}
                            </View>
                        </>
                    )}
                </View>
            </ScrollView>

            <ConfirmDialog
                visible={pending != null}
                title={confirmCopy?.title ?? ''}
                message={confirmCopy?.message}
                confirmLabel={confirmCopy?.confirmLabel}
                destructive={confirmCopy?.destructive}
                onConfirm={confirmPending}
                onCancel={() => setPending(null)}
            />

            <ToastHost toasts={toasts} onDismiss={dismissToast} />
        </View>
    );
}
