import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { Activity, CreditCard, Download, Plus, UserPlus, Users } from 'lucide-react';
import { teamsApi, Player, RosterSummary, Team } from '../../services/teamsApi';
import { useResponsive } from '../../hooks/useResponsive';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import { dash } from '../../components/dashboard/dashboardTheme';
import { EmptyState, ErrorState, SkeletonBlock } from '../../components/dashboard/ScreenStates';
import AdminHero from '../../components/admin/AdminHero';
import RosterSummaryCard from '../../components/roster/RosterSummaryCard';
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
  buildAttendanceHelperText,
  getAttendanceRate,
  getCategoryLabel,
  getPaymentBucket,
  getPaymentBucketRank,
  getPaymentLabel,
  getTeamLabel,
  isPaymentPaid,
  isPlayerActive,
  isPlayerUnassigned,
  matchesAttendanceFilter,
} from '../../components/roster/rosterHelpers';

const PLAYERS_PER_PAGE = 24;
const UNASSIGNED_TEAM_FILTER = '__unassigned__';
const DEFAULT_STATUS_FILTER = 'active';

type AttendanceFilterValue = 'all' | 'high' | 'medium' | 'low';
type StatusFilterValue = 'active' | 'inactive' | 'all';
type PaymentFilterValue = 'all' | 'paid' | 'pending' | 'overdue';

