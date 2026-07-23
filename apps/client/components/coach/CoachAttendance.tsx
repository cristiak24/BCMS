import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent, EventAttendance, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player } from '../../services/teamsApi';
import { useFirebaseAuth } from '../../context/AuthContext';
import {
  eventTypeLabel,
  formatCoachDate,
  formatCoachTimeRange,
  getCoachScopedEvents,
  getEventTimestamp,
  isUpcoming,
} from './coachUtils';

type AttendanceStatus = 'present' | 'absent' | 'medical';

type AttendancePlayer = {
  playerId: number;
  firstName: string;
  lastName: string;
  number: number | null;
  status: string | null;
};

const STATUS_OPTIONS: { status: AttendanceStatus; label: string; icon: keyof typeof MaterialIcons.glyphMap; color: string }[] = [
  { status: 'present', label: 'Present', icon: 'check-circle', color: 'var(--c-success-fg)' },
  { status: 'absent', label: 'Absent', icon: 'cancel', color: 'var(--c-danger)' },
  { status: 'medical', label: 'Medical', icon: 'medical-services', color: 'var(--c-warning-fg)' },
];

function toAttendancePlayer(player: Player): AttendancePlayer {
  return {
    playerId: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    number: player.number,
    status: null,
  };
}

function mergeAttendance(teamPlayers: Player[], attendanceRows: EventAttendance[]) {
  const byPlayerId = new Map<number, AttendancePlayer>();
  teamPlayers.forEach((player) => byPlayerId.set(player.id, toAttendancePlayer(player)));
  attendanceRows.forEach((row) => {
    byPlayerId.set(row.playerId, {
      playerId: row.playerId,
      firstName: row.firstName || byPlayerId.get(row.playerId)?.firstName || '',
      lastName: row.lastName || byPlayerId.get(row.playerId)?.lastName || '',
      number: row.number ?? byPlayerId.get(row.playerId)?.number ?? null,
      status: row.status,
    });
  });

  return Array.from(byPlayerId.values()).sort((a, b) => {
    const aNumber = a.number ?? 999;
    const bNumber = b.number ?? 999;
    if (aNumber !== bNumber) return aNumber - bNumber;
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });
}

