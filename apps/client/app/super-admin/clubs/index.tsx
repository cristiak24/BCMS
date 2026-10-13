import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import PageContainer from '../../../components/ui/PageContainer';
import PageHeader from '../../../components/ui/PageHeader';
import Button from '../../../components/ui/Button';
import FilterChips from '../../../components/ui/FilterChips';
import SelectField from '../../../components/ui/SelectField';
import Pagination, { usePagination } from '../../../components/ui/Pagination';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { useHeader } from '../../../components/HeaderContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import CreateClubDialog from '../../../components/super-admin/CreateClubDialog';
import { HeaderCell, ListShell, Meter } from '../../../components/super-admin/ui';
import {
  downloadCsv,
  fold,
  formatDate,
  formatMoney,
  formatNumber,
  formatRelative,
  monthLabel,
  plural,
  SUPER_ADMIN_SEARCH_PLACEHOLDER,
} from '../../../components/super-admin/format';
import { superAdminApi, type SuperAdminClub } from '../../../services/superAdminApi';

type Filter = 'all' | 'noAdmin' | 'dormant' | 'unpriced';
type Sort = 'active' | 'name' | 'accounts' | 'amount' | 'newest';

const SORT_OPTIONS: { key: Sort; label: string }[] = [
  { key: 'active', label: 'Cei mai activi' },
  { key: 'amount', label: 'De facturat' },
  { key: 'accounts', label: 'Cele mai multe conturi' },
  { key: 'name', label: 'Alfabetic' },
  { key: 'newest', label: 'Cele mai noi' },
];

const PAGE_SIZE = 25;

function sortClubs(clubs: SuperAdminClub[], sort: Sort) {
  const sorted = [...clubs];
  switch (sort) {
    case 'name': return sorted.sort((a, b) => a.name.localeCompare(b.name, 'ro'));
    case 'accounts': return sorted.sort((a, b) => b.accounts.total - a.accounts.total);
    case 'amount': return sorted.sort((a, b) => (b.estimatedAmount ?? -1) - (a.estimatedAmount ?? -1));
    case 'newest': return sorted.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    case 'active':
    default: return sorted.sort((a, b) => b.activeThisMonth - a.activeThisMonth || b.accounts.total - a.accounts.total);
  }
}

