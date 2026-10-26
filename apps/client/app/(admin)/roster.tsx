import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Alert } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { Download, Plus } from 'lucide-react';
import { teamsApi, Player, RosterPage, RosterPageQuery, RosterSummary, Team } from '../../services/teamsApi';
import { useResponsive } from '../../hooks/useResponsive';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { dash } from '../../components/dashboard/dashboardTheme';
import { EmptyState, ErrorState, SkeletonBlock } from '../../components/dashboard/ScreenStates';
import PageHero, { GlassStat } from '../../components/admin/PageHero';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { DenseList } from '../../components/ui/DenseList';
import PlayerRow from '../../components/roster/PlayerRow';
import RosterPlayerCard from '../../components/roster/RosterPlayerCard';
import RosterFilters from '../../components/roster/RosterFilters';
import RosterFilterSheet from '../../components/roster/RosterFilterSheet';
import RosterPagination from '../../components/roster/RosterPagination';
import RosterTableHeader from '../../components/roster/RosterTableHeader';
import BulkActionBar from '../../components/roster/BulkActionBar';
import AddPlayerModal from '../../components/roster/AddPlayerModal';
import PlayerActionSheet from '../../components/roster/PlayerActionSheet';
import { ROSTER_TABLE_WIDTH, RosterSortColumn, RosterSortDirection } from '../../components/roster/rosterTableLayout';
import { downloadRosterCsv } from '../../components/roster/rosterCsv';
import {
  getAttendanceRate,
  getCategoryLabel,
  getPaymentLabel,
  isPaymentPaid,
  isPlayerActive,
} from '../../components/roster/rosterHelpers';
import { ATTENDANCE_PERIOD_LABEL, formatAttendanceRate } from '../../utils/attendanceRate';
import { plural } from '../../utils/plural';
import { loadFailureMessage } from '../../utils/errorMessages';

const PAGE_SIZE_OPTIONS = [12, 24, 48, 100];
const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_STORAGE_KEY = 'bcms.roster.pageSize';

function readStoredPageSize() {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return PAGE_SIZE_OPTIONS.includes(stored) ? stored : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}
const UNASSIGNED_TEAM_FILTER = '__unassigned__';
const DEFAULT_STATUS_FILTER = 'active';

type AttendanceFilterValue = 'all' | 'high' | 'medium' | 'low';
type StatusFilterValue = 'active' | 'inactive' | 'all';
type PaymentFilterValue = 'all' | 'paid' | 'pending' | 'overdue';

