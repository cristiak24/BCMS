import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useFirebaseAuth } from '../../context/AuthContext';
import {
  eventTypeLabel,
  formatCoachDate,
  formatCoachTimeRange,
  getCoachScopeLabel,
  getCoachScopedEvents,
  getEventTimestamp,
  isUpcoming,
} from './coachUtils';

function CoachMetric({ label, value, icon, color }: { label: string; value: string | number; icon: keyof typeof MaterialIcons.glyphMap; color: string }) {
  return (
    <View className="flex-1 min-w-[170px] rounded-[26px] border border-[#E2EAF4] bg-white p-5">
      <View className="h-12 w-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${color}18` }}>
        <MaterialIcons name={icon} size={23} color={color} />
      </View>
      <Text className="mt-5 text-[#0E2041] text-4xl font-black">{value}</Text>
      <Text className="mt-1 text-[#64748B] text-xs font-black uppercase tracking-widest">{label}</Text>
    </View>
  );
}

function CoachEventCard({ event }: { event: CalendarEvent }) {
  return (
    <View className="min-w-[260px] flex-1 rounded-[28px] border border-[#E3ECF6] bg-white p-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[#006092] text-[10px] font-black uppercase tracking-widest">{eventTypeLabel(event.type)}</Text>
          <Text className="mt-3 text-[#050817] text-xl font-black" numberOfLines={2}>{event.title}</Text>
        </View>
        <View className="h-12 w-12 rounded-2xl bg-[#EBF4FF] items-center justify-center">
          <MaterialIcons name={event.type === 'match' ? 'sports-basketball' : 'fitness-center'} size={23} color="#0A2C93" />
        </View>
      </View>

      <View className="mt-6 gap-3">
        <View className="flex-row items-center gap-3">
          <MaterialIcons name="calendar-today" size={17} color="#64748B" />
          <Text className="text-[#1E293B] font-bold">{formatCoachDate(event.startTime)}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <MaterialIcons name="schedule" size={18} color="#64748B" />
          <Text className="text-[#1E293B] font-bold">{formatCoachTimeRange(event.startTime, event.endTime)}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <MaterialIcons name="groups" size={18} color="#64748B" />
          <Text className="text-[#1E293B] font-bold flex-1" numberOfLines={1}>{event.teamName || 'Club team'}</Text>
        </View>
      </View>
    </View>
  );
}