function FlagPill({ label, tone }: { label: string; tone: 'danger' | 'warning' | 'neutral' }) {
  const colors = tone === 'danger'
    ? { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' }
    : tone === 'warning' ? { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' } : { bg: 'var(--c-surface-3)', fg: 'var(--c-muted)' };
  return (
    <View className="rounded-full px-2 py-0.5 shrink-0" style={{ backgroundColor: colors.bg }}>
      <Text className="text-[11px] font-semibold" style={{ color: colors.fg }}>{label}</Text>
    </View>
  );
}

export default function ClubsScreen() {
  const router = useRouter();
  const { searchValue, setSearchPlaceholder } = useHeader();
  const search = fold(useDebouncedValue(searchValue, 150).trim());
  const [clubs, setClubs] = useState<SuperAdminClub[] | null>(null);
  const [month, setMonth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('active');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setSearchPlaceholder('Caută un club…');
    return () => setSearchPlaceholder(SUPER_ADMIN_SEARCH_PLACEHOLDER);
  }, [setSearchPlaceholder]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await superAdminApi.listClubs();
      setClubs(response.clubs);
      setMonth(response.month);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca cluburile.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: clubs?.length ?? 0,
    noAdmin: clubs?.filter((club) => club.flags.noAdmin).length ?? 0,
    dormant: clubs?.filter((club) => club.flags.dormant).length ?? 0,
    unpriced: clubs?.filter((club) => club.flags.unpriced).length ?? 0,
  }), [clubs]);

  const visible = useMemo(() => {
    const list = (clubs ?? []).filter((club) => {
      if (filter !== 'all' && !club.flags[filter]) return false;
      return !search || fold(club.name).includes(search);
    });
    return sortClubs(list, sort);
  }, [clubs, filter, search, sort]);

  const pager = usePagination(visible, PAGE_SIZE, `${filter}|${sort}|${search}`);
  const maxActive = Math.max(1, ...visible.map((club) => club.activeThisMonth));
  const totalActive = (clubs ?? []).reduce((sum, club) => sum + club.activeThisMonth, 0);

  const exportCsv = () => {
    downloadCsv(`cluburi-${month || 'bcms'}.csv`, [
      ['Club', 'Conturi', 'Active', 'Dezactivate', 'Administratori', 'Antrenori', 'Jucători', 'Părinți', 'Echipe', 'Jucători în lot', `Activi ${month}`, 'Activi 30 zile', 'Preț/utilizator', 'De facturat', 'Ultima activitate', 'Creat'],
      ...visible.map((club) => [
        club.name, club.accounts.total, club.accounts.active, club.accounts.disabled, club.roles.admin, club.roles.coach,
        club.roles.player, club.roles.parent, club.teams, club.rosterPlayers, club.activeThisMonth, club.active30d,
        club.billingPricePerUser ?? '', club.estimatedAmount ?? '', club.lastActivityAt ?? '', formatDate(club.createdAt),
      ]),
    ]);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Cluburi"
        subtitle={clubs ? `${plural(clubs.length, 'club', 'cluburi')} · ${plural(totalActive, 'utilizator activ', 'utilizatori activi')} în ${monthLabel(month)}` : 'Toate cluburile de pe platformă'}
        actions={(
          <>
            <Button label="Export CSV" icon="file-download" iconOnlyOnMobile onPress={exportCsv} disabled={!visible.length} />
            <Button label="Club nou" icon="add" variant="primary" iconOnlyOnMobile onPress={() => setCreateOpen(true)} />
          </>
        )}
      />

      <View className="flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <View className="flex-1 min-w-0">
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            label="Filtru cluburi"
            options={[
              { key: 'all', label: 'Toate', count: counts.all },
              { key: 'noAdmin', label: 'Fără administrator', count: counts.noAdmin, dot: 'var(--c-danger)' },
              { key: 'dormant', label: 'Inactive 30 zile', count: counts.dormant, dot: 'var(--c-warning)' },
              { key: 'unpriced', label: 'Fără preț', count: counts.unpriced, dot: 'var(--c-faint)' },
            ]}
          />
        </View>
        <SelectField<Sort> label="Sortare" icon="sort" value={sort} onChange={setSort} options={SORT_OPTIONS} className="w-full sm:w-[220px]" hideIconOnMobile />
      </View>

      {error && !clubs ? (
        <ErrorState message={error} actionLabel="Încearcă din nou" onAction={() => void load()} />
      ) : !clubs ? (
        <View className="gap-2" accessibilityRole="progressbar" accessibilityLabel="Se încarcă cluburile">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[64px] w-full rounded-[12px]" />)}
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="apartment"
          title={clubs.length === 0 ? 'Niciun club încă' : 'Niciun club găsit'}
          message={clubs.length === 0 ? 'Creează primul club, apoi invită-i administratorul.' : search ? `Nimic pentru „${searchValue.trim()}”.` : 'Niciun club nu se potrivește filtrului.'}
          actionLabel={clubs.length === 0 ? 'Club nou' : undefined}
          onAction={clubs.length === 0 ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <>
          <ListShell
            header={(
              <>
                <HeaderCell flex={2.4}>Club</HeaderCell>
                <HeaderCell>Conturi</HeaderCell>
                <HeaderCell flex={1.4}>{`Activi în ${monthLabel(month, true)}`}</HeaderCell>
                <HeaderCell flex={1.2}>Ultima activitate</HeaderCell>
                <HeaderCell align="right">De facturat</HeaderCell>
                <View className="w-7" />
              </>
            )}
          >
            {pager.pageItems.map((club, index) => (
              <Pressable
                key={club.id}
                onPress={() => router.push(`/super-admin/clubs/${club.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Deschide ${club.name}`}
                className="home-row flex-row items-center gap-3 px-3 md:px-3 py-3 hover:bg-[var(--c-surface-2)]"
                style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}
              >
                <View className="flex-1 md:flex-[2.4] min-w-0 flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <MaterialIcons name="apartment" size={17} color="var(--c-brand-fg)" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5 min-w-0">
                      <Text className="text-[14px] font-semibold shrink" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{club.name}</Text>
                      {club.flags.noAdmin ? <FlagPill label="Fără admin" tone="danger" /> : null}
                    </View>
                    <Text className="t-meta hidden md:flex" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                      {plural(club.teams, 'echipă', 'echipe')} · {plural(club.rosterPlayers, 'jucător', 'jucători')} în lot
                    </Text>
                    {/* Phones: the numbers that matter, under the name. */}
                    <Text className="t-meta md:hidden" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                      {formatNumber(club.activeThisMonth)} activi / {plural(club.accounts.total, 'cont', 'conturi')}
                      {club.estimatedAmount != null ? ` · ${formatMoney(club.estimatedAmount)}` : ''}
                    </Text>
                  </View>
                </View>

                <View className="hidden md:flex flex-1 min-w-0">
                  <Text className="text-[13px] font-semibold t-num" style={{ color: 'var(--c-ink)' }}>{formatNumber(club.accounts.total)}</Text>
                  {club.accounts.disabled ? <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>{formatNumber(club.accounts.disabled)} dezactivate</Text> : null}
                </View>
                <View className="hidden md:flex flex-[1.4] min-w-0 pr-4 gap-1">
                  <Text className="text-[13px] font-semibold t-num" style={{ color: 'var(--c-ink)' }}>{formatNumber(club.activeThisMonth)}</Text>
                  <Meter value={club.activeThisMonth} max={maxActive} />
                </View>
                <View className="hidden md:flex flex-[1.2] min-w-0">
                  <Text className="text-[13px]" style={{ color: club.flags.dormant ? 'var(--c-warning-fg)' : 'var(--c-ink-soft)' }} numberOfLines={1}>
                    {formatRelative(club.lastActivityAt)}
                  </Text>
                </View>
                <View className="hidden md:flex flex-1 min-w-0 items-end">
                  {club.estimatedAmount != null ? (
                    <Text className="text-[13px] font-semibold t-num" style={{ color: 'var(--c-ink)' }}>{formatMoney(club.estimatedAmount)}</Text>
                  ) : (
                    <FlagPill label="Fără preț" tone="neutral" />
                  )}
                </View>
                <View className="home-arrow w-7 items-end shrink-0">
                  <MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" />
                </View>
              </Pressable>
            ))}
          </ListShell>
          <Pagination
            page={pager.page}
            totalPages={pager.totalPages}
            onPageChange={pager.setPage}
            rangeStart={pager.rangeStart}
            rangeEnd={pager.rangeEnd}
            total={pager.total}
            itemNoun="cluburi"
          />
        </>
      )}

      <CreateClubDialog
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(club) => router.push(`/super-admin/clubs/${club.id}`)}
      />
    </PageContainer>
  );
}
