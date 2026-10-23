import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import PageContainer from '../../../components/ui/PageContainer';
import PageHeader from '../../../components/ui/PageHeader';
import Button from '../../../components/ui/Button';
import FilterChips from '../../../components/ui/FilterChips';
import SelectField from '../../../components/ui/SelectField';
import Pagination, { usePagination } from '../../../components/ui/Pagination';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import { useHeader } from '../../../components/HeaderContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useSession } from '../../../context/AuthContext';
import UserActions, { type ActionTarget } from '../../../components/super-admin/UserActions';
import { Avatar, HeaderCell, ListShell, RolePill, RowMenuButton, StatusLabel } from '../../../components/super-admin/ui';
import {
  CLUB_ROLE_ORDER,
  ROLE_LABEL_PLURAL,
  daysSince,
  downloadCsv,
  fold,
  formatDate,
  formatRelative,
  plural,
  roleLabel,
  statusVisual,
} from '../../../components/super-admin/format';
import { superAdminApi, type SuperAdminUser } from '../../../services/superAdminApi';

type StatusFilter = 'all' | 'active' | 'disabled' | 'invited' | 'pending';
type Activity = 'any' | 'week' | 'month' | 'idle' | 'never';
type Sort = 'recent' | 'newest' | 'name';

const PAGE_SIZE = 30;

const ACTIVITY_OPTIONS: { key: Activity; label: string }[] = [
  { key: 'any', label: 'Orice activitate' },
  { key: 'week', label: 'Activi în ultimele 7 zile' },
  { key: 'month', label: 'Activi în ultimele 30 de zile' },
  { key: 'idle', label: 'Inactivi de peste 30 de zile' },
  { key: 'never', label: 'Nu au intrat niciodată' },
];

const SORT_OPTIONS: { key: Sort; label: string }[] = [
  { key: 'recent', label: 'Activitate recentă' },
  { key: 'newest', label: 'Cele mai noi conturi' },
  { key: 'name', label: 'Alfabetic' },
];

function matchesActivity(user: SuperAdminUser, activity: Activity) {
  if (activity === 'any') return true;
  if (user.source === 'invite') return activity === 'never';
  const days = daysSince(user.lastLoginAt);
  if (activity === 'never') return days == null;
  if (activity === 'week') return days != null && days <= 7;
  if (activity === 'month') return days != null && days <= 30;
  return days != null && days > 30;
}

