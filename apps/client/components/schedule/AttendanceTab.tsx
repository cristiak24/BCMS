import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, StyleSheet } from '@/src/web/reactNative';
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
} from 'lucide-react';
import { teamsApi, Team, Player } from '../../services/teamsApi';
import { eventsApi, CalendarEvent } from '../../services/eventsApi';
import {
  addDays,
  computeDailyAttendance,
  AggregateAttendance,
  formatDateKey,
  getIsoWeekNumber,
  getWeekDaysFromDate,
} from '../../utils/attendanceHelpers';
import { AttendanceDetailsModal } from './AttendanceDetailsModal';
import { useResponsive } from '../../hooks/useResponsive';

interface AttendanceTabProps {
  events: CalendarEvent[];
  teams: Team[];
}

type MobilePeriodMode = 'week' | 'month';

export function AttendanceTab({ events, teams }: AttendanceTabProps) {
  const { isMobile, isSmallPhone, width } = useResponsive();
  const [focusedDate, setFocusedDate] = useState(new Date());
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(teams.length > 0 ? teams[0].id : null);
  const [teamPage, setTeamPage] = useState(0);
  const TEAMS_PER_PAGE = isMobile ? 2 : 4;

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<Record<number, any[]>>({});
  const [matrixContainerWidth, setMatrixContainerWidth] = useState(0);

  const [mobilePeriodMode, setMobilePeriodMode] = useState<MobilePeriodMode>('week');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState<{ player: Player; date: Date; details: any[] } | null>(null);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
  const selectedTeamName = selectedTeam?.name || 'Select a Team';
  const weekLabel = `Week ${weekNumber}`;
  const weekRangeLabel = `${weekStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${weekEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const activePeriodDayKeys = isMobile ? mobilePeriodDayKeys : currentWeekDayKeys;
  const activePeriodDayKeySet = isMobile ? mobilePeriodDayKeySet : currentWeekDayKeySet;

  // Matrix sizing:
  // - mobile: fixed min widths + horizontal scroll inside matrix viewport
  // - web/tablet: use available width, keep readable day column min width
  const playerColumnWidth = isMobile ? (isSmallPhone ? 188 : 208) : 280;
  const dayColumnWidthMobile = isSmallPhone ? 64 : 70;
  const dayColumnMinWeb = 92;
  const measuredMatrixWidth = matrixContainerWidth > 0 ? matrixContainerWidth : Math.max(320, width - (isMobile ? 24 : 200));
  const dayColumnWidth = isMobile
    ? dayColumnWidthMobile
    : Math.max(dayColumnMinWeb, Math.floor((measuredMatrixWidth - playerColumnWidth) / 7));

  const matrixMinWidth = playerColumnWidth + (dayColumnWidth * 7);
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
        setLoadError('Could not load attendance data for this period.');
        setPlayers([]);
        setAttendanceData({});
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [selectedTeamId, events, activePeriodDayKeySet]);

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

    const totalPossible = totalPresent + totalAbsent + totalMedical + totalPartial;
    const attendanceRate =
      totalPossible > 0 ? ((totalPresent + totalMedical + (totalPartial * 0.5)) / totalPossible * 100).toFixed(1) : '0.0';

    return {
      totalPresent,
      totalAbsent,
      totalMedical,
      totalPartial,
      totalPending,
      attendanceRate,
    };
  }, [activePeriodDayKeys, playerAttendanceForActivePeriod, players]);

  const playerRates = useMemo(() => {
    return players.reduce<Record<number, number>>((acc, player) => {
      let present = 0;
      let absent = 0;
      let medical = 0;
      let partial = 0;

      for (const key of activePeriodDayKeys) {
        const status = playerAttendanceForActivePeriod[player.id]?.[key]?.status;
        if (status === 'present') present++;
        if (status === 'absent') absent++;
        if (status === 'medical') medical++;
        if (status === 'partial') partial++;
      }

      const total = present + absent + medical + partial;
      acc[player.id] = total > 0 ? Math.round(((present + medical + (partial * 0.5)) / total) * 100) : 0;
      return acc;
    }, {});
  }, [activePeriodDayKeys, playerAttendanceForActivePeriod, players]);

  const handleDayPress = (player: Player, date: Date, details: any[]) => {
    if (details.length === 0) return;
    setModalData({ player, date, details });
    setModalVisible(true);
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
    if (status === 'present') return <CheckCircle size={iconSize} color="#059669" />;
    if (status === 'absent') return <XCircle size={iconSize} color="#E11D48" />;
    if (status === 'medical') return <BriefcaseMedical size={iconSize} color="#D97706" />;
    if (status === 'partial') return <AlertCircle size={iconSize} color="#D97706" />;
    if (status === 'pending') return <View style={styles.pendingDot} />;
    return null;
  };

  const teamPageStart = teamPage * TEAMS_PER_PAGE;
  const visibleTeams = teams.slice(teamPageStart, teamPageStart + TEAMS_PER_PAGE);
  const maxTeamPage = Math.max(0, Math.ceil(teams.length / TEAMS_PER_PAGE) - 1);

  const mobilePeriodStartDate = mobilePeriodDays[0];
  const mobilePeriodEndDate = mobilePeriodDays[mobilePeriodDays.length - 1];
  const mobileDateRangeLabel = `${mobilePeriodStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${mobilePeriodEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  const mobileSeasonLabel = selectedTeam?.seasonName || 'Current Season';

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
          <Minus size={14} color="#94A3B8" />
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
          <X size={13} color="#DC2626" strokeWidth={3} />
        </View>
      );
    }

    if (status === 'medical' || status === 'partial') {
      return (
        <View style={[styles.mobileStatusCircle, styles.mobileStatusCircleMedical]}>
          <AlertCircle size={12} color="#B45309" />
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
            <Text style={styles.mobileHeaderTitle}>Attendance Tracking</Text>
          </View>

          <View style={styles.mobileTopRow}>
            <Text style={styles.mobileOverviewText}>{mobilePeriodMode === 'week' ? 'Week Overview' : 'Month Overview'}</Text>

            <View style={styles.mobileSegmentControl}>
              <TouchableOpacity
                onPress={() => setMobilePeriodMode('week')}
                style={[styles.mobileSegmentOption, mobilePeriodMode === 'week' && styles.mobileSegmentOptionActive]}
              >
                <Text style={[styles.mobileSegmentText, mobilePeriodMode === 'week' && styles.mobileSegmentTextActive]}>Week</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMobilePeriodMode('month')}
                style={[styles.mobileSegmentOption, mobilePeriodMode === 'month' && styles.mobileSegmentOptionActive]}
              >
                <Text style={[styles.mobileSegmentText, mobilePeriodMode === 'month' && styles.mobileSegmentTextActive]}>Month</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.mobilePeriodCard}>
            <TouchableOpacity onPress={movePeriodBackward} style={styles.mobileArrowBtn}>
              <ChevronLeft size={20} color="#1D3E90" />
            </TouchableOpacity>
            <View style={styles.mobilePeriodCenter}>
              <Text style={styles.mobilePeriodLabel}>{mobileDateRangeLabel}</Text>
              <Text style={styles.mobilePeriodSub}>{mobileSeasonLabel}</Text>
            </View>
            <TouchableOpacity onPress={movePeriodForward} style={styles.mobileArrowBtn}>
              <ChevronRight size={20} color="#1D3E90" />
            </TouchableOpacity>
          </View>

          <View style={styles.mobileTeamRowWrap}>
            <TouchableOpacity
              onPress={() => setTeamPage((p) => Math.max(0, p - 1))}
              disabled={teamPage === 0}
              style={[styles.mobileTeamNavBtn, teamPage === 0 && styles.mobileTeamNavBtnDisabled]}
            >
              <ChevronLeft size={16} color="#1E293B" />
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileTeamTrack}>
              {visibleTeams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  onPress={() => setSelectedTeamId(team.id)}
                  style={[styles.mobileTeamPill, selectedTeamId === team.id && styles.mobileTeamPillActive]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.mobileTeamPillText, selectedTeamId === team.id && styles.mobileTeamPillTextActive]}
                  >
                    {team.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setTeamPage((p) => Math.min(maxTeamPage, p + 1))}
              disabled={teamPage >= maxTeamPage}
              style={[styles.mobileTeamNavBtn, teamPage >= maxTeamPage && styles.mobileTeamNavBtnDisabled]}
            >
              <ChevronRight size={16} color="#1E293B" />
            </TouchableOpacity>
          </View>

          <View style={styles.mobileStatsRow}>
            <View style={styles.mobileStatCard}>
              <BarChart3 size={20} color="#0E7490" />
              <Text style={styles.mobileStatValue}>{summary.attendanceRate}%</Text>
              <Text style={styles.mobileStatLabel}>AVG RATE</Text>
            </View>

            <View style={styles.mobileStatCard}>
              <CalendarX2 size={20} color="#DC2626" />
              <Text style={styles.mobileStatValue}>{summary.totalAbsent}</Text>
              <Text style={styles.mobileStatLabel}>ABSENCES</Text>
            </View>
          </View>

          <View style={styles.mobileMatrixHeadingRow}>
            <Text style={styles.mobileMatrixHeading}>Player Matrix</Text>
            <View style={styles.mobileRegisteredPill}>
              <Text style={styles.mobileRegisteredText}>{players.length} Registered</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.mobileCenterState}>
              <ActivityIndicator size="large" color="#1D3E90" />
            </View>
          ) : loadError ? (
            <View style={styles.mobileCenterState}>
              <Text style={styles.matrixErrorText}>{loadError}</Text>
            </View>
          ) : players.length === 0 ? (
            <View style={styles.mobileCenterState}>
              <Text style={styles.matrixEmptyText}>No players found in this team.</Text>
            </View>
          ) : (
            players.map((player) => {
              const playerRate = playerRates[player.id] ?? 0;

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
                        {player.position || 'Player'} · #{player.number || '00'}
                      </Text>
                    </View>

                    <View style={styles.mobileRateBlock}>
                      <Text style={styles.mobileRateValue}>{playerRate}%</Text>
                      <Text style={styles.mobileRateLabel}>Attendance Rate</Text>
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
                            {day.toLocaleDateString([], { weekday: 'short' }).slice(0, 3).toUpperCase()}
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
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 24 }]}> 
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Attendance Rate</Text>
          <Text style={[styles.statValue, { fontSize: 36 }]}>{summary.attendanceRate}%</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${parseFloat(summary.attendanceRate)}%` as any }]} />
          </View>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Team Details</Text>
          <Text style={[styles.statValueSm, { fontSize: 20 }]} numberOfLines={1}>
            {selectedTeamName}
          </Text>
          <Text style={styles.statSub}>{players.length} Players Enrolled</Text>
          <Text style={styles.statMeta}>{weekRangeLabel}</Text>
        </View>
      </View>

      <View style={styles.matrixCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.matrixTitle}>Attendance Matrix</Text>

            <View style={styles.teamSelectorBlock}>
              <Text style={styles.teamLabel}>Team</Text>

              <View style={styles.teamSelectorRow}>
                <TouchableOpacity
                  onPress={() => setTeamPage((p) => Math.max(0, p - 1))}
                  disabled={teamPage === 0}
                  style={[styles.navIconBtn, teamPage === 0 && styles.navIconDisabled]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ChevronLeft size={16} color="#1E293B" />
                </TouchableOpacity>

                <View style={styles.teamPillsViewport}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamPillsTrack}>
                    {visibleTeams.map((team) => (
                      <TouchableOpacity
                        key={team.id}
                        onPress={() => setSelectedTeamId(team.id)}
                        style={[styles.teamPill, selectedTeamId === team.id && styles.teamPillActive]}
                      >
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[styles.teamPillText, selectedTeamId === team.id && styles.teamPillTextActive]}
                        >
                          {team.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <TouchableOpacity
                  onPress={() => setTeamPage((p) => Math.min(maxTeamPage, p + 1))}
                  disabled={teamPage >= maxTeamPage}
                  style={[styles.navIconBtn, teamPage >= maxTeamPage && styles.navIconDisabled]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ChevronRight size={16} color="#1E293B" />
                </TouchableOpacity>
              </View>
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
                <ChevronLeft size={16} color="#475569" />
              </TouchableOpacity>

              <View style={styles.weekBadge}>
                <Text style={styles.weekBadgeText} numberOfLines={1}>
                  {weekLabel}
                </Text>
              </View>

              <TouchableOpacity onPress={() => setFocusedDate((prev) => addDays(prev, 7))} style={styles.weekNavBtn}>
                <ChevronRight size={16} color="#475569" />
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
                  <Text style={[styles.colHeaderText, { fontSize: 12 }]}>Player</Text>
                </View>
                {currentWeekDays.map((day) => (
                  <View key={formatDateKey(day)} style={[styles.dayCol, { width: dayColumnWidth, minWidth: dayColumnWidth }]}>
                    <Text style={[styles.dayColDay, { fontSize: 12 }]}>{day.toLocaleDateString([], { weekday: 'short' })}</Text>
                    <Text style={styles.dayColNum}>{day.getDate()}</Text>
                  </View>
                ))}
              </View>

              {loading ? (
                <View style={styles.matrixCenterState}>
                  <ActivityIndicator size="large" color="#1D3E90" />
                </View>
              ) : loadError ? (
                <View style={styles.matrixCenterState}>
                  <Text style={styles.matrixErrorText}>{loadError}</Text>
                </View>
              ) : players.length === 0 ? (
                <View style={styles.matrixCenterState}>
                  <Text style={styles.matrixEmptyText}>No players found in this team.</Text>
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
                            #{player.number || '00'} · {player.position || 'Player'}
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
              { color: '#10B981', label: 'Present', count: summary.totalPresent },
              { color: '#F43F5E', label: 'Absent', count: summary.totalAbsent },
              { color: '#F59E0B', label: 'Medical', count: summary.totalMedical },
              { color: '#EAB308', label: 'Partial', count: summary.totalPartial },
              { color: '#94A3B8', label: 'Pending', count: summary.totalPending },
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
            <Download size={14} color="#1D3E90" />
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
  if (status === 'present') return { backgroundColor: '#D1FAE5', borderColor: '#A7F3D0' };
  if (status === 'absent') return { backgroundColor: '#FFE4E6', borderColor: '#FECDD3' };
  if (status === 'medical' || status === 'partial') return { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' };
  return { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mobileRoot: {
    flex: 1,
    backgroundColor: '#EAF0F6',
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
    color: '#102A72',
  },
  mobileSegmentControl: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
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
    color: '#64748B',
  },
  mobileSegmentTextActive: {
    color: '#fff',
  },
  mobilePeriodCard: {
    backgroundColor: '#fff',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D9E2EC',
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
    backgroundColor: '#EFF3F8',
    borderWidth: 1,
    borderColor: '#D9E2EC',
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
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#6B7280',
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
    color: '#111827',
  },
  mobileRegisteredPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#E5EAF1',
  },
  mobileRegisteredText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  mobileCenterState: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobilePlayerCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#CAE5FF',
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
    color: '#6B7280',
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
    backgroundColor: '#F3F6FA',
    borderTopWidth: 1,
    borderTopColor: '#E5EAF1',
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
    color: '#6B7280',
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
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  mobileStatusCircleAbsent: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  mobileStatusCircleMedical: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  mobileStatusCirclePending: {
    backgroundColor: '#EEF2F7',
    borderColor: '#D9E2EC',
  },
  mobileStatusCircleNeutral: {
    backgroundColor: '#F8FAFC',
    borderColor: '#C7D0DB',
  },
  mobilePendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
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
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: {
    fontWeight: '900',
    color: '#1E293B',
  },
  statValueSm: {
    fontWeight: '900',
    color: '#1E293B',
    marginBottom: 4,
  },
  statSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D3E90',
    marginTop: 2,
  },
  statMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1D3E90',
    borderRadius: 4,
  },
  matrixCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 26,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
    color: '#1E293B',
    marginBottom: 8,
  },
  teamSelectorBlock: {
    minWidth: 0,
  },
  teamLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teamPillActive: {
    backgroundColor: '#1D3E90',
    borderColor: '#1D3E90',
  },
  teamPillText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#64748B',
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
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
    backgroundColor: '#fff',
    shadowColor: '#0F172A',
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
    color: '#94A3B8',
  },
  monthTabTextActive: {
    color: '#1D3E90',
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexShrink: 0,
  },
  weekBadge: {
    backgroundColor: '#1D3E90',
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
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    minHeight: 230,
    minWidth: 0,
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(248,250,252,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  playerCol: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  colHeaderText: {
    fontWeight: '900',
    color: '#334155',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dayCol: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
  },
  dayColDay: {
    fontWeight: '900',
    color: '#1E293B',
  },
  dayColNum: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 2,
  },
  playerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
    flexShrink: 0,
  },
  playerAvatarText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  playerInfo: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontWeight: '900',
    color: '#1E293B',
  },
  playerSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 1,
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F8FAFC',
  },
  noSessionText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#CBD5E1',
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
    backgroundColor: '#94A3B8',
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
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  matrixEmptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
    color: '#475569',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 92,
    flexShrink: 0,
  },
  exportBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1D3E90',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
