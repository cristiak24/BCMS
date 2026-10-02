import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import FilterChips from '../../components/ui/FilterChips';
import SelectField from '../../components/ui/SelectField';
import ActionSheet, { type SheetAction } from '../../components/ui/ActionSheet';
import Pagination from '../../components/ui/Pagination';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../components/ui/Toast';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { formatRelativeDate } from '../../components/myclub/teamDisplay';
import { clubAdminApi, type ClubAdminAccount, type ClubAdminAccountRole } from '../../services/clubAdminApi';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const FILTERS = ['all', 'coach', 'player', 'parent', 'invite', 'inactive'] as const;

const FILTER_LABEL: Record<(typeof FILTERS)[number], string> = {
    all: 'Toate',
    coach: 'Antrenori',
    player: 'Jucători',
    parent: 'Părinți',
    invite: 'Invitații',
    inactive: 'Dezactivate',
};

const ROLE_LABEL: Record<string, string> = {
    coach: 'Antrenor',
    player: 'Jucător',
    parent: 'Părinte',
    admin: 'Administrator',
    superadmin: 'Superadmin',
    accountant: 'Contabil',
    staff: 'Staff',
};

const roleLabel = (role: string) => ROLE_LABEL[role] ?? role;

const PRIVILEGED_ROLES = new Set(['admin', 'superadmin']);