export default function UsersScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { searchValue, setSearchValue } = useHeader();
  const search = fold(useDebouncedValue(searchValue, 150).trim());
  const { toasts, showToast, dismissToast } = useToasts();
  const [users, setUsers] = useState<SuperAdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [role, setRole] = useState<string>('all');
  const [clubId, setClubId] = useState<string>('all');
  const [activity, setActivity] = useState<Activity>('any');
  const [sort, setSort] = useState<Sort>('recent');
  const [target, setTarget] = useState<ActionTarget | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await superAdminApi.listUsers();
      setUsers(response.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca utilizatorii.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const clubOptions = useMemo(() => {
    const map = new Map<number, { name: string; count: number }>();
    let none = 0;
    for (const user of users ?? []) {
      if (user.clubId == null) { none += 1; continue; }
      const entry = map.get(user.clubId) ?? { name: user.clubName ?? `Club #${user.clubId}`, count: 0 };
      entry.count += 1;
      map.set(user.clubId, entry);
    }
    return [
      { key: 'all', label: 'Toate cluburile' },
      ...[...map].sort((a, b) => a[1].name.localeCompare(b[1].name, 'ro')).map(([id, entry]) => ({ key: String(id), label: entry.name, count: entry.count })),
      ...(none ? [{ key: 'none', label: 'Fără club', count: none }] : []),
    ];
  }, [users]);

  const statusCounts = useMemo(() => {
    const counts = { all: 0, active: 0, disabled: 0, invited: 0, pending: 0 };
    for (const user of users ?? []) {
      counts.all += 1;
      counts[user.status] += 1;
    }
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const list = (users ?? []).filter((user) => {
      if (status !== 'all' && user.status !== status) return false;
      if (role !== 'all' && user.role !== role) return false;
      if (clubId === 'none' ? user.clubId != null : clubId !== 'all' && String(user.clubId) !== clubId) return false;
      if (!matchesActivity(user, activity)) return false;
      return !search || fold(`${user.name} ${user.email} ${user.phone ?? ''} ${user.clubName ?? ''}`).includes(search);
    });
    if (sort === 'name') return list.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'ro'));
    if (sort === 'newest') return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return list.sort((a, b) => String(b.lastLoginAt ?? '').localeCompare(String(a.lastLoginAt ?? '')) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [users, status, role, clubId, activity, search, sort]);

  const pager = usePagination(filtered, PAGE_SIZE, `${status}|${role}|${clubId}|${activity}|${search}|${sort}`);
  const filtersActive = status !== 'all' || role !== 'all' || clubId !== 'all' || activity !== 'any' || Boolean(search);

  const resetFilters = () => {
    setStatus('all');
    setRole('all');
    setClubId('all');
    setActivity('any');
    setSearchValue('');
  };

  const exportCsv = () => {
    downloadCsv('utilizatori-bcms.csv', [
      ['Nume', 'Email', 'Telefon', 'Club', 'Rol', 'Stare', 'Ultima activitate', 'Zile active luna asta', 'Creat'],
      ...filtered.map((user) => [
        user.name, user.email, user.phone ?? '', user.clubName ?? '', roleLabel(user.role), statusVisual(user.status).label,
        user.lastLoginAt ? formatDate(user.lastLoginAt) : '', user.activeDaysThisMonth, formatDate(user.createdAt),
      ]),
    ]);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Utilizatori"
        subtitle={users ? `${plural(statusCounts.active, 'cont activ', 'conturi active')} · ${plural(statusCounts.invited, 'invitație deschisă', 'invitații deschise')}` : 'Toate conturile de pe platformă'}
        actions={(
          <>
            <Button label="Export CSV" icon="file-download" iconOnlyOnMobile onPress={exportCsv} disabled={!filtered.length} />
            <Button label="Invită" icon="person-add" variant="primary" iconOnlyOnMobile onPress={() => router.push('/super-admin/create-user')} />
          </>
        )}
      />

      <View className="gap-2 mb-3">
        <FilterChips<StatusFilter>
          value={status}
          onChange={setStatus}
          label="Stare cont"
          options={[
            { key: 'all', label: 'Toți', count: statusCounts.all },
            { key: 'active', label: 'Activi', count: statusCounts.active, dot: 'var(--c-success)' },
            { key: 'pending', label: 'Neterminate', count: statusCounts.pending, dot: 'var(--c-sky)' },
            { key: 'invited', label: 'Invitați', count: statusCounts.invited, dot: 'var(--c-warning)' },
            { key: 'disabled', label: 'Dezactivați', count: statusCounts.disabled, dot: 'var(--c-danger)' },
          ]}
        />
        <View className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <SelectField<string>
            label="Rol"
            icon="badge"
            hideIconOnMobile
            value={role}
            onChange={setRole}
            options={[{ key: 'all', label: 'Toate rolurile' }, ...CLUB_ROLE_ORDER.map((key) => ({ key, label: ROLE_LABEL_PLURAL[key] })), { key: 'superadmin', label: 'Super admini' }]}
          />
          <SelectField<string> label="Club" icon="apartment" hideIconOnMobile value={clubId} onChange={setClubId} options={clubOptions} />
          <SelectField<Activity> label="Activitate" icon="insights" hideIconOnMobile value={activity} onChange={setActivity} options={ACTIVITY_OPTIONS} />
          <SelectField<Sort> label="Sortare" icon="sort" hideIconOnMobile value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </View>
        {filtersActive && users ? (
          <View className="flex-row items-center gap-2">
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{plural(filtered.length, 'rezultat', 'rezultate')}</Text>
            <Pressable onPress={resetFilters} accessibilityRole="button" className="ui-press">
              <Text className="t-meta font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Resetează filtrele</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {error && !users ? (
        <ErrorState message={error} actionLabel="Încearcă din nou" onAction={() => void load()} />
      ) : !users ? (
        <View className="gap-2" accessibilityRole="progressbar" accessibilityLabel="Se încarcă utilizatorii">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[60px] w-full rounded-[12px]" />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="person-search"
          title="Niciun utilizator găsit"
          message={searchValue.trim() ? `Nimic pentru „${searchValue.trim()}”.` : 'Încearcă alt filtru.'}
          actionLabel={filtersActive ? 'Resetează filtrele' : undefined}
          onAction={filtersActive ? resetFilters : undefined}
        />
      ) : (
        <>
          <ListShell
            header={(
              <>
                <HeaderCell flex={2.4}>Cont</HeaderCell>
                <HeaderCell flex={1.5}>Club</HeaderCell>
                <HeaderCell>Rol</HeaderCell>
                <HeaderCell>Stare</HeaderCell>
                <HeaderCell flex={1.2}>Ultima activitate</HeaderCell>
                <View className="w-9" />
              </>
            )}
          >
            {pager.pageItems.map((user, index) => {
              const invite = user.source === 'invite';
              return (
                <View
                  key={`${user.source}-${user.id}`}
                  className="flex-row items-center gap-3 px-3 py-2.5"
                  style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)', opacity: user.status === 'disabled' ? 0.7 : 1 } as any}
                >
                  <View className="flex-1 md:flex-[2.4] min-w-0 flex-row items-center gap-3">
                    <Avatar name={user.name} email={user.email} role={user.role} invite={invite} />
                    <View className="flex-1 min-w-0">
                      <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{invite ? user.email : user.name || user.email}</Text>
                      <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{invite ? `Invitație · ${roleLabel(user.role)}` : user.email}</Text>
                      <Text className="t-meta md:hidden" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
                        {[user.clubName ?? 'Fără club', invite ? null : roleLabel(user.role), invite ? 'invitat' : user.status === 'disabled' ? 'dezactivat' : formatRelative(user.lastLoginAt, 'nu a intrat').toLowerCase()].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                  <View className="hidden md:flex flex-[1.5] min-w-0">
                    {user.clubId != null ? (
                      <Pressable onPress={() => router.push(`/super-admin/clubs/${user.clubId}`)} accessibilityRole="link" className="self-start max-w-full">
                        <Text className="text-[13px] font-medium hover:underline" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{user.clubName ?? `Club #${user.clubId}`}</Text>
                      </Pressable>
                    ) : (
                      <Text className="text-[13px]" style={{ color: 'var(--c-faint)' }}>Fără club</Text>
                    )}
                  </View>
                  <View className="hidden md:flex flex-1 min-w-0"><RolePill role={user.role} /></View>
                  <View className="hidden md:flex flex-1 min-w-0"><StatusLabel status={user.status} /></View>
                  <View className="hidden md:flex flex-[1.2] min-w-0">
                    <Text className="text-[13px]" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
                      {invite ? `Trimisă ${formatRelative(user.createdAt, '—').toLowerCase()}` : formatRelative(user.lastLoginAt)}
                    </Text>
                  </View>
                  <View className="w-9 items-end shrink-0">
                    <RowMenuButton label={`Acțiuni pentru ${user.name || user.email}`} onPress={() => setTarget(user)} />
                  </View>
                </View>
              );
            })}
          </ListShell>
          <Pagination
            page={pager.page}
            totalPages={pager.totalPages}
            onPageChange={pager.setPage}
            rangeStart={pager.rangeStart}
            rangeEnd={pager.rangeEnd}
            total={pager.total}
            itemNoun="utilizatori"
          />
        </>
      )}

      <UserActions
        target={target}
        selfId={session?.id ?? null}
        showClubLink
        onClose={() => setTarget(null)}
        onChanged={() => void load()}
        notify={(variant, message) => showToast({ variant, message })}
      />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </PageContainer>
  );
}