export default function RosterScreen() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const { searchValue, setSearchValue, setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();

  const [players, setPlayers] = useState<Player[]>([]);
  const [summary, setSummary] = useState<RosterSummary | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [playerActionBusy, setPlayerActionBusy] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilterValue>(DEFAULT_STATUS_FILTER);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceFilterValue>('all');
  const [selectedPayment, setSelectedPayment] = useState<PaymentFilterValue>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [sortColumn, setSortColumn] = useState<RosterSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<RosterSortDirection>('asc');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkReassignSheet, setShowBulkReassignSheet] = useState(false);

  const fetchRosterData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [rosterData, summaryData, allTeams] = await Promise.all([
        teamsApi.getRoster(),
        teamsApi.getRosterSummary(),
        teamsApi.getTeams(),
      ]);

      setPlayers(rosterData);
      setSummary(summaryData);
      setTeams(allTeams);
    } catch (fetchError: any) {
      console.error('Fetch roster page data error:', fetchError);
      setError(fetchError?.message || 'Nu am putut încărca datele lotului.');
      setPlayers([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRosterData();
  }, [fetchRosterData]);

  useEffect(() => {
    setSearchPlaceholder('Caută sportivi, tricou, echipă, poziție sau status de plată...');
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
      'Elimină sportivul',
      `Elimini pe ${selectedPlayer.firstName} ${selectedPlayer.lastName} din lotul activ?`,
      [
        { text: 'Anulează', style: 'cancel' },
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
              Alert.alert('Eroare', removeError?.message || 'Sportivul nu a putut fi eliminat din lot.');
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
      Alert.alert('Eroare', restoreError?.message || 'Sportivul nu a putut fi restaurat la echipă.');
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
      Alert.alert(
        'Mementouri procesate',
        `${result.sent} ${result.sent === 1 ? 'memento a fost marcat' : 'mementouri au fost marcate'} pentru plățile restante.`
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
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

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

  const filteredPlayers = useMemo(
    () =>
      players.filter((player) => {
        const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
        const number = String(player.number || '').toLowerCase();
        const position = (player.position || '').toLowerCase();
        const category = getCategoryLabel(player).toLowerCase();
        const paymentLabel = getPaymentLabel(player.paymentStatus).toLowerCase();
        const teamLabel = getTeamLabel(player).toLowerCase();
        const attendanceRate = getAttendanceRate(player);
        const query = searchValue.toLowerCase().trim();

        const matchesSearch =
          !query || [fullName, number, position, category, paymentLabel, teamLabel].some((value) => value.includes(query));
        const matchesTeam =
          selectedTeam === 'all' ||
          (selectedTeam === UNASSIGNED_TEAM_FILTER ? isPlayerUnassigned(player) : getTeamLabel(player) === selectedTeam);
        const matchesStatus = selectedStatus === 'all' || isPlayerActive(player) === (selectedStatus === 'active');
        const matchesAttendance = matchesAttendanceFilter(attendanceRate, selectedAttendance);
        const matchesPayment = selectedPayment === 'all' || getPaymentBucket(player.paymentStatus) === selectedPayment;

        return matchesSearch && matchesTeam && matchesStatus && matchesAttendance && matchesPayment;
      }),
    [players, searchValue, selectedAttendance, selectedPayment, selectedStatus, selectedTeam]
  );

  const sortedPlayers = useMemo(() => {
    if (!sortColumn) return filteredPlayers;

    const sorted = [...filteredPlayers].sort((a, b) => {
      let result = 0;
      if (sortColumn === 'name') {
        result = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      } else if (sortColumn === 'attendance') {
        result = getAttendanceRate(a) - getAttendanceRate(b);
      } else if (sortColumn === 'payment') {
        result = getPaymentBucketRank(a.paymentStatus) - getPaymentBucketRank(b.paymentStatus);
      }
      return sortDirection === 'asc' ? result : -result;
    });

    return sorted;
  }, [filteredPlayers, sortColumn, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, selectedTeam, selectedStatus, selectedAttendance, selectedPayment, sortColumn, sortDirection]);

  const teamOptions = useMemo(() => {
    const uniqueTeams = Array.from(
      new Set(players.map((player) => getTeamLabel(player)).filter((team) => team !== 'Neasignat'))
    ).sort((a, b) => a.localeCompare(b));

    const hasUnassignedPlayers = players.some(isPlayerUnassigned);

    return [
      { label: 'Toate echipele', value: 'all' },
      ...(hasUnassignedPlayers ? [{ label: 'Neasignați', value: UNASSIGNED_TEAM_FILTER }] : []),
      ...uniqueTeams.map((team) => ({ label: team, value: team })),
    ];
  }, [players]);

  const statusOptions = useMemo(
    () => [
      { label: 'Activ', value: 'active' },
      { label: 'Inactiv', value: 'inactive' },
      { label: 'Toate', value: 'all' },
    ],
    []
  );

  const attendanceOptions = useMemo(
    () => [
      { label: 'Toate pragurile', value: 'all' },
      { label: '90%+', value: 'high' },
      { label: '75-89%', value: 'medium' },
      { label: 'Sub 75%', value: 'low' },
    ],
    []
  );

  const paymentOptions = useMemo(
    () => [
      { label: 'Toate', value: 'all' },
      { label: 'Plătit', value: 'paid' },
      { label: 'În așteptare', value: 'pending' },
      { label: 'Restanță', value: 'overdue' },
    ],
    []
  );

  const totalPages = Math.max(1, Math.ceil(sortedPlayers.length / PLAYERS_PER_PAGE));
  const paginatedPlayers = useMemo(() => {
    const start = (currentPage - 1) * PLAYERS_PER_PAGE;
    return sortedPlayers.slice(start, start + PLAYERS_PER_PAGE);
  }, [currentPage, sortedPlayers]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const allSelectedOnPage = paginatedPlayers.length > 0 && paginatedPlayers.every((player) => selectedIds.has(player.id));
  const someSelectedOnPage = paginatedPlayers.some((player) => selectedIds.has(player.id));

  const toggleSelectAllOnPage = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelectedOnPage) {
        paginatedPlayers.forEach((player) => next.delete(player.id));
      } else {
        paginatedPlayers.forEach((player) => next.add(player.id));
      }
      return next;
    });
  };

  const selectedPlayers = useMemo(() => players.filter((player) => selectedIds.has(player.id)), [players, selectedIds]);

  const handleBulkExportCsv = () => {
    downloadRosterCsv(selectedPlayers, 'lot-selectie.csv');
  };

  const handleExportFilteredCsv = () => {
    downloadRosterCsv(sortedPlayers, 'lot-jucatori.csv');
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
      'Elimină sportivii selectați',
      `Elimini ${selectedIds.size} ${selectedIds.size === 1 ? 'sportiv' : 'sportivi'} din lotul activ?`,
      [
        { text: 'Anulează', style: 'cancel' },
        {
          text: 'Elimină',
          style: 'destructive',
          onPress: async () => {
            setBulkBusy(true);
            try {
              await Promise.allSettled(Array.from(selectedIds).map((id) => teamsApi.removePlayerFromRoster(id)));
              clearSelection();
              await fetchRosterData();
            } finally {
              setBulkBusy(false);
            }
          },
        },
      ]
    );
  };

  const fallbackAverageAttendance = useMemo(() => {
    if (!players.length) return 0;
    const total = players.reduce((sum, player) => sum + getAttendanceRate(player), 0);
    return Math.round((total / players.length) * 10) / 10;
  }, [players]);

  const fallbackPendingPayments = useMemo(
    () => players.filter((player) => !isPaymentPaid(player.paymentStatus)).length,
    [players]
  );

  const attendanceValue = summary?.averageAttendance ?? fallbackAverageAttendance;
  const attendanceAthleteCount = summary?.athleteCount ?? players.length;
  const pendingPayments = summary?.pendingPayments ?? fallbackPendingPayments;
  const paidPlayers = players.length - fallbackPendingPayments;
  const rosterReadiness = players.length ? Math.round((paidPlayers / players.length) * 100) : 0;

  const hasActiveFilters =
    Boolean(searchValue.trim()) ||
    selectedTeam !== 'all' ||
    selectedStatus !== DEFAULT_STATUS_FILTER ||
    selectedAttendance !== 'all' ||
    selectedPayment !== 'all';

  // Header/mobile FAB wiring — put the currently-inert HeaderContext slots to real use.
  useEffect(() => {
    if (isMobile) {
      setHeaderActions(null);
      setMobileFab(
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          style={styles.mobileFab}
        >
          <UserPlus color="#FFFFFF" size={22} />
        </TouchableOpacity>
      );
      return;
    }

    setMobileFab(null);
    setHeaderActions(
      <View className="flex-row items-center gap-3">
        <View className="rounded-full px-3 py-2" style={{ backgroundColor: dash.lineSoft }}>
          <Text className="text-[11px] font-black" style={{ color: dash.inkSoft }}>
            {filteredPlayers.length} vizibili
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          className="dash-btn-hover h-11 flex-row items-center rounded-2xl px-4"
          style={{ backgroundColor: dash.accentBlue }}
        >
          <Plus color="#FFFFFF" size={16} />
          <Text className="ml-2 text-[13px] font-black text-white">Adaugă jucător</Text>
        </TouchableOpacity>
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, filteredPlayers.length]);

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

  if (error && !players.length) {
    return (
      <View style={styles.listContent}>
        <ErrorState title="Nu am putut încărca lotul" message={error} onRetry={fetchRosterData} />
      </View>
    );
  }

  const readinessPanel = (
    <View className={`mt-6 ${isMobile ? 'gap-3' : 'flex-row items-center gap-4'}`}>
      <View className="flex-1 rounded-[26px] border border-white/15 bg-white/10 p-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[10px] font-black uppercase tracking-widest text-blue-100">Pregătirea lotului</Text>
            <Text className="mt-2 text-4xl font-black text-white">{rosterReadiness}%</Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-white/15">
            <Users color="#FFFFFF" size={24} />
          </View>
        </View>
        <View className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
          <View className="h-full rounded-full bg-white" style={{ width: `${rosterReadiness}%` }} />
        </View>
      </View>
      <View className={`${isMobile ? 'flex-row' : ''} gap-3`}>
        <View className="flex-1 rounded-2xl bg-white/10 px-4 py-3">
          <Text className="text-[10px] font-black uppercase tracking-widest text-blue-100">Sportivi</Text>
          <Text className="mt-1 text-lg font-black text-white">{players.length}</Text>
        </View>
        <View className="flex-1 rounded-2xl bg-white/10 px-4 py-3">
          <Text className="text-[10px] font-black uppercase tracking-widest text-blue-100">Restanțe</Text>
          <Text className="mt-1 text-lg font-black text-white">{pendingPayments}</Text>
        </View>
      </View>
    </View>
  );

  const headerContent = (
    <>
      <AdminHero title="Lot de jucători" subtitle="Sportivi activi, vizibilitate asupra prezenței, alocare pe echipe și urmărirea plăților, într-o singură vedere operațională.">
        {readinessPanel}
      </AdminHero>

      <View className={`mb-6 gap-4 ${isMobile ? '' : 'flex-row'}`}>
        <RosterSummaryCard
          title="Prezență generală"
          value={`${attendanceValue.toFixed(1)}%`}
          subtitle={`${attendanceAthleteCount} sportivi incluși în calculul prezenței.`}
          helperText={buildAttendanceHelperText(summary)}
          icon={Activity}
          accent="blue"
        />
        <RosterSummaryCard
          title="Alerte de plată"
          value={String(pendingPayments)}
          subtitle={
            pendingPayments === 1
              ? '1 sportiv are momentan o plată restantă.'
              : `${pendingPayments} sportivi au momentan plăți restante.`
          }
          icon={CreditCard}
          accent="red"
          actionLabel={sendingReminders ? 'Se trimite...' : 'Trimite mementouri'}
          onActionPress={handleSendReminders}
          actionDisabled={sendingReminders}
        />
      </View>

      <View className="rounded-[32px] p-5" style={{ backgroundColor: dash.surface, ...dash.shadow.card }}>
        <View className={`mb-5 ${isMobile ? 'gap-4' : 'flex-row items-start justify-between'}`}>
          <View>
            <Text className="text-[30px] font-black" style={{ color: dash.ink }}>
              Sportivi
            </Text>
            <Text className="mt-1 text-[14px]" style={{ color: dash.muted }}>
              Afișezi {paginatedPlayers.length} din {sortedPlayers.length} sportivi
              {sortedPlayers.length !== players.length ? ` (lot total: ${players.length})` : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleExportFilteredCsv}
            className="dash-btn-hover flex-row items-center self-start rounded-2xl border px-4 py-3"
            style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}
          >
            <Download color={dash.inkSoft} size={16} />
            <Text className="ml-2 text-[13px] font-black" style={{ color: dash.inkSoft }}>
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
          onTeamChange={setSelectedTeam}
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
          <View className="gap-3">
            {players.length === 0 ? (
              <EmptyState title="Niciun sportiv în lot" message="Adaugă primul sportiv pentru a începe gestionarea prezenței și a plăților." icon="groups" />
            ) : paginatedPlayers.length ? (
              paginatedPlayers.map((item) => {
                const categoryLabel = getCategoryLabel(item);
                const attendanceRate = getAttendanceRate(item);
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
              })
            ) : (
              <EmptyState
                title={hasActiveFilters ? 'Niciun sportiv nu corespunde filtrelor curente.' : 'Niciun sportiv găsit.'}
                message="Încearcă alt nume, număr de tricou, echipă, poziție, status de plată sau interval de prezență."
                icon="groups"
              />
            )}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tableScrollContent}
            style={styles.tableScroll}
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
                {players.length === 0 ? (
                  <EmptyState title="Niciun sportiv în lot" message="Adaugă primul sportiv pentru a începe gestionarea prezenței și a plăților." icon="groups" />
                ) : paginatedPlayers.length ? (
                  paginatedPlayers.map((item) => {
                    const categoryLabel = getCategoryLabel(item);
                    const attendanceRate = getAttendanceRate(item);
                    const paymentStatus = item.paymentStatus || 'pending';

                    return (
                      <View key={item.id} style={styles.rowSpacer}>
                        <PlayerRow
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
                      </View>
                    );
                  })
                ) : (
                  <EmptyState
                    title={hasActiveFilters ? 'Niciun sportiv nu corespunde filtrelor curente.' : 'Niciun sportiv găsit.'}
                    message="Încearcă alt nume, număr de tricou, echipă, poziție, status de plată sau interval de prezență."
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
          totalItems={sortedPlayers.length}
          pageSize={PLAYERS_PER_PAGE}
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
        title="Mută sportivii selectați la echipa"
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
  },
  rowsWrap: {
    paddingTop: 12,
  },
  rowSpacer: {
    marginBottom: 12,
  },
  mobileFab: {
    position: 'absolute',
    bottom: 96,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: dash.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: dash.accentBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 30,
  },
});
