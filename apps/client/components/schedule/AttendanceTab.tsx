import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from '@/src/web/reactNative';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  AlertCircle,
  BriefcaseMedical,
  Minus,
} from 'lucide-react';
import { useRouter } from '@/src/web/expoRouter';
import { teamsApi, Team, Player } from '../../services/teamsApi';
import { eventsApi, CalendarEvent } from '../../services/eventsApi';
import {
  addDays,
  computeDailyAttendance,
  normalizeAttendanceStatus,
  AggregateAttendance,
  formatDateKey,
  getIsoWeekNumber,
  getWeekDaysFromDate,
} from '../../utils/attendanceHelpers';
import { AttendanceDetailsModal } from './AttendanceDetailsModal';
import { useResponsive } from '../../hooks/useResponsive';
import { RO_LOCALE, RO_MONTHS } from './scheduleShared';
import { Skeleton } from '../ui/Skeleton';

interface AttendanceTabProps {
  events: CalendarEvent[];
  teams: Team[];
  initialTeamId?: number | null;
}

type MobilePeriodMode = 'week' | 'month';

export function AttendanceTab({ events, teams, initialTeamId }: AttendanceTabProps) {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const [focusedDate, setFocusedDate] = useState(new Date());
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    initialTeamId ?? (teams.length > 0 ? teams[0].id : null)
  );

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<Record<number, any[]>>({});

  // Year-wide attendance used for the "current year" and "selected month" stat
  // cards. Loaded once per team/year (independent of the week the matrix shows).
  const [yearEvents, setYearEvents] = useState<CalendarEvent[]>([]);
  const [yearAttendance, setYearAttendance] = useState<Record<number, any[]>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  const [mobilePeriodMode, setMobilePeriodMode] = useState<MobilePeriodMode>('week');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState<{ player: Player; date: Date; details: any[] } | null>(null);

  const months = RO_MONTHS;

  const viewYear = focusedDate.getFullYear();
  const viewMonth = focusedDate.getMonth();

  const currentWeekDays = useMemo(() => getWeekDaysFromDate(focusedDate), [focusedDate]);
  const weekStartDate = currentWeekDays[0];
  const weekEndDate = currentWeekDays[currentWeekDays.length - 1];
  const weekNumber = useMemo(() => getIsoWeekNumber(focusedDate), [focusedDate]);
  const currentWeekDayKeys = useMemo(() => currentWeekDays.map((day) => formatDateKey(day)), [currentWeekDays]);
  const currentWeekDayKeySet = useMemo(() => new Set(currentWeekDayKeys), [currentWeekDayKeys]);

  const mobilePeriodDays = useMemo(() => {
    if (mobilePeriodMode === 'week') return currentWeekDays;
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const days: Date[] = [];

    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(viewYear, viewMonth, day));
    }

    return days.length > 0 ? days : [firstDay];
  }, [mobilePeriodMode, currentWeekDays, viewMonth, viewYear]);

  const mobilePeriodDayKeys = useMemo(() => mobilePeriodDays.map((day) => formatDateKey(day)), [mobilePeriodDays]);
  const mobilePeriodDayKeySet = useMemo(() => new Set(mobilePeriodDayKeys), [mobilePeriodDayKeys]);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || null;
  const selectedTeamName = selectedTeam?.name || 'Alege o echipă';
  const weekLabel = `Săpt. ${weekNumber}`;

  const activePeriodDayKeys = isMobile ? mobilePeriodDayKeys : currentWeekDayKeys;
  const activePeriodDayKeySet = isMobile ? mobilePeriodDayKeySet : currentWeekDayKeySet;


  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  useEffect(() => {
    // Dropped when the team/period changes mid-flight, so a slow response for
    // the previous selection can't overwrite the current one.
    let cancelled = false;

    async function loadData() {
      if (!selectedTeamId) return;
      setLoading(true);
      setLoadError(null);

      try {
        const periodEvents = events.filter((event) => {
          if (event.teamId !== selectedTeamId || event.type !== 'training') return false;
          return activePeriodDayKeySet.has(event.startTime.split('T')[0]);
        });

        // Roster and the whole period's sheets in parallel, one batch request
        // for the sheets instead of one per session.
        const [roster, newAttendanceData] = await Promise.all([
          teamsApi.getTeamPlayers(selectedTeamId),
          eventsApi.getAttendanceForEvents(periodEvents.map((event) => event.id)),
        ]);
        if (cancelled) return;

        setPlayers(roster);
        setAttendanceData(newAttendanceData);
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading attendance data', error);
        setLoadError('Nu s-au putut încărca datele de prezență pentru această perioadă.');
        setPlayers([]);
        setAttendanceData({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [selectedTeamId, events, activePeriodDayKeySet]);

  // Load all training sessions + attendance for the whole viewed year, once per
  // team/year, so the year and month stat cards don't depend on the current week.
  useEffect(() => {
    if (!selectedTeamId) {
      setYearEvents([]);
      setYearAttendance({});
      return;
    }

    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const evs = await eventsApi.getEvents({
          teamId: selectedTeamId,
          type: 'training',
          start: `${viewYear}-01-01`,
          end: `${viewYear}-12-31`,
        });
        if (cancelled) return;
        setYearEvents(evs);

        // A year of trainings was one request per session (100+ on open);
        // now one batched request per 200 sessions.
        const att = await eventsApi.getAttendanceForEvents(evs.map((ev) => ev.id));
        if (!cancelled) setYearAttendance(att);
      } catch (error) {
        console.error('Error loading yearly attendance stats', error);
        if (!cancelled) {
          setYearEvents([]);
          setYearAttendance({});
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedTeamId, viewYear]);

  // Session-level present ÷ (present + absent) across a set of events, matching
  // the headline rate definition (medical/pending excluded).
  const rateOverEvents = useMemo(() => (evList: CalendarEvent[]) => {
    let present = 0;
    let absent = 0;
    for (const ev of evList) {
      for (const record of yearAttendance[ev.id] || []) {
        const status = normalizeAttendanceStatus(record?.status);
        if (status === 'present') present++;
        else if (status === 'absent') absent++;
      }
    }
    const denom = present + absent;
    return { present, denom, rate: denom > 0 ? (present / denom) * 100 : 0 };
  }, [yearAttendance]);

  const yearStat = useMemo(() => rateOverEvents(yearEvents), [rateOverEvents, yearEvents]);
  const monthStat = useMemo(
    () => rateOverEvents(yearEvents.filter((ev) => {
      const d = new Date(ev.startTime);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    })),
    [rateOverEvents, yearEvents, viewYear, viewMonth]
  );

  const weeklyEventsByDay = useMemo(() => {
    const byDay: Record<string, CalendarEvent[]> = {};

    for (const key of currentWeekDayKeys) {
      byDay[key] = [];
    }

    for (const event of events) {
      if (event.teamId !== selectedTeamId || event.type !== 'training') continue;
      const eventDateStr = event.startTime.split('T')[0];
      if (byDay[eventDateStr]) {
        byDay[eventDateStr].push(event);
      }
    }

    return byDay;
  }, [currentWeekDayKeys, events, selectedTeamId]);

  const activeEventsByDay = useMemo(() => {
    const byDay: Record<string, CalendarEvent[]> = {};

    for (const key of activePeriodDayKeys) {
      byDay[key] = [];
    }

    for (const event of events) {
      if (event.teamId !== selectedTeamId || event.type !== 'training') continue;
      const eventDateStr = event.startTime.split('T')[0];
      if (byDay[eventDateStr]) {
        byDay[eventDateStr].push(event);
      }
    }

    return byDay;
  }, [activePeriodDayKeys, events, selectedTeamId]);

  const playerAttendanceGrid = useMemo(() => {
    return players.reduce<Record<number, Record<string, AggregateAttendance>>>((acc, player) => {
      acc[player.id] = {};
      for (const key of currentWeekDayKeys) {
        acc[player.id][key] = computeDailyAttendance(player.id, weeklyEventsByDay[key] || [], attendanceData);
      }
      return acc;
    }, {});
  }, [attendanceData, currentWeekDayKeys, players, weeklyEventsByDay]);

  const playerAttendanceForActivePeriod = useMemo(() => {
    return players.reduce<Record<number, Record<string, AggregateAttendance>>>((acc, player) => {
      acc[player.id] = {};
      for (const key of activePeriodDayKeys) {
        acc[player.id][key] = computeDailyAttendance(player.id, activeEventsByDay[key] || [], attendanceData);
      }
      return acc;
    }, {});
  }, [activeEventsByDay, activePeriodDayKeys, attendanceData, players]);

  const summary = useMemo(() => {
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalMedical = 0;
    let totalPartial = 0;
    let totalPending = 0;

    for (const player of players) {
      for (const key of activePeriodDayKeys) {
        const status = playerAttendanceForActivePeriod[player.id]?.[key]?.status;
        if (status === 'present') totalPresent++;
        if (status === 'absent') totalAbsent++;
        if (status === 'medical') totalMedical++;
        if (status === 'partial') totalPartial++;
        if (status === 'pending') totalPending++;
      }
    }

    // Rate model (varianta A): medical/scutit iese din numitor (neutru, nu penalizează
    // și nu umflă), partial = 0.5, iar pending (prezență neluată) nu intră deloc în calcul —
    // ca să nu mai apară o rată mare când prezența nici nu a fost făcută.
    const totalPossible = totalPresent + totalAbsent + totalPartial;
    const attendanceRate =
      totalPossible > 0 ? ((totalPresent + (totalPartial * 0.5)) / totalPossible * 100).toFixed(1) : '0.0';

    return {
      totalPresent,
      totalAbsent,
      totalMedical,
      totalPartial,
      totalPending,
      attendanceRate,
    };
  }, [activePeriodDayKeys, playerAttendanceForActivePeriod, players]);

  // Headline attendance rate, computed at the SESSION level (the standard,
  // explainable definition): present ÷ (present + absent). Medical/excused and
  // untaken (pending) sessions are excluded from the denominator entirely, so
  // the number never inflates from days where attendance wasn't recorded.
  const rateStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let medical = 0;
    let pending = 0;
    for (const player of players) {
      for (const key of activePeriodDayKeys) {
        for (const event of activeEventsByDay[key] || []) {
          const record = (attendanceData[event.id] || []).find((a: any) => a.playerId === player.id);
          const status = normalizeAttendanceStatus(record?.status);
          if (status === 'present') present++;
          else if (status === 'absent') absent++;
          else if (status === 'medical') medical++;
          else pending++;
        }
      }
    }
    const denom = present + absent;
    const rate = denom > 0 ? ((present / denom) * 100).toFixed(1) : '0.0';
    return { present, absent, medical, pending, denom, rate };
  }, [players, activePeriodDayKeys, activeEventsByDay, attendanceData]);

  // Same session-level rate, per player, over the current week — for the mobile
  // player card so the % matches the day circles shown next to it.
  const playerWeekRates = useMemo(() => {
    return players.reduce<Record<number, number | null>>((acc, player) => {
      let present = 0;
      let absent = 0;
      for (const key of currentWeekDayKeys) {
        for (const event of weeklyEventsByDay[key] || []) {
          const record = (attendanceData[event.id] || []).find((a: any) => a.playerId === player.id);
          const status = normalizeAttendanceStatus(record?.status);
          if (status === 'present') present++;
          else if (status === 'absent') absent++;
        }
      }
      const denom = present + absent;
      acc[player.id] = denom > 0 ? Math.round((present / denom) * 100) : null;
      return acc;
    }, {});
  }, [players, currentWeekDayKeys, weeklyEventsByDay, attendanceData]);

  const handleDayPress = (player: Player, date: Date, details: any[]) => {
    if (details.length === 0) return;
    setModalData({ player, date, details });
    setModalVisible(true);
  };

  // From the daily-attendance modal, jump to the event's grade screen.
  const openEventGrade = (eventId: number) => {
    setModalVisible(false);
    router.push(`/admin/attendance/${eventId}` as any);
  };

  const exportWeeklyReport = () => {
    const header = ['Jucător', ...currentWeekDayKeys, 'Prezent', 'Absent', 'Medical', 'Parțial', 'Neluată'];
    const rows = players.map((player) => {
      let present = 0;
      let absent = 0;
      let medical = 0;
      let partial = 0;
      let pending = 0;

      const statuses = currentWeekDayKeys.map((key) => {
        const status = playerAttendanceGrid[player.id]?.[key]?.status || 'no-session';
        if (status === 'present') present++;
        if (status === 'absent') absent++;
        if (status === 'medical') medical++;
        if (status === 'partial') partial++;
        if (status === 'pending') pending++;
        return status;
      });

      return [
        `${player.firstName} ${player.lastName}`,
        ...statuses,
        String(present),
        String(absent),
        String(medical),
        String(partial),
        String(pending),
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      Alert.alert('Export indisponibil', 'Exportul prezenței este disponibil doar pe web.');
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedTeamName.replace(/\s+/g, '-').toLowerCase()}-week-${weekNumber}-attendance.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const mobilePeriodStartDate = mobilePeriodDays[0];
  const mobilePeriodEndDate = mobilePeriodDays[mobilePeriodDays.length - 1];
  const periodLabel = mobilePeriodMode === 'week' || !isMobile
    ? `${weekStartDate.toLocaleDateString(RO_LOCALE, { day: 'numeric', month: 'short' })} – ${weekEndDate.toLocaleDateString(RO_LOCALE, { day: 'numeric', month: 'short' })}`
    : `${months[viewMonth]} ${viewYear}`;
  const periodSub = mobilePeriodMode === 'week' || !isMobile
    ? `${weekLabel}${selectedTeam?.seasonName ? ` · ${selectedTeam.seasonName}` : ''}`
    : `${mobilePeriodStartDate.getDate()}–${mobilePeriodEndDate.getDate()} ${months[viewMonth].toLowerCase()}`;

  const movePeriod = (delta: number) => {
    if (isMobile && mobilePeriodMode === 'month') {
      setFocusedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
      return;
    }
    setFocusedDate((prev) => addDays(prev, delta * 7));
  };

  const teamSelect = (
    <View className="relative flex-1 min-w-0">
      <select
        value={selectedTeamId ?? ''}
        onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
        aria-label="Echipă"
        className="native-field"
        style={{
          width: '100%',
          height: 40,
          borderRadius: 10,
          border: '1px solid var(--c-border)',
          backgroundColor: 'var(--c-surface)',
          padding: '0 34px 0 12px',
          fontSize: 13.5,
          fontWeight: 600,
          color: 'var(--c-ink)',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
        } as any}
      >
        {teams.length === 0 && <option value="">Nicio echipă</option>}
        {teams.map((team) => (
          <option key={team.id} value={team.id}>{team.name}</option>
        ))}
      </select>
      <View pointerEvents="none" className="absolute right-3 top-0 bottom-0 justify-center">
        <ChevronDown size={15} color="var(--c-faint)" />
      </View>
    </View>
  );

  const stepper = (
    <View className="flex-row items-center gap-2">
      <TouchableOpacity
        onPress={() => movePeriod(-1)}
        accessibilityLabel="Perioada anterioară"
        className="ui-press w-9 h-9 rounded-[10px] items-center justify-center border border-[var(--c-border)] bg-[var(--c-surface)]"
      >
        <ChevronLeft size={17} color="var(--c-ink-soft)" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setFocusedDate(new Date())}
        accessibilityLabel="Mergi la perioada curentă"
        className={`${isMobile ? 'flex-1' : 'min-w-[150px]'} items-center justify-center h-9`}
      >
        <Text className="text-[15px] font-bold leading-tight" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{periodLabel}</Text>
        <Text className="text-[11.5px] font-medium" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>{periodSub}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => movePeriod(1)}
        accessibilityLabel="Perioada următoare"
        className="ui-press w-9 h-9 rounded-[10px] items-center justify-center border border-[var(--c-border)] bg-[var(--c-surface)]"
      >
        <ChevronRight size={17} color="var(--c-ink-soft)" />
      </TouchableOpacity>
    </View>
  );

  const rateNumber = parseFloat(rateStats.rate);
  const statCells = [
    {
      label: isMobile && mobilePeriodMode === 'month' ? 'Rată lună' : 'Rată săptămână',
      value: rateStats.denom > 0 ? `${rateStats.rate}%` : '—',
      hint: `${rateStats.present}/${rateStats.denom} prezențe`,
      tone: rateTone(rateStats.denom > 0 ? rateNumber : null),
      progress: rateStats.denom > 0 ? rateNumber : 0,
    },
    {
      label: 'Absențe',
      value: String(summary.totalAbsent),
      hint: summary.totalMedical ? `${summary.totalMedical} medical` : 'în perioadă',
      tone: summary.totalAbsent > 0 ? 'var(--c-danger-fg)' : 'var(--c-ink)',
      progress: null,
    },
    {
      label: `An ${viewYear}`,
      value: statsLoading ? '—' : yearStat.denom > 0 ? `${yearStat.rate.toFixed(1)}%` : '—',
      hint: `${yearStat.present}/${yearStat.denom} prezențe`,
      tone: rateTone(statsLoading || !yearStat.denom ? null : yearStat.rate),
      progress: statsLoading ? 0 : yearStat.rate,
    },
    {
      label: months[viewMonth],
      value: statsLoading ? '—' : monthStat.denom > 0 ? `${monthStat.rate.toFixed(1)}%` : '—',
      hint: `${monthStat.present}/${monthStat.denom} prezențe`,
      tone: rateTone(statsLoading || !monthStat.denom ? null : monthStat.rate),
      progress: statsLoading ? 0 : monthStat.rate,
    },
  ];

  // One card, four cells with hairline dividers — was four separate 2×2
  // cards with 20px icons and ALL-CAPS labels.
  const statsCard = (
    <View
      className="ui-rise rounded-[16px] border overflow-hidden grid grid-cols-2 lg:grid-cols-4"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)', gap: 1 } as any}
    >
      {statCells.map((cell, index) => (
        <View
          key={cell.label}
          className="px-4 py-3.5 min-w-0"
          style={{
            backgroundColor: 'var(--c-surface)',
            // hairlines: the grid gap shows the border colour through
            boxShadow: `${index % 2 === 1 ? '-1px 0 0 var(--c-border-soft)' : 'none'}${index > 1 ? ', 0 -1px 0 var(--c-border-soft)' : ''}`,
          } as any}
        >
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{cell.label}</Text>
          <Text className="t-num text-[22px] font-bold mt-0.5" style={{ color: cell.tone }}>{cell.value}</Text>
          {cell.progress != null ? (
            <View className="h-1 rounded-full overflow-hidden mt-2" style={{ backgroundColor: 'var(--c-surface-3)' }}>
              <View className="h-full rounded-full ui-bar" style={{ width: `${Math.max(0, Math.min(100, cell.progress))}%`, backgroundColor: cell.tone === 'var(--c-ink)' ? 'var(--c-brand-fg)' : cell.tone } as any} />
            </View>
          ) : null}
          <Text className="text-[11.5px] mt-1.5 t-num" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>{cell.hint}</Text>
        </View>
      ))}
    </View>
  );

  const legend = (
    <View className="flex-row flex-wrap items-center gap-x-3.5 gap-y-1.5">
      {([
        { status: 'present', label: 'Prezent', count: summary.totalPresent },
        { status: 'absent', label: 'Absent', count: summary.totalAbsent },
        { status: 'medical', label: 'Medical', count: summary.totalMedical },
        { status: 'pending', label: 'Neluată', count: summary.totalPending },
      ] as const).map(({ status, label, count }) => (
        <View key={label} className="flex-row items-center gap-1.5">
          <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: STATUS_STYLE[status].dot }} />
          <Text className="text-[12px] font-medium t-num" style={{ color: 'var(--c-muted)' }}>{label} {count}</Text>
        </View>
      ))}
    </View>
  );

  const avatar = (player: Player, size: number) => (
    <View
      className="rounded-full items-center justify-center shrink-0"
      style={{ width: size, height: size, backgroundColor: 'var(--c-surface-tint)' }}
    >
      <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>
        {player.firstName?.[0] || 'J'}{player.lastName?.[0] || ''}
      </Text>
    </View>
  );

  const renderCell = (player: Player, day: Date, size: number) => {
    const dayKey = formatDateKey(day);
    const agg = playerAttendanceGrid[player.id]?.[dayKey]
      || computeDailyAttendance(player.id, weeklyEventsByDay[dayKey] || [], attendanceData);
    return (
      <StatusDot
        key={`${player.id}-${dayKey}`}
        status={agg.status}
        size={size}
        label={`${player.firstName} ${player.lastName}, ${day.toLocaleDateString(RO_LOCALE, { weekday: 'long', day: 'numeric' })}`}
        onPress={() => handleDayPress(player, day, agg.eventDetails)}
      />
    );
  };

  const detailsModal = modalData ? (
    <AttendanceDetailsModal
      visible={modalVisible}
      onClose={() => setModalVisible(false)}
      player={modalData.player}
      date={modalData.date}
      details={modalData.details}
      onSelectEvent={openEventGrade}
    />
  ) : null;

  const listState = loading ? 'loading' : loadError ? 'error' : players.length === 0 ? 'empty' : 'ready';
  const stateBox = (text: string, danger?: boolean) => (
    <View className="rounded-[16px] border border-dashed px-5 py-8 items-center" style={{ borderColor: 'var(--c-border)' } as any}>
      <Text className="t-meta text-center" style={{ color: danger ? 'var(--c-danger-fg)' : 'var(--c-muted)' }}>{text}</Text>
    </View>
  );

  if (isMobile) {
    return (
      <View className="flex-1">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <View className="gap-3">
            {stepper}

            <View className="flex-row items-center gap-2">
              {teamSelect}
              <View className="flex-row p-[3px] rounded-[10px] shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                {(['week', 'month'] as const).map((mode) => {
                  const active = mobilePeriodMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setMobilePeriodMode(mode)}
                      accessibilityState={{ selected: active }}
                      className="h-[34px] px-3 rounded-[8px] justify-center"
                      style={active ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
                    >
                      <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>
                        {mode === 'week' ? 'Săpt.' : 'Lună'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {statsCard}

            <View className="flex-row items-center justify-between mt-2 px-0.5">
              <Text className="text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>
                Jucători{players.length ? <Text style={{ color: 'var(--c-faint)' }}>{` · ${players.length}`}</Text> : null}
              </Text>
              <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>{weekLabel}</Text>
            </View>

            {listState === 'error' ? stateBox(loadError ?? '', true)
              : listState === 'empty' ? stateBox('Niciun jucător în această echipă.')
              : (
                <View
                  className="ui-rise rounded-[16px] border overflow-hidden"
                  style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
                >
                  {/* Weekday header once, aligned with every row's dots. */}
                  <View className="flex-row justify-between px-4 pt-3 pb-1">
                    {currentWeekDays.map((day, index) => (
                      <View key={formatDateKey(day)} className="w-8 items-center">
                        <Text className="text-[10.5px] font-bold" style={{ color: 'var(--c-faint)' }}>{WEEKDAY_LETTERS[index]}</Text>
                        <Text className="text-[11px] font-semibold t-num" style={{ color: 'var(--c-muted)' }}>{day.getDate()}</Text>
                      </View>
                    ))}
                  </View>
                  {listState === 'loading'
                    ? Array.from({ length: 4 }).map((_, i) => (
                      <View key={i} className="px-4 py-3 border-t gap-2.5" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                        <View className="flex-row items-center gap-3">
                          <Skeleton className="w-9 h-9 rounded-full" />
                          <Skeleton className="h-4 w-2/5" />
                        </View>
                        <Skeleton className="h-8 rounded-full" />
                      </View>
                    ))
                    : players.map((player) => {
                      const rate = playerWeekRates[player.id] ?? null;
                      return (
                        <View key={player.id} className="px-4 py-3 border-t" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                          <View className="flex-row items-center gap-3">
                            {avatar(player, 34)}
                            <View className="flex-1 min-w-0">
                              <Text numberOfLines={1} className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                                {player.firstName} {player.lastName}
                              </Text>
                              <Text numberOfLines={1} className="t-meta" style={{ color: 'var(--c-faint)' }}>
                                {player.position || 'Jucător'}{player.number ? ` · #${player.number}` : ''}
                              </Text>
                            </View>
                            <Text className="t-num text-[15px] font-bold" style={{ color: rateTone(rate) }}>
                              {rate == null ? '—' : `${rate}%`}
                            </Text>
                          </View>
                          <View className="flex-row justify-between mt-2.5">
                            {currentWeekDays.map((day) => renderCell(player, day, 32))}
                          </View>
                        </View>
                      );
                    })}
                  <View className="px-4 py-3 border-t" style={{ borderColor: 'var(--c-border-soft)', backgroundColor: 'var(--c-surface-2)' } as any}>
                    {legend}
                  </View>
                </View>
              )}
          </View>
        </ScrollView>
        {detailsModal}
      </View>
    );
  }

  const playerColumnWidth = 240;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <View className="w-full max-w-[1180px] gap-5">
        {statsCard}

        <View
          className="ui-rise rounded-[16px] border overflow-hidden"
          style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
          <View className="flex-row flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--c-border-soft)' } as any}>
            <View className="flex-row items-center gap-3 flex-1 min-w-[260px]">
              <Text className="text-[16px] font-bold shrink-0" style={{ color: 'var(--c-ink)' }}>Matrice prezență</Text>
              <View className="flex-1 max-w-[320px]">{teamSelect}</View>
            </View>
            {stepper}
          </View>

          <View>
            <View className="flex-row items-center border-b" style={{ borderColor: 'var(--c-border-soft)', backgroundColor: 'var(--c-surface-2)' } as any}>
              <View className="px-4 py-2.5" style={{ width: playerColumnWidth }}>
                <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Jucător · {players.length}</Text>
              </View>
              {currentWeekDays.map((day, index) => {
                const isToday = formatDateKey(day) === formatDateKey(new Date());
                return (
                  <View key={formatDateKey(day)} className="flex-1 items-center py-2">
                    <Text className="t-eyebrow" style={{ color: isToday ? 'var(--c-brand-fg)' : 'var(--c-faint)' }}>{WEEKDAY_SHORT[index]}</Text>
                    <Text className="t-num text-[13.5px] font-bold mt-0.5" style={{ color: isToday ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>{day.getDate()}</Text>
                  </View>
                );
              })}
              <View className="w-[72px] items-center">
                <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Rată</Text>
              </View>
            </View>

            {listState === 'error' ? <View className="p-4">{stateBox(loadError ?? '', true)}</View>
              : listState === 'empty' ? <View className="p-4">{stateBox('Niciun jucător în această echipă.')}</View>
              : listState === 'loading' ? Array.from({ length: 6 }).map((_, i) => (
                <View key={i} className="flex-row items-center h-[60px] border-b" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                  <View className="flex-row items-center gap-3 px-4" style={{ width: playerColumnWidth }}>
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <Skeleton className="h-3 w-28" />
                  </View>
                  {currentWeekDays.map((day) => (
                    <View key={formatDateKey(day)} className="flex-1 items-center"><Skeleton className="w-8 h-8 rounded-full" /></View>
                  ))}
                  <View className="w-[72px]" />
                </View>
              ))
              : players.map((player) => {
                const rate = playerWeekRates[player.id] ?? null;
                return (
                  <View key={player.id} className="flex-row items-center h-[60px] border-b hover:bg-[var(--c-surface-2)]" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                    <View className="flex-row items-center gap-3 px-4 min-w-0" style={{ width: playerColumnWidth }}>
                      {avatar(player, 36)}
                      <View className="flex-1 min-w-0">
                        <Text numberOfLines={1} className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{player.firstName} {player.lastName}</Text>
                        <Text numberOfLines={1} className="t-meta" style={{ color: 'var(--c-faint)' }}>
                          {player.number ? `#${player.number} · ` : ''}{player.position || 'Jucător'}
                        </Text>
                      </View>
                    </View>
                    {currentWeekDays.map((day) => (
                      <View key={formatDateKey(day)} className="flex-1 items-center">{renderCell(player, day, 32)}</View>
                    ))}
                    <View className="w-[72px] items-center">
                      <Text className="t-num text-[14px] font-bold" style={{ color: rateTone(rate) }}>{rate == null ? '—' : `${rate}%`}</Text>
                    </View>
                  </View>
                );
              })}
          </View>

          <View className="flex-row flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: 'var(--c-surface-2)' } as any}>
            {legend}
            <TouchableOpacity
              onPress={exportWeeklyReport}
              className="ui-press flex-row items-center gap-1.5 h-8 px-3 rounded-[9px] border"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
            >
              <Download size={14} color="var(--c-brand-fg)" />
              <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Export CSV</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {detailsModal}
    </ScrollView>
  );
}

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

const STATUS_STYLE: Record<AggregateAttendance['status'], { bg: string; fg: string; dot: string; label: string }> = {
  present: { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', dot: 'var(--c-success-fg)', label: 'prezent' },
  absent: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', dot: 'var(--c-danger-fg)', label: 'absent' },
  medical: { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)', dot: 'var(--c-warning-fg)', label: 'medical' },
  partial: { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)', dot: 'var(--c-warning-fg)', label: 'parțial' },
  pending: { bg: 'var(--c-surface-3)', fg: 'var(--c-faint)', dot: 'var(--c-faint)', label: 'prezență neluată' },
  'no-session': { bg: 'transparent', fg: 'var(--c-border-strong)', dot: 'var(--c-border)', label: 'fără sesiune' },
};

/** Colour for an attendance percentage (null = nothing recorded yet). */
function rateTone(rate: number | null): string {
  if (rate == null) return 'var(--c-faint)';
  if (rate >= 80) return 'var(--c-success-fg)';
  if (rate >= 60) return 'var(--c-warning-fg)';
  return 'var(--c-danger-fg)';
}

function StatusDot({
  status, size, label, onPress,
}: {
  status: AggregateAttendance['status'];
  size: number;
  label: string;
  onPress: () => void;
}) {
  const meta = STATUS_STYLE[status];
  const icon = status === 'present' ? <Check size={size * 0.45} color={meta.fg} strokeWidth={3} />
    : status === 'absent' ? <X size={size * 0.45} color={meta.fg} strokeWidth={3} />
      : status === 'medical' ? <BriefcaseMedical size={size * 0.42} color={meta.fg} />
        : status === 'partial' ? <AlertCircle size={size * 0.42} color={meta.fg} />
          : status === 'pending' ? <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: meta.fg }} />
            : <Minus size={size * 0.4} color={meta.fg} />;
  const style = {
    width: size,
    height: size,
    borderRadius: 999,
    backgroundColor: meta.bg,
    ...(status === 'no-session' ? { border: '1px dashed var(--c-border)' } : null),
  } as any;

  if (status === 'no-session') {
    return <View className="items-center justify-center" style={style} accessibilityLabel={`${label}: ${meta.label}`}>{icon}</View>;
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`${label}: ${meta.label}`}
      className="ui-press items-center justify-center"
      style={style}
    >
      {icon}
    </TouchableOpacity>
  );
}