function statusTone(status?: string | null) {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'present' || normalized === 'prezent') return { label: 'Present', bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' };
  if (normalized === 'absent') return { label: 'Absent', bg: 'var(--c-danger-bg)', fg: 'var(--c-danger)' };
  if (normalized === 'medical' || normalized === 'excused') return { label: 'Medical', bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' };
  return { label: 'Pending', bg: 'var(--c-border)', fg: 'var(--c-muted)' };
}

function EventSelectorCard({ event, active, onPress }: { event: CalendarEvent; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`rounded-[24px] border p-4 ${active ? 'bg-[#EBF4FF] border-[#0A2C93]' : 'bg-white border-[#E3ECF6]'}`}>
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 rounded-2xl bg-white items-center justify-center border border-[#E3ECF6]">
          <MaterialIcons name={event.type === 'match' ? 'sports-basketball' : 'fitness-center'} size={21} color="var(--c-brand-fg)" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[#006092] text-[10px] font-black uppercase tracking-widest">{eventTypeLabel(event.type)}</Text>
          <Text className="text-[#0E2041] font-black mt-1" numberOfLines={2}>{event.title}</Text>
          <Text className="text-[#64748B] text-xs font-semibold mt-2">{formatCoachDate(event.startTime)} · {formatCoachTimeRange(event.startTime, event.endTime)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function CoachAttendance() {
  const { session } = useFirebaseAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [players, setPlayers] = useState<AttendancePlayer[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingPlayerId, setSavingPlayerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setError(null);

    try {
      const eventRows = await eventsApi.getEvents();
      const scopedEvents = getCoachScopedEvents(eventRows, session)
        .filter((event) => event.type !== 'admin')
        .sort((a, b) => {
          const aUpcoming = isUpcoming(a);
          const bUpcoming = isUpcoming(b);
          if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
          return Math.abs(getEventTimestamp(a) - Date.now()) - Math.abs(getEventTimestamp(b) - Date.now());
        });
      setEvents(scopedEvents);
      setSelectedEventId((current) => current ?? scopedEvents[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sessions.');
    } finally {
      setLoadingEvents(false);
    }
  }, [session]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const loadAttendance = useCallback(async () => {
    if (!selectedEvent) {
      setPlayers([]);
      return;
    }

    setLoadingAttendance(true);
    setError(null);

    try {
      const [attendanceRows, teamPlayers] = await Promise.all([
        eventsApi.getEventAttendance(selectedEvent.id),
        selectedEvent.teamId != null ? teamsApi.getTeamPlayers(selectedEvent.teamId).catch(() => []) : Promise.resolve([]),
      ]);
      setPlayers(mergeAttendance(teamPlayers, attendanceRows));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load attendance.');
    } finally {
      setLoadingAttendance(false);
    }
  }, [selectedEvent]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const markPlayer = async (playerId: number, status: AttendanceStatus) => {
    if (!selectedEvent) return;

    setSavingPlayerId(playerId);

    try {
      await eventsApi.updateEventAttendance(selectedEvent.id, [{ playerId, status }]);
      setPlayers((current) => current.map((player) => player.playerId === playerId ? { ...player, status } : player));
    } catch (err) {
      Alert.alert('Attendance', err instanceof Error ? err.message : 'Could not update attendance.');
    } finally {
      setSavingPlayerId(null);
    }
  };

  const markedCount = players.filter((player) => player.status).length;
  const presentCount = players.filter((player) => String(player.status ?? '').toLowerCase() === 'present' || String(player.status ?? '').toLowerCase() === 'prezent').length;

  return (
    <ScrollView className="flex-1 bg-[#F1F5F9]" contentContainerClassName="px-5 md:px-10 py-8 pb-20">
      <View className="w-full max-w-7xl mx-auto">
        <View className="flex-row items-start justify-between gap-4 mb-8">
          <View className="flex-1">
            <Text className="text-[#0E2041] text-4xl md:text-5xl font-black tracking-tight">Attendance</Text>
            <Text className="text-[#64748B] text-base md:text-lg font-semibold mt-3">Mark player availability for your sessions.</Text>
          </View>
          <Pressable onPress={() => loadEvents()} className="h-12 w-12 rounded-full bg-white border border-[#E3ECF6] items-center justify-center">
            {loadingEvents ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={22} color="var(--c-brand-fg)" />}
          </Pressable>
        </View>

        {error ? (
          <View className="mb-6 rounded-[24px] border border-red-100 bg-white px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="error-outline" size={22} color="var(--c-danger)" />
            <Text className="flex-1 text-red-600 font-bold">{error}</Text>
          </View>
        ) : null}

        <View className="flex-col xl:flex-row gap-8">
          <View className="w-full xl:w-[380px] rounded-[30px] border border-[#E3ECF6] bg-white p-5">
            <Text className="text-[#0E2041] text-2xl font-black">Sessions</Text>
            <Text className="text-[#64748B] text-sm font-semibold mt-1 mb-5">Choose a session to mark.</Text>

            {loadingEvents ? (
              <View className="py-10 items-center">
                <ActivityIndicator size="large" color="var(--c-brand-fg)" />
              </View>
            ) : events.length ? (
              <View className="gap-3">
                {events.slice(0, 12).map((event) => (
                  <EventSelectorCard
                    key={event.id}
                    event={event}
                    active={event.id === selectedEventId}
                    onPress={() => setSelectedEventId(event.id)}
                  />
                ))}
              </View>
            ) : (
              <View className="rounded-[24px] bg-[#F8FBFF] px-5 py-10 items-center">
                <Text className="text-[#64748B] font-bold text-center">No coach sessions found.</Text>
              </View>
            )}
          </View>

          <View className="flex-1 rounded-[30px] border border-[#E3ECF6] bg-white p-5 md:p-7">
            <View className="flex-row flex-wrap items-start justify-between gap-4 mb-6">
              <View className="flex-1 min-w-[240px]">
                <Text className="text-[#0E2041] text-2xl md:text-3xl font-black">{selectedEvent?.title ?? 'Select a session'}</Text>
                <Text className="text-[#64748B] font-semibold mt-2">
                  {selectedEvent ? `${selectedEvent.teamName ?? 'Team'} · ${formatCoachDate(selectedEvent.startTime)} · ${formatCoachTimeRange(selectedEvent.startTime, selectedEvent.endTime)}` : 'Attendance roster will appear here.'}
                </Text>
              </View>
              <View className="flex-row gap-3">
                <View className="rounded-2xl bg-[#F0F6FC] px-4 py-3">
                  <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest">Marked</Text>
                  <Text className="text-[#0E2041] text-xl font-black">{markedCount}/{players.length}</Text>
                </View>
                <View className="rounded-2xl bg-[#DCFCE7] px-4 py-3">
                  <Text className="text-[#047857] text-[10px] font-black uppercase tracking-widest">Present</Text>
                  <Text className="text-[#047857] text-xl font-black">{presentCount}</Text>
                </View>
              </View>
            </View>

            {loadingAttendance ? (
              <View className="py-16 items-center">
                <ActivityIndicator size="large" color="var(--c-brand-fg)" />
              </View>
            ) : players.length ? (
              <View className="gap-3">
                {players.map((player) => {
                  const tone = statusTone(player.status);
                  const busy = savingPlayerId === player.playerId;

                  return (
                    <View key={player.playerId} className="rounded-[22px] border border-[#EDF2F7] bg-white px-4 py-4 flex-col md:flex-row md:items-center gap-4">
                      <View className="flex-row items-center gap-4 flex-1 min-w-0">
                        <View className="h-12 w-12 rounded-2xl bg-[#EEF4FB] items-center justify-center">
                          <Text className="text-[#0A2C93] font-black">{player.number ?? `${player.firstName?.[0] ?? 'P'}${player.lastName?.[0] ?? ''}`}</Text>
                        </View>
                        <View className="flex-1 min-w-0">
                          <Text className="text-[#0E2041] text-base font-black" numberOfLines={1}>{player.firstName} {player.lastName}</Text>
                          <View className="mt-2 self-start rounded-full px-3 py-1" style={{ backgroundColor: tone.bg }}>
                            <Text style={{ color: tone.fg }} className="text-[10px] font-black uppercase tracking-widest">{tone.label}</Text>
                          </View>
                        </View>
                      </View>

                      <View className="flex-row flex-wrap gap-2">
                        {STATUS_OPTIONS.map((option) => (
                          <Pressable
                            key={option.status}
                            disabled={busy}
                            onPress={() => markPlayer(player.playerId, option.status)}
                            className="h-10 rounded-full border border-[#DDE8F5] bg-[#F8FBFF] px-3 flex-row items-center gap-2"
                          >
                            {busy ? <ActivityIndicator size="small" color={option.color} /> : <MaterialIcons name={option.icon} size={16} color={option.color} />}
                            <Text style={{ color: option.color }} className="text-xs font-black">{option.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="py-16 items-center">
                <MaterialIcons name="groups" size={34} color="var(--c-faint)" />
                <Text className="text-[#64748B] font-bold text-center mt-3">No players found for this session team.</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
