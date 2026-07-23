import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, StyleSheet } from '@/src/web/reactNative';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  BriefcaseMedical,
  CalendarX2,
  BarChart3,
  Minus,
  TrendingUp,
  CalendarClock,
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
  const { isMobile, isSmallPhone, width } = useResponsive();
  const router = useRouter();
  const [focusedDate, setFocusedDate] = useState(new Date());
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    initialTeamId ?? (teams.length > 0 ? teams[0].id : null)
  );

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<Record<number, any[]>>({});
  const [matrixContainerWidth, setMatrixContainerWidth] = useState(0);

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
  const weekRangeLabel = `${weekStartDate.toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric' })} - ${weekEndDate.toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const activePeriodDayKeys = isMobile ? mobilePeriodDayKeys : currentWeekDayKeys;
  const activePeriodDayKeySet = isMobile ? mobilePeriodDayKeySet : currentWeekDayKeySet;

  // Matrix sizing:
  // - mobile: fixed min widths + horizontal scroll inside matrix viewport
  // - web/tablet: use available width, keep readable day column min width
  const playerColumnWidth = isMobile ? (isSmallPhone ? 188 : 208) : 240;
  const dayColumnWidthMobile = isSmallPhone ? 64 : 70;
  const dayColumnMinWeb = 64;
  // Fallback width is conservative (sidebar + card padding ≈ 360px) so the grid
  // never renders wider than the card before onLayout measures it — that was
  // pushing the 7th day (Sunday) off-screen behind a horizontal scrollbar.
  const measuredMatrixWidth = matrixContainerWidth > 0 ? matrixContainerWidth : Math.max(320, width - (isMobile ? 24 : 360));
  const dayColumnWidth = isMobile
    ? dayColumnWidthMobile
    : Math.max(dayColumnMinWeb, Math.floor((measuredMatrixWidth - playerColumnWidth) / 7));

  const matrixMinWidth = playerColumnWidth + (dayColumnWidth * 7);
  // On desktop we fit the 7 columns to the measured width (no horizontal scroll);
  // on mobile we keep the fixed min width and scroll inside the matrix.
  const renderedMatrixWidth = isMobile ? matrixMinWidth : Math.max(matrixMinWidth, measuredMatrixWidth);

  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  useEffect(() => {
    async function loadData() {
      if (!selectedTeamId) return;
      setLoading(true);
      setLoadError(null);

      try {
        const roster = await teamsApi.getTeamPlayers(selectedTeamId);
        setPlayers(roster);

        const periodEvents = events.filter((event) => {
          if (event.teamId !== selectedTeamId || event.type !== 'training') return false;
          return activePeriodDayKeySet.has(event.startTime.split('T')[0]);
        });

        const newAttendanceData: Record<number, any[]> = {};
        await Promise.all(
          periodEvents.map(async (event) => {
            const data = await eventsApi.getEventAttendance(event.id);
            newAttendanceData[event.id] = data;
          })
        );

        setAttendanceData(newAttendanceData);
      } catch (error) {
        console.error('Error loading attendance data', error);
        setLoadError('Nu s-au putut încărca datele de prezență pentru această perioadă.');
        setPlayers([]);
        setAttendanceData({});
      } finally {
        setLoading(false);
      }
    }

    loadData();
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

        const att: Record<number, any[]> = {};
        await Promise.all(evs.map(async (ev) => {
          att[ev.id] = await eventsApi.getEventAttendance(ev.id);
        }));
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
    return players.reduce<Record<number, number>>((acc, player) => {
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
      acc[player.id] = denom > 0 ? Math.round((present / denom) * 100) : 0;
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
    const header = ['Player', ...currentWeekDayKeys, 'Present', 'Absent', 'Medical', 'Partial', 'Pending'];
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
      Alert.alert('Export unavailable', 'Weekly attendance export is currently available on web.');
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

  const renderStatusIcon = (status: AggregateAttendance['status']) => {
    const iconSize = isMobile ? 13 : 16;
    if (status === 'present') return <CheckCircle size={iconSize} color="var(--c-success-fg)" />;
    if (status === 'absent') return <XCircle size={iconSize} color="#E11D48" />;
    if (status === 'medical') return <BriefcaseMedical size={iconSize} color="var(--c-warning)" />;
    if (status === 'partial') return <AlertCircle size={iconSize} color="var(--c-warning)" />;
    if (status === 'pending') return <View style={styles.pendingDot} />;
    return null;
  };

  const mobilePeriodStartDate = mobilePeriodDays[0];
  const mobilePeriodEndDate = mobilePeriodDays[mobilePeriodDays.length - 1];
  const mobileDateRangeLabel = `${mobilePeriodStartDate.toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric' })} - ${mobilePeriodEndDate.toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric' })}`;
  const mobileSeasonLabel = selectedTeam?.seasonName || 'Sezon curent';

  const movePeriodBackward = () => {
    if (mobilePeriodMode === 'week') {
      setFocusedDate((prev) => addDays(prev, -7));
      return;
    }

    setFocusedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, prev.getDate()));
  };

  const movePeriodForward = () => {
    if (mobilePeriodMode === 'week') {
      setFocusedDate((prev) => addDays(prev, 7));
      return;
    }

    setFocusedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()));
  };

  const renderMobileStatusCircle = (status: AggregateAttendance['status']) => {
    if (status === 'no-session') {
      return (
        <View style={[styles.mobileStatusCircle, styles.mobileStatusCircleNeutral]}>
          <Minus size={14} color="var(--c-faint)" />
        </View>
      );
    }

    if (status === 'present') {
      return (
        <View style={[styles.mobileStatusCircle, styles.mobileStatusCirclePresent]}>
          <Check size={13} color="#fff" strokeWidth={3} />
        </View>
      );
    }

    if (status === 'absent') {
      return (
        <View style={[styles.mobileStatusCircle, styles.mobileStatusCircleAbsent]}>
          <X size={13} color="var(--c-danger)" strokeWidth={3} />
        </View>
      );
    }

    if (status === 'medical' || status === 'partial') {
      return (
        <View style={[styles.mobileStatusCircle, styles.mobileStatusCircleMedical]}>
          <AlertCircle size={12} color="var(--c-warning-fg)" />
        </View>
      );
    }

    return (
      <View style={[styles.mobileStatusCircle, styles.mobileStatusCirclePending]}>
        <View style={styles.mobilePendingDot} />
      </View>
    );
  };

  if (isMobile) {
    return (
      <View style={styles.mobileRoot}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.mobileContent} showsVerticalScrollIndicator={false}>
          <View style={styles.mobileHeaderRow}>
            <Text style={styles.mobileHeaderTitle}>Evidența prezenței</Text>
          </View>

          <View style={styles.mobileTopRow}>
            <Text style={styles.mobileOverviewText}>{mobilePeriodMode === 'week' ? 'Sumar săptămână' : 'Sumar lună'}</Text>

            <View style={styles.mobileSegmentControl}>
              <TouchableOpacity
                onPress={() => setMobilePeriodMode('week')}
                style={[styles.mobileSegmentOption, mobilePeriodMode === 'week' && styles.mobileSegmentOptionActive]}
              >
                <Text style={[styles.mobileSegmentText, mobilePeriodMode === 'week' && styles.mobileSegmentTextActive]}>Săptămână</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMobilePeriodMode('month')}
                style={[styles.mobileSegmentOption, mobilePeriodMode === 'month' && styles.mobileSegmentOptionActive]}
              >
                <Text style={[styles.mobileSegmentText, mobilePeriodMode === 'month' && styles.mobileSegmentTextActive]}>Lună</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.mobilePeriodCard}>
            <TouchableOpacity onPress={movePeriodBackward} style={styles.mobileArrowBtn}>
              <ChevronLeft size={20} color="var(--c-brand-fg)" />
            </TouchableOpacity>
            <View style={styles.mobilePeriodCenter}>
              <Text style={styles.mobilePeriodLabel}>{mobileDateRangeLabel}</Text>
              <Text style={styles.mobilePeriodSub}>{mobileSeasonLabel}</Text>
            </View>
            <TouchableOpacity onPress={movePeriodForward} style={styles.mobileArrowBtn}>
              <ChevronRight size={20} color="var(--c-brand-fg)" />
            </TouchableOpacity>
          </View>

          <View style={styles.mobileTeamRowWrap}>
            <select
              value={selectedTeamId ?? ''}
              onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 16,
                border: '1px solid #D9E2EC',
                backgroundColor: 'var(--c-surface)',
                paddingLeft: 14,
                paddingRight: 14,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--c-ink-soft)',
                cursor: 'pointer',
              } as any}
            >
              {teams.length === 0 && <option value="">Nicio echipă</option>}
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </View>

          <View style={styles.mobileStatsRow}>
            <View style={styles.mobileStatCard}>
              <BarChart3 size={20} color="#0E7490" />
              <Text style={styles.mobileStatValue}>{rateStats.rate}%</Text>
              <Text style={styles.mobileStatLabel}>RATĂ MEDIE</Text>
            </View>

            <View style={styles.mobileStatCard}>
              <CalendarX2 size={20} color="var(--c-danger)" />
              <Text style={styles.mobileStatValue}>{summary.totalAbsent}</Text>
              <Text style={styles.mobileStatLabel}>ABSENȚE</Text>
            </View>
          </View>

          <View style={styles.mobileStatsRow}>
            <View style={styles.mobileStatCard}>
              <TrendingUp size={20} color="var(--c-brand-fg)" />
              <Text style={styles.mobileStatValue}>{statsLoading ? '—' : `${yearStat.rate.toFixed(1)}%`}</Text>
              <Text style={styles.mobileStatLabel}>PREZENȚĂ AN {viewYear}</Text>
            </View>

            <View style={styles.mobileStatCard}>
              <CalendarClock size={20} color="#0E7490" />
              <Text style={styles.mobileStatValue}>{statsLoading ? '—' : `${monthStat.rate.toFixed(1)}%`}</Text>
              <Text style={styles.mobileStatLabel}>PREZENȚĂ {months[viewMonth].toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.mobileMatrixHeadingRow}>
            <Text style={styles.mobileMatrixHeading}>Matrice jucători</Text>
            <View style={styles.mobileRegisteredPill}>
              <Text style={styles.mobileRegisteredText}>{players.length} înscriși</Text>
            </View>
          </View>

          {loading ? (
            <View style={{ gap: 12 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={styles.mobilePlayerCard}>
                  <View style={styles.mobilePlayerTop}>
                    <Skeleton className="w-14 h-14 rounded-full" />
                    <View style={{ flex: 1, gap: 8 }}>
                      <Skeleton className="h-5 w-2/5" />
                      <Skeleton className="h-3 w-1/4" />
                    </View>
                    <Skeleton className="h-10 w-16 rounded-lg" />
                  </View>
                  <View style={styles.mobileWeekRow}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <View key={j} style={styles.mobileDayItem}>
                        <Skeleton className="w-8 h-8 rounded-full" />
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : loadError ? (
            <View style={styles.mobileCenterState}>
              <Text style={styles.matrixErrorText}>{loadError}</Text>
            </View>
          ) : players.length === 0 ? (
            <View style={styles.mobileCenterState}>
              <Text style={styles.matrixEmptyText}>Niciun jucător în această echipă.</Text>
            </View>
          ) : (
            players.map((player) => {
              const playerRate = playerWeekRates[player.id] ?? 0;

              return (
                <View key={player.id} style={styles.mobilePlayerCard}>
                  <View style={styles.mobilePlayerTop}>
                    <View style={styles.mobileAvatarCircle}>
                      <Text style={styles.mobileAvatarText}>
                        {player.firstName?.[0] || 'P'}
                        {player.lastName?.[0] || ''}
                      </Text>
                    </View>

                    <View style={styles.mobilePlayerIdentity}>
                      <Text numberOfLines={1} style={styles.mobilePlayerName}>
                        {player.firstName} {player.lastName}
                      </Text>
                      <Text numberOfLines={1} style={styles.mobilePlayerSub}>
                        {player.position || 'Jucător'}{player.number ? ` · #${player.number}` : ''}
                      </Text>
                    </View>

                    <View style={styles.mobileRateBlock}>
                      <Text style={styles.mobileRateValue}>{playerRate}%</Text>
                      <Text style={styles.mobileRateLabel}>Rată prezență</Text>
                    </View>
                  </View>

                  <View style={styles.mobileWeekRow}>
                    {currentWeekDays.map((day) => {
                      const dayKey = formatDateKey(day);
                      const agg =
                        playerAttendanceGrid[player.id]?.[dayKey] ||
                        computeDailyAttendance(player.id, weeklyEventsByDay[dayKey] || [], attendanceData);

                      return (
                        <View key={`${player.id}-${dayKey}`} style={styles.mobileDayItem}>
                          <Text style={styles.mobileDayLabel}>
                            {day.toLocaleDateString(RO_LOCALE, { weekday: 'short' }).slice(0, 3).toUpperCase()}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleDayPress(player, day, agg.eventDetails)}
                            disabled={agg.status === 'no-session'}
                          >
                            {renderMobileStatusCircle(agg.status)}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.mobileBottomSpacer} />
        </ScrollView>

        {modalData && (
          <AttendanceDetailsModal
            visible={modalVisible}
            onClose={() => setModalVisible(false)}
            player={modalData.player}
            date={modalData.date}
            details={modalData.details}
            onSelectEvent={openEventGrade}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 24 }]}> 
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Rată totală de prezență</Text>
          <Text style={[styles.statValue, { fontSize: 36 }]}>{rateStats.rate}%</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${parseFloat(rateStats.rate)}%` as any }]} />
          </View>
          <Text style={styles.statMeta}>
            {rateStats.present} prezențe / {rateStats.denom} luate · medical și neluate excluse
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Prezență an {viewYear}</Text>
          <Text style={[styles.statValue, { fontSize: 32 }]}>{statsLoading ? '—' : `${yearStat.rate.toFixed(1)}%`}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${statsLoading ? 0 : yearStat.rate}%` as any }]} />
          </View>
          <Text style={styles.statMeta}>{yearStat.present} prezențe / {yearStat.denom} luate</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Prezență {months[viewMonth]}</Text>
          <Text style={[styles.statValue, { fontSize: 32 }]}>{statsLoading ? '—' : `${monthStat.rate.toFixed(1)}%`}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${statsLoading ? 0 : monthStat.rate}%`, backgroundColor: '#0E7490' } as any]} />
          </View>
          <Text style={styles.statMeta}>{monthStat.present} prezențe / {monthStat.denom} luate</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Detalii echipă</Text>
          <Text style={[styles.statValueSm, { fontSize: 20 }]} numberOfLines={1}>
            {selectedTeamName}
          </Text>
          <Text style={styles.statSub}>{players.length} jucători înscriși</Text>
          <Text style={styles.statMeta}>{weekRangeLabel}</Text>
        </View>
      </View>

      <View style={styles.matrixCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.matrixTitle}>Matrice prezență</Text>

            <View style={styles.teamSelectorBlock}>
              <Text style={styles.teamLabel}>Echipă</Text>
              <select
                value={selectedTeamId ?? ''}
                onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
                style={{
                  height: 40,
                  borderRadius: 14,
                  border: '1px solid #E2E8F0',
                  backgroundColor: 'var(--c-surface-2)',
                  paddingLeft: 14,
                  paddingRight: 14,
                  fontSize: 13,
                  fontWeight: 800,
                  color: 'var(--c-ink-soft)',
                  minWidth: 220,
                  maxWidth: 340,
                  cursor: 'pointer',
                } as any}
              >
                {teams.length === 0 && <option value="">Nicio echipă</option>}
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </View>
          </View>

          <View style={styles.cardHeaderRight}>
            <View style={styles.monthTabs}>
              {[-1, 0, 1].map((offset) => {
                const d = new Date(viewYear, viewMonth + offset, 1);
                const monthName = months[d.getMonth()];
                const isSelected = offset === 0;

                return (
                  <TouchableOpacity
                    key={offset}
                    onPress={() => setFocusedDate(new Date(viewYear, viewMonth + offset, 1))}
                    style={[styles.monthTab, isSelected && styles.monthTabActive]}
                  >
                    <Text style={[styles.monthTabText, isSelected && styles.monthTabTextActive]}>{monthName}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.weekNavWrap}>
              <TouchableOpacity onPress={() => setFocusedDate((prev) => addDays(prev, -7))} style={styles.weekNavBtn}>
                <ChevronLeft size={16} color="var(--c-muted)" />
              </TouchableOpacity>

              <View style={styles.weekBadge}>
                <Text style={styles.weekBadgeText} numberOfLines={1}>
                  {weekLabel}
                </Text>
              </View>

              <TouchableOpacity onPress={() => setFocusedDate((prev) => addDays(prev, 7))} style={styles.weekNavBtn}>
                <ChevronRight size={16} color="var(--c-muted)" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View
          style={styles.matrixContainer}
          onLayout={(e) => {
            const w = Math.floor(e.nativeEvent.layout.width);
            if (w > 0 && w !== matrixContainerWidth) setMatrixContainerWidth(w);
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: renderedMatrixWidth }}>
            <View style={{ width: renderedMatrixWidth }}>
              <View style={[styles.matrixHeaderRow, { height: 66 }]}> 
                <View style={[styles.playerCol, { width: playerColumnWidth, minWidth: playerColumnWidth }]}> 
                  <Text style={[styles.colHeaderText, { fontSize: 12 }]}>Jucător</Text>
                </View>
                {currentWeekDays.map((day) => (
                  <View key={formatDateKey(day)} style={[styles.dayCol, { width: dayColumnWidth, minWidth: dayColumnWidth }]}>
                    <Text style={[styles.dayColDay, { fontSize: 12 }]}>{day.toLocaleDateString(RO_LOCALE, { weekday: 'short' })}</Text>
                    <Text style={styles.dayColNum}>{day.getDate()}</Text>
                  </View>
                ))}
              </View>

              {loading ? (
                <View>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={[styles.playerRow, { height: 74 }]}>
                      <View style={[styles.playerCol, { width: playerColumnWidth, minWidth: playerColumnWidth }]}>
                        <Skeleton className="w-9 h-9 rounded-full mr-2" />
                        <View style={{ flex: 1, gap: 6 }}>
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-2.5 w-16" />
                        </View>
                      </View>
                      {currentWeekDays.map((day) => (
                        <View key={formatDateKey(day)} style={[styles.dayCell, { width: dayColumnWidth, minWidth: dayColumnWidth }]}>
                          <Skeleton className="w-8 h-8 rounded-full" />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ) : loadError ? (
                <View style={styles.matrixCenterState}>
                  <Text style={styles.matrixErrorText}>{loadError}</Text>
                </View>
              ) : players.length === 0 ? (
                <View style={styles.matrixCenterState}>
                  <Text style={styles.matrixEmptyText}>Niciun jucător în această echipă.</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator>
                  {players.map((player) => (
                    <View key={player.id} style={[styles.playerRow, { height: 74 }]}> 
                      <View style={[styles.playerCol, { width: playerColumnWidth, minWidth: playerColumnWidth }]}> 
                        <View style={styles.playerAvatar}>
                          <Text style={styles.playerAvatarText}>
                            {player.firstName?.[0] || 'P'}
                            {player.lastName?.[0] || ''}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={[styles.playerName, { fontSize: 14 }]} numberOfLines={1} ellipsizeMode="tail">
                            {player.firstName} {player.lastName}
                          </Text>
                          <Text style={styles.playerSub} numberOfLines={1} ellipsizeMode="tail">
                            {player.number ? `#${player.number} · ` : ''}{player.position || 'Jucător'}
                          </Text>
                        </View>
                      </View>

                      {currentWeekDays.map((day) => {
                        const dayKey = formatDateKey(day);
                        const agg =
                          playerAttendanceGrid[player.id]?.[dayKey] ||
                          computeDailyAttendance(player.id, weeklyEventsByDay[dayKey] || [], attendanceData);

                        return (
                          <View key={`${player.id}-${dayKey}`} style={[styles.dayCell, { width: dayColumnWidth, minWidth: dayColumnWidth }]}>
                            {agg.status === 'no-session' ? (
                              <Text style={styles.noSessionText}>–</Text>
                            ) : (
                              <TouchableOpacity
                                onPress={() => handleDayPress(player, day, agg.eventDetails)}
                                style={[styles.statusBubble, getStatusBubbleStyle(agg.status)]}
                              >
                                {renderStatusIcon(agg.status)}
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </ScrollView>
        </View>

        <View style={styles.footer}>
          <View style={styles.legend}>
            {([
              { color: 'var(--c-success)', label: 'Prezent', count: summary.totalPresent },
              { color: 'var(--c-danger)', label: 'Absent', count: summary.totalAbsent },
              { color: 'var(--c-warning)', label: 'Medical', count: summary.totalMedical },
              { color: '#EAB308', label: 'Parțial', count: summary.totalPartial },
              { color: 'var(--c-faint)', label: 'În așteptare', count: summary.totalPending },
            ] as const).map(({ color, label, count }) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText} numberOfLines={1}>
                  {label} ({count})
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity onPress={exportWeeklyReport} style={styles.exportBtn}>
            <Download size={14} color="var(--c-brand-fg)" />
            <Text style={styles.exportBtnText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      {modalData && (
        <AttendanceDetailsModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          player={modalData.player}
          date={modalData.date}
          details={modalData.details}
        />
      )}
    </View>
  );
}

function getStatusBubbleStyle(status: AggregateAttendance['status']): object {
  if (status === 'present') return { backgroundColor: 'var(--c-success-bg)', borderColor: '#A7F3D0' };
  if (status === 'absent') return { backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-bg)' };
  if (status === 'medical' || status === 'partial') return { backgroundColor: 'var(--c-warning-bg)', borderColor: '#FDE68A' };
  return { backgroundColor: 'var(--c-surface-3)', borderColor: 'var(--c-border)' };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mobileRoot: {
    flex: 1,
    backgroundColor: 'var(--c-surface-2)',
  },
  mobileContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 12,
  },
  mobileHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  mobileHeaderTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0E3A8A',
    letterSpacing: 0.2,
  },
  mobileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mobileOverviewText: {
    fontSize: 20,
    fontWeight: '900',
    color: 'var(--c-brand-fg)',
  },
  mobileSegmentControl: {
    flexDirection: 'row',
    backgroundColor: 'var(--c-border)',
    padding: 3,
    borderRadius: 22,
    gap: 3,
  },
  mobileSegmentOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  mobileSegmentOptionActive: {
    backgroundColor: '#2EA6F2',
  },
  mobileSegmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'var(--c-muted)',
  },
  mobileSegmentTextActive: {
    color: '#fff',
  },
  mobilePeriodCard: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  mobileArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobilePeriodCenter: {
    alignItems: 'center',
    flex: 1,
  },
  mobilePeriodLabel: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0E2F82',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  mobilePeriodSub: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: '#7C8798',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mobileTeamRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 2,
  },
  mobileTeamNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'var(--c-surface)',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileTeamNavBtnDisabled: {
    opacity: 0.35,
  },
  mobileTeamTrack: {
    gap: 8,
    paddingRight: 8,
  },
  mobileTeamPill: {
    backgroundColor: 'var(--c-surface-2)',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  mobileTeamPillActive: {
    backgroundColor: '#2EA6F2',
    borderColor: '#2EA6F2',
  },
  mobileTeamPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  mobileTeamPillTextActive: {
    color: '#fff',
  },
  mobileStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  mobileStatCard: {
    flex: 1,
    backgroundColor: 'var(--c-surface)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 106,
    justifyContent: 'space-between',
  },
  mobileStatValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0E2F82',
    marginTop: 6,
  },
  mobileStatLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'var(--c-muted)',
    marginTop: 2,
  },
  mobileMatrixHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 2,
  },
  mobileMatrixHeading: {
    fontSize: 20,
    fontWeight: '900',
    color: 'var(--c-ink-strong)',
  },
  mobileRegisteredPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'var(--c-border)',
  },
  mobileRegisteredText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'var(--c-muted)',
  },
  mobileCenterState: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobilePlayerCard: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    overflow: 'hidden',
    marginTop: 8,
  },
  mobilePlayerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  mobileAvatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'var(--c-surface-tint)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileAvatarText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#123A7E',
  },
  mobilePlayerIdentity: {
    flex: 1,
    minWidth: 0,
  },
  mobilePlayerName: {
    fontSize: 25,
    fontWeight: '900',
    color: '#101828',
  },
  mobilePlayerSub: {
    fontSize: 16,
    fontWeight: '500',
    color: 'var(--c-muted)',
    marginTop: 2,
  },
  mobileRateBlock: {
    alignItems: 'flex-end',
  },
  mobileRateValue: {
    fontSize: 42,
    fontWeight: '900',
    color: '#0E2F82',
  },
  mobileRateLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mobileWeekRow: {
    backgroundColor: 'var(--c-surface-2)',
    borderTopWidth: 1,
    borderTopColor: 'var(--c-border)',
    paddingVertical: 12,
    paddingHorizontal: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mobileDayItem: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
  },
  mobileDayLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'var(--c-muted)',
    textTransform: 'uppercase',
  },
  mobileStatusCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  mobileStatusCirclePresent: {
    backgroundColor: 'var(--c-sky)',
    borderColor: 'var(--c-sky)',
  },
  mobileStatusCircleAbsent: {
    backgroundColor: 'var(--c-danger-bg)',
    borderColor: 'var(--c-danger-bg)',
  },
  mobileStatusCircleMedical: {
    backgroundColor: 'var(--c-warning-bg)',
    borderColor: '#FCD34D',
  },
  mobileStatusCirclePending: {
    backgroundColor: 'var(--c-surface-2)',
    borderColor: 'var(--c-border)',
  },
  mobileStatusCircleNeutral: {
    backgroundColor: 'var(--c-surface-2)',
    borderColor: '#C7D0DB',
  },
  mobilePendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'var(--c-faint)',
  },
  mobileBottomSpacer: {
    height: 22,
  },
  statRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'var(--c-surface)',
    borderRadius: 20,
    padding: 18,
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: {
    fontWeight: '900',
    color: 'var(--c-ink-soft)',
  },
  statValueSm: {
    fontWeight: '900',
    color: 'var(--c-ink-soft)',
    marginBottom: 4,
  },
  statSub: {
    fontSize: 11,
    fontWeight: '700',
    color: 'var(--c-brand-fg)',
    marginTop: 2,
  },
  statMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: 'var(--c-faint)',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'var(--c-surface-3)',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'var(--c-brand-surface)',
    borderRadius: 4,
  },
  matrixCard: {
    flex: 1,
    backgroundColor: 'var(--c-surface)',
    borderRadius: 26,
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
    padding: 16,
    minWidth: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  matrixTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: 'var(--c-ink-soft)',
    marginBottom: 8,
  },
  teamSelectorBlock: {
    minWidth: 0,
  },
  teamLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  teamSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 8,
  },
  navIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--c-surface-2)',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    flexShrink: 0,
  },
  navIconDisabled: {
    opacity: 0.35,
  },
  teamPillsViewport: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  teamPillsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  teamPill: {
    maxWidth: 170,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'var(--c-surface-3)',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
  },
  teamPillActive: {
    backgroundColor: 'var(--c-brand-surface)',
    borderColor: 'var(--c-brand-border)',
  },
  teamPillText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--c-muted)',
  },
  teamPillTextActive: {
    color: '#fff',
  },
  cardHeaderRight: {
    width: 360,
    maxWidth: '100%',
    alignItems: 'flex-end',
    gap: 8,
  },
  monthTabs: {
    flexDirection: 'row',
    backgroundColor: 'var(--c-surface-2)',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
    alignSelf: 'flex-end',
  },
  monthTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 58,
    alignItems: 'center',
  },
  monthTabActive: {
    backgroundColor: 'var(--c-surface)',
    shadowColor: 'var(--c-ink-strong)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  monthTabText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--c-faint)',
  },
  monthTabTextActive: {
    color: 'var(--c-brand-fg)',
  },
  weekNavWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  weekNavBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'var(--c-surface-2)',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    flexShrink: 0,
  },
  weekBadge: {
    backgroundColor: 'var(--c-brand-surface)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matrixContainer: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
    minHeight: 230,
    minWidth: 0,
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(248,250,252,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--c-border)',
  },
  playerCol: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: 'var(--c-border)',
  },
  colHeaderText: {
    fontWeight: '900',
    color: 'var(--c-ink-soft)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dayCol: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'var(--c-surface-3)',
  },
  dayColDay: {
    fontWeight: '900',
    color: 'var(--c-ink-soft)',
  },
  dayColNum: {
    fontSize: 10,
    fontWeight: '700',
    color: 'var(--c-faint)',
    marginTop: 2,
  },
  playerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--c-surface-2)',
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'var(--c-surface-3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    marginRight: 8,
    flexShrink: 0,
  },
  playerAvatarText: {
    fontSize: 10,
    fontWeight: '900',
    color: 'var(--c-faint)',
    textTransform: 'uppercase',
  },
  playerInfo: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontWeight: '900',
    color: 'var(--c-ink-soft)',
  },
  playerSub: {
    fontSize: 10,
    fontWeight: '700',
    color: 'var(--c-faint)',
    marginTop: 1,
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'var(--c-surface-2)',
  },
  noSessionText: {
    fontSize: 12,
    fontWeight: '900',
    color: 'var(--c-border-strong)',
  },
  statusBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'var(--c-faint)',
  },
  matrixCenterState: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  matrixErrorText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'var(--c-muted)',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  matrixEmptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'var(--c-faint)',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'var(--c-surface-3)',
    gap: 10,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'var(--c-surface-2)',
    borderWidth: 1,
    borderColor: 'var(--c-surface-3)',
    maxWidth: '100%',
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '900',
    color: 'var(--c-muted)',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'var(--c-surface-2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--c-border)',
    minWidth: 92,
    flexShrink: 0,
  },
  exportBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: 'var(--c-brand-fg)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