export default function RosterScreen() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const { searchValue, setSearchValue, setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();

  // One page of the roster at a time: the server searches, filters, sorts and
  // pages (it used to send the whole club, ~160 KB, on every visit).
  const [rosterPage, setRosterPage] = useState<RosterPage | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [summary, setSummary] = useState<RosterSummary | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  // Reminders notify families, so they go out only after a confirmation.
  const [confirmReminders, setConfirmReminders] = useState(false);
  const [playerActionBusy, setPlayerActionBusy] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilterValue>(DEFAULT_STATUS_FILTER);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceFilterValue>('all');
  const [selectedPayment, setSelectedPayment] = useState<PaymentFilterValue>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(readStoredPageSize);
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setCurrentPage(1);
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    } catch {}
  };

  const [sortColumn, setSortColumn] = useState<RosterSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<RosterSortDirection>('asc');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Rows the selection was made from, across pages (bulk CSV export).
  const selectedRows = useRef(new Map<number, Player>());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkReassignSheet, setShowBulkReassignSheet] = useState(false);

  // The search box is typed into: ask the server once typing pauses.
  const [debouncedSearch, setDebouncedSearch] = useState(searchValue);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchValue), 250);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const rosterQuery = useMemo<RosterPageQuery>(() => ({
    q: debouncedSearch.trim() || undefined,
    team: selectedTeam,
    status: selectedStatus,
    attendance: selectedAttendance,
    payment: selectedPayment,
    sort: sortColumn ?? undefined,
    dir: sortDirection,
    page: currentPage,
    pageSize,
  }), [currentPage, debouncedSearch, pageSize, selectedAttendance, selectedPayment, selectedStatus, selectedTeam, sortColumn, sortDirection]);
  const rosterQueryRef = useRef(rosterQuery);
  rosterQueryRef.current = rosterQuery;
  const pageRequest = useRef(0);

  const loadPage = useCallback(async (query: RosterPageQuery) => {
    const request = ++pageRequest.current;
    setPageLoading(true);
    try {
      const data = await teamsApi.getRosterPage(query);
      if (request !== pageRequest.current) return;
      setRosterPage(data);
      setError(null);
      // Past the last page (a filter shrank the list): the server answered the last one.
      if (data.page !== query.page) setCurrentPage(data.page);
    } catch (fetchError: any) {
      if (request !== pageRequest.current) return;
      console.error('Fetch roster page error:', fetchError);
      setError(loadFailureMessage(fetchError));
    } finally {
      if (request === pageRequest.current) setPageLoading(false);
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [summaryData, allTeams] = await Promise.all([teamsApi.getRosterSummary(), teamsApi.getTeams()]);
      setSummary(summaryData);
      setTeams(allTeams);
    } catch (fetchError: any) {
      console.error('Fetch roster summary error:', fetchError);
      setError(loadFailureMessage(fetchError));
      setSummary(null);
    }
  }, []);

  /** After a change (add, remove, reminders): the header counts and the page on screen. */
  const fetchRosterData = useCallback(async () => {
    await Promise.all([fetchMeta(), loadPage(rosterQueryRef.current)]);
  }, [fetchMeta, loadPage]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    loadPage(rosterQuery);
  }, [loadPage, rosterQuery]);

  const loading = !rosterPage && !error;

  useEffect(() => {
    setSearchPlaceholder('Caută după nume, tricou, echipă sau plată...');
    setSearchValue('');

    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setHeaderActions(null);
      setMobileFab(null);
      setSearchValue('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenActions = (player: Player) => {
    setSelectedPlayer(player);
    setShowActionModal(true);
  };

  const handleOpenEdit = () => {
    if (!selectedPlayer) return;
    setShowActionModal(false);
    router.push(`/admin/player/${selectedPlayer.id}?returnTo=/admin/roster`);
  };

  const handleOpenAttendanceLog = () => {
    if (!selectedPlayer) return;
    setShowActionModal(false);
    router.push(`/admin/player/${selectedPlayer.id}?focus=attendance&returnTo=/admin/roster`);
  };

  const handleOpenPayments = () => {
    if (!selectedPlayer) return;
    setShowActionModal(false);
    setSearchValue(`${selectedPlayer.firstName} ${selectedPlayer.lastName}`.trim());
    router.push('/admin/finance');
  };

  const handleRemoveFromClub = () => {
    if (!selectedPlayer) return;

    Alert.alert(
      'Elimină jucătorul',
      `Elimini pe ${selectedPlayer.firstName} ${selectedPlayer.lastName} din lotul activ?`,
      [
        { text: 'Renunță', style: 'cancel' },
        {
          text: 'Elimină',
          style: 'destructive',
          onPress: async () => {
            try {
              setPlayerActionBusy(true);
              await teamsApi.removePlayerFromRoster(selectedPlayer.id);
              setShowActionModal(false);
              setSelectedPlayer(null);
              await fetchRosterData();
            } catch (removeError: any) {
              console.error('Remove player error:', removeError);
              Alert.alert('Eroare', removeError?.message || 'Jucătorul nu a putut fi eliminat din lot.');
            } finally {
              setPlayerActionBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleRestorePlayer = async (teamId: number) => {
    if (!selectedPlayer) return;

    try {
      setPlayerActionBusy(true);
      await teamsApi.addPlayerToTeam(selectedPlayer.id, teamId);
      setShowActionModal(false);
      setSelectedPlayer(null);
      await fetchRosterData();
    } catch (restoreError: any) {
      console.error('Restore player error:', restoreError);
      Alert.alert('Eroare', restoreError?.message || 'Jucătorul nu a putut fi restaurat la echipă.');
    } finally {
      setPlayerActionBusy(false);
    }
  };

  const handlePlayerPress = (player: Player) => {
    router.push(`/admin/player/${player.id}?returnTo=/admin/roster`);
  };

  const handleSendReminders = async () => {
    if (sendingReminders) return;

    try {
      setSendingReminders(true);
      const result = await teamsApi.sendPaymentReminders();
      const owing = result.players ?? result.recipients.length;
      const skipped = result.skipped ?? 0;
      Alert.alert(
        owing ? 'Mementouri trimise' : 'Nicio plată de amintit',
        owing
          ? `${plural(result.sent, 'notificare trimisă', 'notificări trimise')} pentru ${plural(owing, 'jucător cu restanțe', 'jucători cu restanțe')} (jucătorilor și părinților lor).${skipped ? ` ${plural(skipped, 'cont a primit', 'conturi au primit')} deja un memento în ultimele 7 zile.` : ''}`
          : 'Nimeni nu are restanțe. Plățile care nu au ajuns la scadență nu primesc memento.'
      );
      await fetchRosterData();
    } catch (reminderError: any) {
      console.error('Send reminders error:', reminderError);
      Alert.alert('Eroare', reminderError?.message || 'Mementourile de plată nu au putut fi procesate.');
    } finally {
      setSendingReminders(false);
    }
  };

  const toggleSelect = (id: number) => {
    const row = rosterPage?.items.find((player) => player.id === id);
    if (row) selectedRows.current.set(id, row);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    selectedRows.current.clear();
    setSelectedIds(new Set());
  };

  const handleSort = (column: RosterSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleResetFilters = () => {
    setSearchValue('');
    setSelectedTeam('all');
    setSelectedStatus(DEFAULT_STATUS_FILTER);
    setSelectedAttendance('all');
    setSelectedPayment('all');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, selectedTeam, selectedStatus, selectedAttendance, selectedPayment, sortColumn, sortDirection]);

  const teamOptions = useMemo(() => [
    { label: 'Toate echipele', value: 'all' },
    ...(rosterPage?.hasUnassigned ? [{ label: 'Neasignați', value: UNASSIGNED_TEAM_FILTER }] : []),
    ...(rosterPage?.teams ?? []).map((team) => ({ label: team, value: team })),
  ], [rosterPage?.hasUnassigned, rosterPage?.teams]);

  const statusOptions = useMemo(
    () => [
      { label: 'Activ', value: 'active' },
      { label: 'Inactiv', value: 'inactive' },
      { label: 'Toți jucătorii', value: 'all' },
    ],
    []
  );

  const attendanceOptions = useMemo(
    () => [
      { label: 'Orice prezență', value: 'all' },
      { label: '90%+', value: 'high' },
      { label: '75-89%', value: 'medium' },
      { label: 'Sub 75%', value: 'low' },
    ],
    []
  );

  const paymentOptions = useMemo(
    () => [
      { label: 'Orice plată', value: 'all' },
      { label: 'Plătit', value: 'paid' },
      { label: 'De plată', value: 'pending' },
      { label: 'Restanță', value: 'overdue' },
    ],
    []
  );

  const paginatedPlayers = rosterPage?.items ?? [];
  const filteredTotal = rosterPage?.total ?? 0;
  const rosterTotal = rosterPage?.rosterTotal ?? 0;
  const totalPages = rosterPage?.totalPages ?? 1;

  const allSelectedOnPage = paginatedPlayers.length > 0 && paginatedPlayers.every((player) => selectedIds.has(player.id));
  const someSelectedOnPage = paginatedPlayers.some((player) => selectedIds.has(player.id));

  const toggleSelectAllOnPage = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelectedOnPage) {
        paginatedPlayers.forEach((player) => {
          next.delete(player.id);
          selectedRows.current.delete(player.id);
        });
      } else {
        paginatedPlayers.forEach((player) => {
          next.add(player.id);
          selectedRows.current.set(player.id, player);
        });
      }
      return next;
    });
  };

  const handleBulkExportCsv = () => {
    const selectedPlayers = Array.from(selectedIds)
      .map((id) => selectedRows.current.get(id))
      .filter((player): player is Player => Boolean(player));
    downloadRosterCsv(selectedPlayers, 'lot-selectie.csv');
  };

  // Every player matching the filters, in the order on screen — one request, on demand.
  const handleExportFilteredCsv = async () => {
    try {
      const all = await teamsApi.getRosterPage({ ...rosterQueryRef.current, page: 1, pageSize: 'all' });
      downloadRosterCsv(all.items, 'lot-jucatori.csv');
    } catch (exportError: any) {
      Alert.alert('Eroare', exportError?.message || 'Exportul nu a putut fi generat.');
    }
  };

  const handleBulkReassign = async (teamIdRaw: string) => {
    const teamId = Number(teamIdRaw);
    if (!teamId || selectedIds.size === 0) return;

    setShowBulkReassignSheet(false);
    setBulkBusy(true);
    try {
      await Promise.allSettled(Array.from(selectedIds).map((id) => teamsApi.addPlayerToTeam(id, teamId)));
      clearSelection();
      await fetchRosterData();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkRemove = () => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      'Elimini selecția din lot?',
      `Elimini ${plural(selectedIds.size, 'jucător', 'jucători')} din lotul activ?`,
      [
        { text: 'Renunță', style: 'cancel' },
        {
          text: 'Elimină',
          style: 'destructive',
          onPress: async () => {
            setBulkBusy(true);
            try {
              const results = await Promise.allSettled(Array.from(selectedIds).map((id) => teamsApi.removePlayerFromRoster(id)));
              const failed = results.filter((result) => result.status === 'rejected').length;
              clearSelection();
              await fetchRosterData();
              if (failed) {
                const done = results.length - failed;
                const reason = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
                Alert.alert(
                  'Eliminare parțială',
                  `Am eliminat ${done} din ${plural(results.length, 'jucător', 'jucători')}. Pentru ${failed} eliminarea nu a mers${reason instanceof Error && reason.message ? `: ${reason.message}` : '.'}`,
                );
              }
            } finally {
              setBulkBusy(false);
            }
          },
        },
      ]
    );
  };

  // Restanțe = players with something past due, the same definition as
  // Finanțe and the dashboard; owing a fee that is not due yet is not late.
  // Both come from the roster summary (the whole roster, not this page).
  // Attendance is the dashboard's rate: the last 30 days, pooled.
  const attendanceValue = summary ? summary.attendance?.rate ?? summary.averageAttendance ?? null : null;
  const pendingPayments = summary?.pendingPayments ?? 0;
  const paidPlayers = rosterTotal - Math.min(rosterTotal, pendingPayments);
  const rosterReadiness = rosterTotal ? Math.round((paidPlayers / rosterTotal) * 100) : 0;

  const hasActiveFilters =
    Boolean(searchValue.trim()) ||
    selectedTeam !== 'all' ||
    selectedStatus !== DEFAULT_STATUS_FILTER ||
    selectedAttendance !== 'all' ||
    selectedPayment !== 'all';

  // Header/mobile FAB wiring — put the currently-inert HeaderContext slots to real use.
  // "Adaugă jucător" itself lives in PageHero's actions (desktop) and this FAB
  // (mobile), fixed to the viewport above the bottom nav — same geometry as the
  // Program screen's "+ Eveniment" FAB, so both add actions match.
  useEffect(() => {
    if (isMobile) {
      setHeaderActions(null);
      setMobileFab(
        <Pressable
          onPress={() => setShowAddModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Adaugă jucător"
          className="ui-press"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
            height: 48,
            paddingLeft: 16,
            paddingRight: 18,
            borderRadius: 999,
            backgroundColor: 'var(--c-brand-surface)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            boxShadow: 'var(--e-lg)',
            zIndex: 30,
          } as any}
        >
          <Plus color="#FFFFFF" size={18} strokeWidth={2.6} />
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' } as any}>Jucător</Text>
        </Pressable>
      );
      return;
    }

    setMobileFab(null);
    setHeaderActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  if (loading) {
    return (
      <View style={styles.listContent}>
        <View className="mb-6 rounded-[32px] p-8" style={{ backgroundColor: dash.surface, ...dash.shadow.card }}>
          <SkeletonBlock width="30%" height={14} />
          <SkeletonBlock width="55%" height={36} style={{ marginTop: 12 }} />
        </View>
        <View className={`mb-6 gap-4 ${isMobile ? '' : 'flex-row'}`}>
          <SkeletonBlock height={150} />
          <SkeletonBlock height={150} />
        </View>
        <View className="gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} height={72} />
          ))}
        </View>
      </View>
    );
  }

  if (error && !rosterPage) {
    return (
      <View style={styles.listContent}>
        <ErrorState title="Nu am putut încărca lotul" message={error} onRetry={fetchRosterData} />
      </View>
    );
  }

  const headerContent = (
    <>
      <PageHero
        eyebrow="Lot"
        title="Lotul de jucători"
        subtitle="Prezență, echipe și plăți, într-o singură vedere."
        actions={
          <View className="flex-row items-center gap-2">
            {pendingPayments > 0 ? (
              <Button
                icon="notifications-active"
                label={`Trimite mementouri (${pendingPayments})`}
                variant="secondary"
                loading={sendingReminders}
                onPress={() => setConfirmReminders(true)}
              />
            ) : null}
            {/* Phones use the floating „+ Jucător”: here the button was cut to "Adaugă jucă…" and repeated it. */}
            <Button icon="add" label="Adaugă jucător" variant="primary" className="hidden sm:flex" onPress={() => setShowAddModal(true)} />
          </View>
        }
      >
        <View className="grid grid-cols-2 lg:grid-cols-4 gap-2 ui-stagger">
          <GlassStat dot="var(--c-brand-fg)" value={formatAttendanceRate(attendanceValue)} label="Prezență" hint={ATTENDANCE_PERIOD_LABEL.toLowerCase()} />
          <GlassStat dot="var(--c-success)" value={`${rosterReadiness}%`} label="Fără restanțe" bar={rosterReadiness} />
          <GlassStat dot="var(--c-muted)" value={rosterTotal} label="Jucători în lot" />
          <GlassStat dot={pendingPayments > 0 ? 'var(--c-danger)' : 'var(--c-success)'} danger={pendingPayments > 0} value={pendingPayments} label="Cu restanțe" />
        </View>
      </PageHero>

      <View className="rounded-[16px] p-4 border" style={{ backgroundColor: dash.surface, borderColor: dash.hairlineStrong, ...dash.shadow.sm }}>
        <View className={`mb-4 ${isMobile ? 'gap-3' : 'flex-row items-center justify-between'}`}>
          <View>
            <Text accessibilityRole="header" className="f-display text-[17px] font-bold" style={{ color: dash.ink, letterSpacing: '-0.015em' } as any}>
              Jucători
            </Text>
            <Text className="mt-0.5 text-[13px]" style={{ color: dash.muted }}>
              Afișezi {paginatedPlayers.length} din {plural(filteredTotal, 'jucător', 'jucători')}
              {filteredTotal !== rosterTotal ? ` (lot total: ${rosterTotal})` : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { void handleExportFilteredCsv(); }}
            className="dash-btn-hover flex-row items-center self-start rounded-[10px] border h-9 [@media(pointer:coarse)]:h-10 px-3"
            style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairlineStrong }}
          >
            <Download color={dash.inkSoft} size={15} />
            <Text className="ml-2 text-[12px] font-semibold" style={{ color: dash.inkSoft }}>
              Exportă CSV
            </Text>
          </TouchableOpacity>
        </View>

        <RosterFilters
          teamOptions={teamOptions}
          statusOptions={statusOptions}
          attendanceOptions={attendanceOptions}
          paymentOptions={paymentOptions}
          selectedTeam={selectedTeam}
          selectedStatus={selectedStatus}
          selectedAttendance={selectedAttendance}
          selectedPayment={selectedPayment}
          onTeamChange={(value) => {
            setSelectedTeam(value);
            if (value === UNASSIGNED_TEAM_FILTER) setSelectedStatus('all');
          }}
          onStatusChange={(value) => setSelectedStatus(value as StatusFilterValue)}
          onAttendanceChange={(value) => setSelectedAttendance(value as AttendanceFilterValue)}
          onPaymentChange={(value) => setSelectedPayment(value as PaymentFilterValue)}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={handleResetFilters}
        />

        <BulkActionBar
          selectedCount={selectedIds.size}
          busy={bulkBusy}
          onExportCsv={handleBulkExportCsv}
          onReassign={() => setShowBulkReassignSheet(true)}
          onRemove={handleBulkRemove}
          onClear={clearSelection}
        />

        {isMobile ? (
          <View className="gap-3" style={{ opacity: pageLoading ? 0.6 : 1, transition: 'opacity 120ms' } as any} aria-busy={pageLoading}>
            {rosterTotal === 0 ? (
              <EmptyState title="Niciun jucător în lot" message="Adaugă primul jucător pentru a începe gestionarea prezenței și a plăților." icon="groups" />
            ) : paginatedPlayers.length ? (
              <DenseList label="Jucători">
              {paginatedPlayers.map((item) => {
                const categoryLabel = getCategoryLabel(item);
                const attendanceRate = typeof item.attendanceRate === 'number' ? getAttendanceRate(item) : null;
                const paymentStatus = item.paymentStatus || 'pending';

                return (
                  <RosterPlayerCard
                    key={item.id}
                    player={item}
                    categoryLabel={categoryLabel}
                    attendanceRate={attendanceRate}
                    paymentLabel={getPaymentLabel(paymentStatus)}
                    paymentPaid={isPaymentPaid(paymentStatus)}
                    isActive={isPlayerActive(item)}
                    showStatusChip={selectedStatus === 'all'}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onPress={() => handlePlayerPress(item)}
                    onEdit={() => handleOpenActions(item)}
                  />
                );
              })}
              </DenseList>
            ) : (
              <EmptyState
                title={hasActiveFilters ? 'Niciun jucător nu corespunde filtrelor curente.' : 'Niciun jucător găsit.'}
                message="Încearcă alt nume, număr de tricou, echipă, status de plată sau interval de prezență."
                icon="groups"
              />
            )}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tableScrollContent}
            style={[styles.tableScroll, { opacity: pageLoading ? 0.6 : 1, transition: 'opacity 120ms' } as any]}
          >
            <View style={styles.tableArea}>
              <RosterTableHeader
                allSelected={allSelectedOnPage}
                someSelected={someSelectedOnPage}
                onToggleSelectAll={toggleSelectAllOnPage}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <View style={styles.rowsWrap}>
                {rosterTotal === 0 ? (
                  <EmptyState title="Niciun jucător în lot" message="Adaugă primul jucător pentru a începe gestionarea prezenței și a plăților." icon="groups" />
                ) : paginatedPlayers.length ? (
                  paginatedPlayers.map((item) => {
                    const attendanceRate = typeof item.attendanceRate === 'number' ? getAttendanceRate(item) : null;
                    const paymentStatus = item.paymentStatus || 'pending';

                    return (
                      <View key={item.id} style={styles.rowSpacer}>
                        <PlayerRow
                          player={item}
                          attendanceRate={attendanceRate}
                          paymentLabel={getPaymentLabel(paymentStatus)}
                          paymentPaid={isPaymentPaid(paymentStatus)}
                          isActive={isPlayerActive(item)}
                          showStatusChip={selectedStatus === 'all'}
                          selected={selectedIds.has(item.id)}
                          onToggleSelect={() => toggleSelect(item.id)}
                          onPress={() => handlePlayerPress(item)}
                          onEdit={() => handleOpenActions(item)}
                        />
                      </View>
                    );
                  })
                ) : (
                  <EmptyState
                    title={hasActiveFilters ? 'Niciun jucător nu corespunde filtrelor curente.' : 'Niciun jucător găsit.'}
                    message="Încearcă alt nume, număr de tricou, echipă, status de plată sau interval de prezență."
                    icon="groups"
                  />
                )}
              </View>
            </View>
          </ScrollView>
        )}

        <RosterPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredTotal}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={setPageSize}
          onPageChange={setCurrentPage}
        />
      </View>
    </>
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.listContent} style={styles.screen}>
        {headerContent}
      </ScrollView>

      <ConfirmDialog
        visible={confirmReminders}
        title="Trimiți mementouri de plată?"
        message={`${pendingPayments === 1 ? 'Jucătorul cu restanțe primește' : `Cei ${plural(pendingPayments, 'jucător', 'jucători')} cu restanțe primesc`}, împreună cu părinții, o notificare în aplicație. Cine a primit deja un memento în ultimele 7 zile nu îl mai primește acum.`}
        confirmLabel="Trimite mementouri"
        icon="notifications-active"
        loading={sendingReminders}
        onConfirm={() => { void handleSendReminders().finally(() => setConfirmReminders(false)); }}
        onCancel={() => { if (!sendingReminders) setConfirmReminders(false); }}
      />

      <AddPlayerModal
        visible={showAddModal}
        teams={teams}
        initialTeamId={teams[0]?.id ?? null}
        onClose={() => setShowAddModal(false)}
        onAdded={fetchRosterData}
      />

      <PlayerActionSheet
        visible={showActionModal}
        player={selectedPlayer}
        teams={teams}
        busy={playerActionBusy}
        onClose={() => setShowActionModal(false)}
        onEdit={handleOpenEdit}
        onAttendanceLog={handleOpenAttendanceLog}
        onPayments={handleOpenPayments}
        onRemove={handleRemoveFromClub}
        onRestore={handleRestorePlayer}
      />

      <RosterFilterSheet
        visible={showBulkReassignSheet}
        title="Mută selecția la echipa"
        icon="groups"
        items={teams.map((team) => ({ id: String(team.id), label: team.name }))}
        selectedId={null}
        onSelect={handleBulkReassign}
        onClose={() => setShowBulkReassignSheet(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: dash.bg,
  },
  listContent: {
    width: '100%',
    padding: 20,
    paddingBottom: 96,
  },
  tableScroll: {
    width: '100%',
  },
  tableScrollContent: {
    width: '100%',
    minWidth: '100%',
  },
  tableArea: {
    width: '100%',
    minWidth: ROSTER_TABLE_WIDTH,
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  rowsWrap: {
    marginBottom: -1,
  },
  rowSpacer: {},
});