function PlayerFocusRow({ player }: { player: Player }) {
  const rate = player.attendanceRate;
  const tone = rate == null ? '#64748B' : rate >= 80 ? '#047857' : '#B45309';

  return (
    <View className="flex-row items-center gap-4 rounded-2xl border border-[#EDF2F7] bg-white px-4 py-3">
      <View className="h-11 w-11 rounded-2xl bg-[#EEF4FB] items-center justify-center">
        <Text className="text-[#0A2C93] font-black">{player.firstName?.[0] ?? 'P'}{player.lastName?.[0] ?? ''}</Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[#0E2041] font-black" numberOfLines={1}>{player.firstName} {player.lastName}</Text>
        <Text className="text-[#64748B] text-xs font-semibold mt-1" numberOfLines={1}>{player.teamName || player.teamNames?.[0] || player.position || 'Player'}</Text>
      </View>
      <Text style={{ color: tone }} className="font-black">{rate == null ? '—' : `${rate}%`}</Text>
    </View>
  );
}

export default function CoachHome() {
  const router = useRouter();
  const { session } = useFirebaseAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [eventRows, teamRows, rosterRows] = await Promise.all([
        eventsApi.getEvents(),
        teamsApi.getTeams(),
        teamsApi.getRoster().catch(() => []),
      ]);
      setEvents(eventRows);
      setTeams(teamRows);
      setPlayers(rosterRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coach dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scopedEvents = useMemo(() => getCoachScopedEvents(events, session), [events, session]);
  const upcomingEvents = useMemo(
    () => scopedEvents.filter(isUpcoming).sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [scopedEvents],
  );
  const nextEvents = upcomingEvents.slice(0, 4);
  const teamIds = new Set(scopedEvents.map((event) => event.teamId).filter((id): id is number => id != null));
  const visibleTeamsCount = teamIds.size || teams.length;
  const lowAttendancePlayers = useMemo(
    () => players
      .filter((player) => player.attendanceRate != null)
      .sort((a, b) => (a.attendanceRate ?? 100) - (b.attendanceRate ?? 100))
      .slice(0, 5),
    [players],
  );

  return (
    <ScrollView className="flex-1 bg-[#F4F8FF]" contentContainerClassName="px-5 md:px-10 py-7 md:py-10 pb-20">
      <View className="w-full max-w-7xl mx-auto">
        <View className="flex-row items-start justify-between gap-4 mb-8">
          <View className="flex-1">
            <Text className="text-[#0A2C93] text-4xl md:text-5xl font-black tracking-tight">Coach Hub</Text>
            <Text className="text-[#1E293B] text-base md:text-xl mt-3">
              {session?.clubName ?? 'Club'} training control center.
            </Text>
            <Text className="text-[#8EA1B8] text-[11px] font-black uppercase tracking-widest mt-4">
              {getCoachScopeLabel(events, session)}
            </Text>
          </View>

          <Pressable onPress={() => loadData(true)} className="h-12 w-12 rounded-full bg-white border border-[#EAF1FA] items-center justify-center">
            {refreshing ? <ActivityIndicator size="small" color="#0A2C93" /> : <MaterialIcons name="refresh" size={22} color="#0A2C93" />}
          </Pressable>
        </View>

        {error ? (
          <View className="mb-6 rounded-[24px] border border-red-100 bg-white px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="error-outline" size={22} color="#DC2626" />
            <Text className="flex-1 text-red-600 font-bold">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-4 mb-8">
          <CoachMetric label="Upcoming sessions" value={upcomingEvents.length} icon="event-available" color="#0A2C93" />
          <CoachMetric label="Active teams" value={visibleTeamsCount} icon="groups" color="#007A99" />
          <CoachMetric label="Roster players" value={players.length} icon="sports-basketball" color="#7C3AED" />
          <CoachMetric label="This week" value={upcomingEvents.filter((event) => getEventTimestamp(event) - Date.now() <= 7 * 24 * 3600000).length} icon="date-range" color="#047857" />
        </View>

        {loading ? (
          <View className="py-16 items-center justify-center">
            <ActivityIndicator size="large" color="#0A2C93" />
          </View>
        ) : (
          <View className="flex-col xl:flex-row gap-8">
            <View className="flex-1 gap-8">
              <View className="rounded-[34px] border border-[#EAF1FA] bg-white p-6 md:p-8">
                <View className="flex-row items-center justify-between gap-4 mb-6">
                  <View>
                    <Text className="text-[#050817] text-3xl font-black">Next sessions</Text>
                    <Text className="text-[#64748B] font-semibold mt-1">Training, matches and camps that need your attention.</Text>
                  </View>
                  <Pressable onPress={() => router.replace('/schedule' as any)}>
                    <Text className="text-[#006092] font-black">Open schedule</Text>
                  </Pressable>
                </View>

                {nextEvents.length ? (
                  <View className="flex-row flex-wrap gap-5">
                    {nextEvents.map((event) => <CoachEventCard key={event.id} event={event} />)}
                  </View>
                ) : (
                  <View className="rounded-[28px] border border-[#E3ECF6] bg-[#F8FBFF] px-6 py-10 items-center">
                    <MaterialIcons name="event-busy" size={32} color="#8EA1B8" />
                    <Text className="text-[#64748B] font-bold text-center mt-3">No upcoming sessions found.</Text>
                  </View>
                )}
              </View>
            </View>

            <View className="w-full xl:w-[380px] rounded-[34px] border border-[#EAF1FA] bg-white p-6 md:p-7">
              <View className="flex-row items-center justify-between gap-4">
                <View>
                  <Text className="text-[#050817] text-2xl font-black">Roster focus</Text>
                  <Text className="text-[#64748B] text-sm font-semibold mt-1">Lowest recent attendance</Text>
                </View>
                <MaterialIcons name="monitor-heart" size={25} color="#0A2C93" />
              </View>

              <View className="mt-6 gap-3">
                {lowAttendancePlayers.length ? (
                  lowAttendancePlayers.map((player) => <PlayerFocusRow key={player.id} player={player} />)
                ) : (
                  <View className="rounded-[24px] bg-[#F8FBFF] px-5 py-8 items-center">
                    <Text className="text-[#64748B] font-bold text-center">Attendance focus appears after records are marked.</Text>
                  </View>
                )}
              </View>

              <Pressable onPress={() => router.replace('/attendance' as any)} className="mt-6 h-[52px] rounded-full bg-[#0A2C93] px-5 items-center justify-center">
                <Text className="text-white font-black">Manage attendance</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
