import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent, EventAttendance, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import GlassCard from '../../components/ui/GlassCard';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { CoachPlayerRow, SessionRow, StatTile } from '../../components/coach/CoachPrimitives';
import { attendanceStatusTone, getPlayerBadge, isPresentStatus } from '../../components/coach/coachDisplay';
import {
  formatCoachDate,
  formatCoachTimeRange,
  getCoachScopedEvents,
  getEventTimestamp,
  isUpcoming,
} from '../../components/coach/coachUtils';

/**
 * "Prezență" — pick a session on the left, mark the squad on the right.
 *
 * The status buttons write through one at a time (PATCH per player) so a coach
 * marking a roster courtside never loses a whole form to one failed request.
 */

type AttendanceStatus = 'present' | 'absent' | 'medical';

type AttendancePlayer = {
  playerId: number;
  firstName: string;
  lastName: string;
  number: number | null;
  status: string | null;
};

/** Sessions offered in the picker — anything older lives on /schedule. */
const SESSION_LIMIT = 12;

const STATUS_OPTIONS: { status: AttendanceStatus; label: string; icon: string; color: string; bg: string }[] = [
  { status: 'present', label: 'Prezent', icon: 'check-circle', color: 'var(--c-success-fg)', bg: 'var(--c-success-bg)' },
  { status: 'absent', label: 'Absent', icon: 'cancel', color: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
  { status: 'medical', label: 'Motivat', icon: 'medical-services', color: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' },
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

/**
 * Marking row. The three options are a segmented control rather than three
 * loose buttons: the selected one is filled, so a coach can see at a glance
 * which players are still unmarked.
 *
 * That filled segment is the *only* status indicator on the row — an earlier
 * pass also carried a "Prezent" pill beside the buttons, which put the same
 * word twice in the same 200px.
 */
function AttendanceRow({
  player,
  busy,
  onMark,
}: {
  player: AttendancePlayer;
  busy: boolean;
  onMark: (status: AttendanceStatus) => void;
}) {
  const current = String(player.status ?? '').toLowerCase();
  const unmarked = !player.status;

  return (
    <View
      className="rounded-[14px] border px-3.5 py-3 gap-3 flex-col md:flex-row md:items-center md:gap-4"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-1 min-w-0">
        <CoachPlayerRow
          bare
          firstName={player.firstName}
          lastName={player.lastName}
          badge={getPlayerBadge(player)}
          // Only the unmarked state needs saying — a marked one is already
          // spelled out by the filled segment on the right.
          meta={unmarked ? attendanceStatusTone(null).label : null}
        />
      </View>

      {/* Full-width thirds on mobile, intrinsic width from md up — three
          fixed-width pills wrapped to two rows at 375px. */}
      <View className="flex-row gap-1.5 shrink-0">
        {STATUS_OPTIONS.map((option) => {
          const active = current === option.status || (option.status === 'medical' && current === 'excused');

          return (
            <Pressable
              key={option.status}
              disabled={busy}
              onPress={() => onMark(option.status)}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: busy }}
              accessibilityLabel={`${option.label}: ${player.firstName} ${player.lastName}`}
              className="flex-1 md:flex-none h-10 rounded-[11px] border px-2.5 flex-row items-center justify-center gap-1.5"
              style={{
                borderColor: active ? option.color : 'var(--c-border)',
                backgroundColor: active ? option.bg : 'var(--c-surface-2)',
                opacity: busy ? 0.6 : 1,
              } as any}
            >
              {busy ? (
                <ActivityIndicator size="small" color={option.color} />
              ) : (
                <MaterialIcons name={option.icon} size={15} color={active ? option.color : 'var(--c-muted)'} />
              )}
              <Text className="text-[11.5px] font-bold" style={{ color: active ? option.color : 'var(--c-muted)' }} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function CoachAttendanceScreen() {
  const { session } = useSession();
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
      setError(err instanceof Error ? err.message : 'Nu s-au putut încărca sesiunile.');
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
      setError(err instanceof Error ? err.message : 'Nu s-a putut încărca prezența.');
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
      Alert.alert('Prezență', err instanceof Error ? err.message : 'Nu s-a putut actualiza prezența.');
    } finally {
      setSavingPlayerId(null);
    }
  };

  const markedCount = players.filter((player) => player.status).length;
  const presentCount = players.filter((player) => isPresentStatus(player.status)).length;
  const presentRate = markedCount ? Math.round((presentCount / markedCount) * 100) : null;

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHeader
          title="Prezență"
          subtitle="Marchează disponibilitatea jucătorilor pentru sesiunile tale."
          actions={
            <Pressable
              onPress={() => loadEvents()}
              className="w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
            >
              {loadingEvents ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

        {error ? (
          <View className="mb-4">
            <ErrorState
              title="Ceva nu a mers"
              message={error}
              actionLabel="Reîncearcă"
              onAction={() => loadEvents()}
            />
          </View>
        ) : null}

        <View className="flex-col xl:flex-row gap-4">
          {/* Picker first on mobile — a coach chooses the session before they
              can mark anyone, so it must not sit below a full roster. */}
          <View className="w-full xl:w-[340px] shrink-0">
            <GlassCard className="gap-3">
              <View>
                <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Sesiuni</Text>
                <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }}>
                  Alege sesiunea de marcat.
                </Text>
              </View>

              {loadingEvents ? (
                <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă sesiunile">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-[68px] w-full rounded-[14px]" />
                  ))}
                </View>
              ) : events.length ? (
                <View className="gap-2.5">
                  {events.slice(0, SESSION_LIMIT).map((event) => (
                    <SessionRow
                      key={event.id}
                      event={event}
                      active={event.id === selectedEventId}
                      onPress={() => setSelectedEventId(event.id)}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon="event-busy"
                  compact
                  title="Nicio sesiune"
                  message="Sesiunile la care ești antrenor apar aici."
                />
              )}
            </GlassCard>
          </View>

          <View className="flex-1 min-w-0 gap-4">
            <GlassCard className="gap-4">
              <View>
                <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>
                  {selectedEvent?.title ?? 'Selectează o sesiune'}
                </Text>
                <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
                  {selectedEvent
                    ? `${selectedEvent.teamName ?? 'Echipă'} · ${formatCoachDate(selectedEvent.startTime)} · ${formatCoachTimeRange(selectedEvent.startTime, selectedEvent.endTime)}`
                    : 'Lista de prezență apare aici.'}
                </Text>
              </View>

              <View className="flex-row gap-2 sm:gap-2.5">
                <StatTile label="Marcați" value={`${markedCount}/${players.length}`} hint="din lot" />
                <StatTile label="Prezenți" value={presentCount} hint="jucători" color="var(--c-success-fg)" />
                <StatTile
                  label="Rată"
                  value={presentRate == null ? '—' : `${presentRate}%`}
                  hint={markedCount ? 'din marcați' : 'nemarcată'}
                  color={presentRate == null ? undefined : 'var(--c-ink)'}
                />
              </View>
            </GlassCard>

            {loadingAttendance ? (
              <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă prezența">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-[110px] md:h-[76px] w-full rounded-[14px]" />
                ))}
              </View>
            ) : players.length ? (
              <View className="gap-2.5">
                {players.map((player) => (
                  <AttendanceRow
                    key={player.playerId}
                    player={player}
                    busy={savingPlayerId === player.playerId}
                    onMark={(status) => markPlayer(player.playerId, status)}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="groups"
                title={selectedEvent ? 'Niciun jucător în lot' : 'Nicio sesiune selectată'}
                message={selectedEvent
                  ? 'Echipa acestei sesiuni nu are jucători alocați.'
                  : 'Alege o sesiune din listă pentru a marca prezența.'}
              />
            )}
          </View>
        </View>
      </PageContainer>
    </ScrollView>
  );
}