const SORT_OPTIONS = [
    { key: 'created', label: 'Cele mai noi' },
    { key: 'lastLogin', label: 'Ultima autentificare' },
    { key: 'name', label: 'Nume (A–Z)' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['key'];

type BulkKind = 'deactivate' | 'reactivate' | ClubAdminAccountRole;

type PendingAction =
    | { kind: 'deactivate'; account: ClubAdminAccount }
    | { kind: 'reactivate'; account: ClubAdminAccount }
    | { kind: 'delete'; account: ClubAdminAccount }
    | { kind: 'resend'; account: ClubAdminAccount }
    | { kind: 'role'; account: ClubAdminAccount; role: ClubAdminAccountRole }
    | { kind: 'bulk'; action: BulkKind; ids: (string | number)[] };

// A member account (not an invite, not an admin) that can be bulk-managed.
function isManageableMember(account: ClubAdminAccount) {
    return account.source !== 'invite' && !PRIVILEGED_ROLES.has(account.role);
}

const PAGE_SIZE = 20;

// Role-tinted avatars so the list scans by colour.
const ROLE_VISUAL: Record<string, { tint: string; fg: string }> = {
    coach: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)' },
    player: { tint: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
    parent: { tint: 'var(--c-purple-bg)', fg: 'var(--c-purple-fg)' },
    admin: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-strong)' },
    superadmin: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-strong)' },
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

type StatusVisual = { dot: string; fg: string; label: string };
function statusVisual(account: ClubAdminAccount): StatusVisual {
    if (account.source === 'invite') return { dot: 'var(--c-warning)', fg: 'var(--c-warning-fg)', label: 'Invitație trimisă' };
    if (account.status === 'inactive') return { dot: 'var(--c-danger)', fg: 'var(--c-danger-fg)', label: 'Dezactivat' };
    if (account.status === 'pending_registration') return { dot: 'var(--c-sky)', fg: 'var(--c-sky-fg)', label: 'Înregistrare în curs' };
    return { dot: 'var(--c-success)', fg: 'var(--c-success-fg)', label: 'Activ' };
}

const ROLE_ACTIONS = [
    { role: 'coach', icon: 'sports', label: 'Schimbă în antrenor' },
    { role: 'player', icon: 'sports-basketball', label: 'Schimbă în jucător' },
    { role: 'parent', icon: 'family-restroom', label: 'Schimbă în părinte' },
] as const;

export default function ManageAccountsScreen() {
    const router = useRouter();
    const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
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
    const [menuFor, setMenuFor] = useState<ClubAdminAccount | null>(null);

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
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Nu am putut încărca conturile clubului.' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => {
        setSearchPlaceholder('Caută după nume sau email…');
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
            showToast({ variant: 'success', message: `${account.name} este acum ${roleLabel(role).toLowerCase()}.` });
        } catch (error) {
            setAccounts(previous); // rollback
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Nu am putut schimba rolul.' });
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
            showToast({ variant: 'success', message: isInvite ? `Invitația pentru ${account.email} a fost anulată.` : `Contul lui ${account.name} a fost dezactivat.` });
        } catch (error) {
            setAccounts(previous); // rollback
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Nu am putut actualiza contul.' });
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
            showToast({ variant: 'success', message: `Contul lui ${account.name} a fost reactivat.` });
        } catch (error) {
            setAccounts(previous); // rollback
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Nu am putut reactiva contul.' });
        } finally {
            setBusyId(null);
        }
    }, [accounts, showToast]);

    // Permanent delete. Not optimistic: the row only leaves the list once the
    // server confirms, since there is nothing to roll back to afterwards.
    const performDelete = useCallback(async (account: ClubAdminAccount) => {
        setBusyId(account.id);
        try {
            await clubAdminApi.deleteAccount(account.id);
            setAccounts((current) => current.filter((item) => item.id !== account.id));
            setSelectedIds((current) => {
                if (!current.has(account.id)) return current;
                const next = new Set(current);
                next.delete(account.id);
                return next;
            });
            showToast({ variant: 'success', message: `Contul lui ${account.name} a fost șters definitiv.` });
        } catch (error) {
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Nu am putut șterge contul.' });
        } finally {
            setBusyId(null);
        }
    }, [showToast]);

    // Resend a pending invitation (mints a fresh link + expiry, re-sends the email).
    const performResend = useCallback(async (account: ClubAdminAccount) => {
        setBusyId(account.id);
        try {
            await clubAdminApi.resendInvitation(account.id);
            showToast({ variant: 'success', message: `Invitația a fost retrimisă la ${account.email}.` });
        } catch (error) {
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Nu am putut retrimite invitația.' });
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
            showToast({ variant: 'info', message: 'Niciun cont selectat nu se potrivește acțiunii.' });
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
            showToast({ variant: 'error', message: `${failed} din ${eligible.length} conturi nu au putut fi actualizate.` });
            void loadAccounts('refresh');
        } else {
            const skippedSuffix = skipped > 0 ? ` (${skipped} sărite)` : '';
            showToast({ variant: 'success', message: `${succeeded === 1 ? '1 cont actualizat' : `${succeeded} conturi actualizate`}${skippedSuffix}.` });
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
        } else if (action.kind === 'delete') {
            void performDelete(action.account);
        } else if (action.kind === 'bulk') {
            void performBulk(action.action, action.ids);
        } else {
            void performDeactivate(action.account);
        }
    }, [pending, performUpdateRole, performDeactivate, performReactivate, performResend, performDelete, performBulk]);

    const confirmCopy = useMemo(() => {
        if (!pending) {
            return null;
        }
        if (pending.kind === 'role') {
            return {
                title: `Schimbi rolul lui ${pending.account.name}?`,
                message: `Devine ${roleLabel(pending.role).toLowerCase()} și primește imediat permisiunile acestui rol.`,
                confirmLabel: `Schimbă în ${roleLabel(pending.role).toLowerCase()}`,
                destructive: false,
            };
        }
        if (pending.kind === 'reactivate') {
            return {
                title: `Reactivezi contul lui ${pending.account.name}?`,
                message: 'Își recapătă accesul în club, cu rolul de dinainte.',
                confirmLabel: 'Reactivează',
                destructive: false,
            };
        }
        if (pending.kind === 'delete') {
            return {
                title: `Ștergi definitiv contul lui ${pending.account.name}?`,
                message: `Se șterg contul ${pending.account.email}, accesul și fișa din lot — inclusiv prezențe, plăți și echipe. Nu se poate anula; ar avea nevoie de o invitație nouă. Ca doar să oprești accesul, folosește Dezactivează.`,
                confirmLabel: 'Șterge definitiv',
                destructive: true,
                icon: 'delete-forever',
                requireTypedConfirmation: 'STERGE',
            };
        }
        if (pending.kind === 'resend') {
            return {
                title: `Retrimiți invitația la ${pending.account.email}?`,
                message: 'Se trimite un link nou pe email, iar cel vechi nu mai funcționează.',
                confirmLabel: 'Retrimite',
                destructive: false,
            };
        }
        if (pending.kind === 'bulk') {
            const n = pending.ids.length;
            const label = pending.action === 'deactivate'
                ? 'Dezactivează'
                : pending.action === 'reactivate'
                    ? 'Reactivează'
                    : `Schimbă în ${roleLabel(pending.action).toLowerCase()}`;
            return {
                title: `${label}: ${n === 1 ? '1 cont' : `${n} conturi`}?`,
                message: pending.action === 'deactivate'
                    ? 'Membrii activi selectați pierd accesul până la reactivare. Restul sunt săriți.'
                    : pending.action === 'reactivate'
                        ? 'Membrii dezactivați selectați își recapătă accesul. Restul sunt săriți.'
                        : `Membrii activi selectați devin ${roleLabel(pending.action).toLowerCase()}. Restul sunt săriți.`,
                confirmLabel: label,
                destructive: pending.action === 'deactivate',
            };
        }
        const isInvite = pending.account.source === 'invite';
        return isInvite
            ? {
                title: 'Anulezi invitația?',
                message: `Invitația pentru ${pending.account.email} se revocă și linkul nu mai funcționează.`,
                confirmLabel: 'Anulează invitația',
                destructive: true,
            }
            : {
                title: `Dezactivezi contul lui ${pending.account.name}?`,
                message: 'Pierde accesul în club până când un administrator îl reactivează.',
                confirmLabel: 'Dezactivează',
                destructive: true,
            };
    }, [pending]);

    const sheetActions = useCallback((account: ClubAdminAccount): SheetAction[] => {
        const isInvite = account.source === 'invite';
        const isInactive = account.status === 'inactive';
        const isPrivileged = PRIVILEGED_ROLES.has(account.role);
        const actions: SheetAction[] = [];
        if (!isInvite && !isPrivileged && account.status === 'active') {
            ROLE_ACTIONS.filter((option) => option.role !== account.role).forEach((option) => {
                actions.push({ key: option.role, label: option.label, icon: option.icon, onPress: () => setPending({ kind: 'role', account, role: option.role }) });
            });
        }
        if (isInvite) actions.push({ key: 'resend', label: 'Retrimite invitația', icon: 'send', onPress: () => setPending({ kind: 'resend', account }) });
        if (!isInvite && !isPrivileged && isInactive) actions.push({ key: 'reactivate', label: 'Reactivează', icon: 'restart-alt', onPress: () => setPending({ kind: 'reactivate', account }) });
        if (!isPrivileged && !isInactive) {
            actions.push(isInvite
                ? { key: 'cancel', label: 'Anulează invitația', icon: 'cancel', tone: 'danger', onPress: () => setPending({ kind: 'deactivate', account }) }
                : { key: 'deactivate', label: 'Dezactivează', icon: 'block', tone: 'danger', hint: 'Oprește accesul, se poate reactiva', onPress: () => setPending({ kind: 'deactivate', account }) });
        }
        if (!isInvite && !isPrivileged) actions.push({ key: 'delete', label: 'Șterge definitiv', icon: 'delete-forever', tone: 'danger', onPress: () => setPending({ kind: 'delete', account }) });
        return actions;
    }, []);

    const filterCounts = useMemo(() => ({
        all: accounts.length,
        coach: accounts.filter((a) => a.role === 'coach' && a.source !== 'invite').length,
        player: accounts.filter((a) => a.role === 'player' && a.source !== 'invite').length,
        parent: accounts.filter((a) => a.role === 'parent' && a.source !== 'invite').length,
        invite: counts.invites,
        inactive: accounts.filter((a) => a.status === 'inactive').length,
    }), [accounts, counts.invites]);

    const filterOptions = FILTERS
        .filter((key) => key === 'all' || filterCounts[key] > 0 || filter === key)
        .map((key) => ({ key, label: FILTER_LABEL[key], count: filterCounts[key] }));

    const bulkIds = selectedAccounts.map((account) => account.id);

    return (
        <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
            <ScrollView className="flex-1" contentContainerClassName="pb-36" showsVerticalScrollIndicator={false}>
                <PageContainer>
                    <PageHeader
                        title="Conturi"
                        subtitle={loading ? undefined : `${counts.active} active · ${counts.invites} ${counts.invites === 1 ? 'invitație în așteptare' : 'invitații în așteptare'}`}
                        actions={(
                            <>
                                <Button icon="refresh" label="Reîncarcă" iconOnlyOnMobile loading={refreshing} disabled={loading} onPress={() => void loadAccounts('refresh')} className="hidden sm:flex" />
                                <Button icon="verified-user" label="Acces & invitații" iconOnlyOnMobile onPress={() => router.push('/admin/manage-access')} />
                                <Button icon="person-add-alt-1" label="Cont nou" variant="primary" onPress={() => router.push('/admin/create-account')} />
                            </>
                        )}
                    />

                    <View className="gap-3">
                        <View className="flex-col lg:flex-row lg:items-center gap-2">
                            <View className="flex-1 min-w-0">
                                <FilterChips label="Tip cont" options={filterOptions} value={filter} onChange={setFilter} />
                            </View>
                            <SelectField
                                label="Sortare"
                                icon="sort"
                                options={SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
                                value={sortKey}
                                onChange={(next) => { setSortKey(next); setSortDesc(next !== 'name'); }}
                                className="w-full lg:w-[230px]"
                            />
                        </View>

                        {selectedAccounts.length > 0 ? (
                            <View className="flex-col sm:flex-row sm:items-center gap-2 rounded-[12px] px-3.5 py-2.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                                <Text className="text-[13px] font-semibold sm:mr-auto" style={{ color: 'var(--c-brand-fg)' }}>
                                    {selectedAccounts.length === 1 ? '1 cont selectat' : `${selectedAccounts.length} conturi selectate`}
                                </Text>
                                <View className="flex-row flex-wrap items-center gap-1.5">
                                    {(['coach', 'player', 'parent'] as ClubAdminAccountRole[]).map((role) => (
                                        <Button key={role} size="sm" label={roleLabel(role)} disabled={bulkBusy} onPress={() => setPending({ kind: 'bulk', action: role, ids: bulkIds })} />
                                    ))}
                                    <Button size="sm" label="Reactivează" disabled={bulkBusy} onPress={() => setPending({ kind: 'bulk', action: 'reactivate', ids: bulkIds })} />
                                    <Button size="sm" variant="danger" label="Dezactivează" disabled={bulkBusy} onPress={() => setPending({ kind: 'bulk', action: 'deactivate', ids: bulkIds })} />
                                    <Button size="sm" variant="ghost" label="Renunță" onPress={clearSelection} />
                                </View>
                            </View>
                        ) : null}

                        {loading ? (
                            <View className="gap-2" accessibilityRole="progressbar" accessibilityLabel="Se încarcă conturile">
                                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[60px] w-full rounded-[12px]" />)}
                            </View>
                        ) : filteredAccounts.length === 0 ? (
                            <EmptyState
                                compact
                                icon="group-off"
                                title="Niciun cont găsit"
                                message={debouncedSearch.trim() ? `Nimic pentru „${debouncedSearch.trim()}”.` : 'Încearcă alt filtru sau invită pe cineva în club.'}
                            />
                        ) : (
                            <>
                                <View className="rounded-[14px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
                                    <View className="hidden md:flex flex-row items-center px-3 py-2 border-b" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                                        <Pressable
                                            onPress={toggleSelectAll}
                                            disabled={selectableAccounts.length === 0}
                                            accessibilityRole="checkbox"
                                            accessibilityState={{ checked: allSelectableSelected }}
                                            accessibilityLabel="Selectează toate"
                                            className="w-8 h-8 items-center justify-center"
                                        >
                                            <MaterialIcons name={allSelectableSelected ? 'check-box' : 'check-box-outline-blank'} size={19} color={allSelectableSelected ? 'var(--c-brand-fg)' : 'var(--c-border-strong)'} />
                                        </Pressable>
                                        <Text className="t-eyebrow flex-[2.2] pl-2" style={{ color: 'var(--c-faint)' }}>Cont</Text>
                                        <Text className="t-eyebrow flex-1" style={{ color: 'var(--c-faint)' }}>Rol</Text>
                                        <Text className="t-eyebrow flex-1" style={{ color: 'var(--c-faint)' }}>Stare</Text>
                                        <Text className="t-eyebrow flex-1" style={{ color: 'var(--c-faint)' }}>Ultima autentificare</Text>
                                        <View className="w-9" />
                                    </View>

                                    {pagedAccounts.map((account, index) => {
                                        const isBusy = busyId === account.id;
                                        const isInvite = account.source === 'invite';
                                        const isSelectable = isManageableMember(account);
                                        const isSelected = selectedIds.has(account.id);
                                        const rv = roleVisual(account.role);
                                        const sv = statusVisual(account);
                                        const actions = sheetActions(account);
                                        const lastSeen = isInvite
                                            ? `Invitat ${formatRelativeDate(account.createdAt)}`
                                            : account.lastLoginAt ? formatRelativeDate(account.lastLoginAt) : 'Niciodată';

                                        return (
                                            <View
                                                key={`${account.source}-${account.id}`}
                                                className="flex-row items-center px-3 py-2.5"
                                                style={{
                                                    borderTopWidth: index > 0 ? 1 : 0,
                                                    borderTopColor: 'var(--c-border)',
                                                    backgroundColor: isSelected ? 'var(--c-surface-tint)' : 'transparent',
                                                    opacity: account.status === 'inactive' ? 0.7 : 1,
                                                } as any}
                                            >
                                                {isSelectable ? (
                                                    <Pressable
                                                        onPress={() => toggleSelected(account.id)}
                                                        accessibilityRole="checkbox"
                                                        accessibilityState={{ checked: isSelected }}
                                                        accessibilityLabel={`Selectează ${account.name}`}
                                                        className="w-8 h-8 items-center justify-center shrink-0"
                                                    >
                                                        <MaterialIcons name={isSelected ? 'check-box' : 'check-box-outline-blank'} size={19} color={isSelected ? 'var(--c-brand-fg)' : 'var(--c-border-strong)'} />
                                                    </Pressable>
                                                ) : <View className="w-8 shrink-0" />}

                                                <View className="flex-1 md:flex-[2.2] min-w-0 flex-row items-center gap-3 pl-1 md:pl-2">
                                                    <View className="w-9 h-9 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: isInvite ? 'var(--c-warning-bg)' : rv.tint }}>
                                                        {isInvite
                                                            ? <MaterialIcons name="mail-outline" size={17} color="var(--c-warning-fg)" />
                                                            : <Text className="text-[12px] font-bold" style={{ color: rv.fg }}>{initialsOf(account.name, account.email)}</Text>}
                                                    </View>
                                                    <View className="flex-1 min-w-0">
                                                        <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{account.name || account.email}</Text>
                                                        <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{account.email}</Text>
                                                        {/* Phones: role + status under the email. */}
                                                        <View className="md:hidden flex-row items-center gap-1.5 mt-0.5">
                                                            <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sv.dot }} />
                                                            <Text className="t-meta font-semibold" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
                                                                {roleLabel(account.role)} · <Text style={{ color: sv.fg }}>{sv.label}</Text>
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>

                                                <View className="hidden md:flex flex-1 min-w-0">
                                                    <View className="self-start rounded-full px-2.5 py-1" style={{ backgroundColor: rv.tint }}>
                                                        <Text className="text-[11.5px] font-semibold" style={{ color: rv.fg }}>{roleLabel(account.role)}</Text>
                                                    </View>
                                                </View>
                                                <View className="hidden md:flex flex-1 min-w-0 flex-row items-center gap-1.5">
                                                    <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sv.dot }} />
                                                    <Text className="text-[13px] font-medium" style={{ color: sv.fg }} numberOfLines={1}>{sv.label}</Text>
                                                </View>
                                                <View className="hidden md:flex flex-1 min-w-0">
                                                    <Text className="text-[13px]" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{lastSeen}</Text>
                                                </View>

                                                <View className="w-9 items-end shrink-0">
                                                    {isBusy ? (
                                                        <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                                                    ) : actions.length > 0 ? (
                                                        <Pressable
                                                            onPress={() => setMenuFor(account)}
                                                            accessibilityRole="button"
                                                            accessibilityLabel={`Acțiuni pentru ${account.name}`}
                                                            className="ui-press w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[var(--c-surface-3)]"
                                                        >
                                                            <MaterialIcons name="more-horiz" size={20} color="var(--c-muted)" />
                                                        </Pressable>
                                                    ) : null}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>

                                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} rangeStart={rangeStart} rangeEnd={rangeEnd} total={filteredAccounts.length} itemNoun="conturi" />
                            </>
                        )}
                    </View>
                </PageContainer>
            </ScrollView>

            <ActionSheet
                visible={menuFor != null}
                title={menuFor?.name || menuFor?.email || ''}
                subtitle={menuFor ? `${roleLabel(menuFor.role)} · ${menuFor.email}` : undefined}
                actions={menuFor ? sheetActions(menuFor) : []}
                onClose={() => setMenuFor(null)}
            />

            <ConfirmDialog
                visible={pending != null}
                title={confirmCopy?.title ?? ''}
                message={confirmCopy?.message}
                confirmLabel={confirmCopy?.confirmLabel}
                destructive={confirmCopy?.destructive}
                icon={confirmCopy && 'icon' in confirmCopy ? confirmCopy.icon : undefined}
                requireTypedConfirmation={confirmCopy && 'requireTypedConfirmation' in confirmCopy ? confirmCopy.requireTypedConfirmation : undefined}
                onConfirm={confirmPending}
                onCancel={() => setPending(null)}
            />

            <ToastHost toasts={toasts} onDismiss={dismissToast} />
        </View>
    );
}
