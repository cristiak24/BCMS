import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent, EventAttendance, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import GlassCard from '../../components/ui/GlassCard';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { CoachPlayerRow, SessionRow, StatTile } from '../../components/coach/CoachPrimitives';
import ProgressRing from '../../components/ui/ProgressRing';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { attendanceRateColor, attendanceStatusTone, eventTypeMeta, getPlayerBadge, isPresentStatus } from '../../components/coach/coachDisplay';
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

/**
 * On a phone the picker sits ABOVE the roster, so twelve rows pushed the
 * players a full screen down. Show a few and let the coach expand.
 */
const MOBILE_SESSION_PREVIEW = 4;

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
      className="relative overflow-hidden rounded-[14px] border pl-4 pr-3.5 py-3 gap-3 flex-col md:flex-row md:items-center md:gap-4"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
    >
      {/* Status rail: the row's state is readable from the left edge alone,
          so a coach scrolling a 15-player list sees the gaps at a glance. */}
      <View
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: unmarked ? 'var(--c-border-strong)' : attendanceStatusTone(player.status).fg, transition: 'background-color 0.2s ease' } as any}
      />
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
              className="ui-press flex-1 md:flex-none h-10 rounded-[11px] border px-3 flex-row items-center justify-center gap-1.5"
              style={{
                borderColor: active ? option.color : 'var(--c-border)',
                backgroundColor: active ? option.bg : 'var(--c-surface-2)',
                boxShadow: active ? `inset 0 0 0 1px ${option.color}` : 'none',
                opacity: busy ? 0.6 : 1,
                transition: 'background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
              } as any}
            >
              {busy ? (
                <ActivityIndicator size="small" color={option.color} />
              ) : (
                <MaterialIcons name={option.icon} size={16} color={active ? option.color : 'var(--c-muted)'} />
              )}
              <Text className="text-[12.5px] font-bold" style={{ color: active ? option.color : 'var(--c-muted)' }} numberOfLines={1}>
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
  const { isMobile } = useResponsive();
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [players, setPlayers] = useState<AttendancePlayer[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingPlayerId, setSavingPlayerId] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setError(null);

    try {
      // The last month (sessions still being marked) plus everything ahead.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const eventRows = await eventsApi.getEvents({ start: since.toISOString() });
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

  const pickerSessions = useMemo(() => events.slice(0, SESSION_LIMIT), [events]);
  // Keep the selected session visible even when it sits past the preview cut.
  const visibleSessions = useMemo(() => {
    if (!isMobile || showAllSessions) return pickerSessions;
    const preview = pickerSessions.slice(0, MOBILE_SESSION_PREVIEW);
    const selected = pickerSessions.find((event) => event.id === selectedEventId);
    return selected && !preview.includes(selected) ? [...preview.slice(0, MOBILE_SESSION_PREVIEW - 1), selected] : preview;
  }, [isMobile, pickerSessions, selectedEventId, showAllSessions]);
  const hiddenSessionCount = pickerSessions.length - visibleSessions.length;

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  // The session whose sheet is on screen. Responses (loads AND saves) that
  // come back for any other session are dropped: tapping through the picker
  // quickly used to let a slow response for session A overwrite session B's
  // list — and a save for A could flip the same player's row on B.
  const activeEventIdRef = useRef<number | null>(null);

  const loadAttendance = useCallback(async () => {
    activeEventIdRef.current = selectedEvent?.id ?? null;
    if (!selectedEvent) {
      setPlayers([]);
      return;
    }

    const eventId = selectedEvent.id;
    setLoadingAttendance(true);
    setError(null);

    try {
      const [attendanceRows, teamPlayers] = await Promise.all([
        eventsApi.getEventAttendance(eventId),
        selectedEvent.teamId != null ? teamsApi.getTeamPlayers(selectedEvent.teamId).catch(() => []) : Promise.resolve([]),
      ]);
      if (activeEventIdRef.current !== eventId) return;
      setPlayers(mergeAttendance(teamPlayers, attendanceRows));
    } catch (err) {
      if (activeEventIdRef.current !== eventId) return;
      setError(err instanceof Error ? err.message : 'Nu s-a putut încărca prezența.');
    } finally {
      if (activeEventIdRef.current === eventId) setLoadingAttendance(false);
    }
  }, [selectedEvent]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const markPlayer = async (playerId: number, status: AttendanceStatus) => {
    if (!selectedEvent) return;

    const eventId = selectedEvent.id;
    setSavingPlayerId(playerId);

    try {
      await eventsApi.updateEventAttendance(eventId, [{ playerId, status }]);
      if (activeEventIdRef.current !== eventId) return;
      setPlayers((current) => current.map((player) => player.playerId === playerId ? { ...player, status } : player));
    } catch (err) {
      Alert.alert('Prezență', err instanceof Error ? err.message : 'Nu s-a putut actualiza prezența.');
    } finally {
      setSavingPlayerId(null);
    }
  };

  const unmarkedIds = players.filter((player) => !player.status).map((player) => player.playerId);

  /**
   * "Restul prezenți": the common courtside case is a full squad with one or
   * two absences. Mark the exceptions by hand, then fill every still-unmarked
   * player as present in ONE request — already-marked rows are never touched.
   */
  const markRemainingPresent = async () => {
    if (!selectedEvent || !unmarkedIds.length) {
      setBulkConfirmOpen(false);
      return;
    }

    const eventId = selectedEvent.id;
    setBulkSaving(true);
    try {
      await eventsApi.updateEventAttendance(
        eventId,
        unmarkedIds.map((playerId) => ({ playerId, status: 'present' })),
      );
      setBulkConfirmOpen(false);
      if (activeEventIdRef.current !== eventId) return;
      const ids = new Set(unmarkedIds);
      setPlayers((current) => current.map((player) => (ids.has(player.playerId) ? { ...player, status: 'present' } : player)));
      setBulkConfirmOpen(false);
    } catch (err) {
      setBulkConfirmOpen(false);
      Alert.alert('Prezență', err instanceof Error ? err.message : 'Nu s-a putut actualiza prezența.');
    } finally {
      setBulkSaving(false);
    }
  };

  const markedCount = players.filter((player) => player.status).length;
  const presentCount = players.filter((player) => isPresentStatus(player.status)).length;
  const presentRate = markedCount ? Math.round((presentCount / markedCount) * 100) : null;
  const unmarkedCount = players.length - markedCount;
  const markedPercent = players.length ? Math.round((markedCount / players.length) * 100) : 0;
  const selectedMeta = selectedEvent ? eventTypeMeta(selectedEvent.type) : null;

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
          <View className="w-full xl:w-[360px] shrink-0">
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
                <View className="gap-2 ui-stagger">
                  {visibleSessions.map((event) => (
                    <SessionRow
                      key={event.id}
                      compact
                      event={event}
                      active={event.id === selectedEventId}
                      onPress={() => {
                        setSelectedEventId(event.id);
                        if (isMobile) setShowAllSessions(false);
                      }}
                    />
                  ))}
                  {hiddenSessionCount > 0 || (isMobile && showAllSessions) ? (
                    <Pressable
                      onPress={() => setShowAllSessions((value) => !value)}
                      accessibilityRole="button"
                      accessibilityLabel={showAllSessions ? 'Arată mai puține sesiuni' : `Arată toate sesiunile (${pickerSessions.length})`}
                      className="ui-press h-10 rounded-[11px] border flex-row items-center justify-center gap-1.5"
                      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
                    >
                      <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                        {showAllSessions ? 'Arată mai puține' : `Arată toate (${pickerSessions.length})`}
                      </Text>
                      <MaterialIcons name="expand-more" size={16} color="var(--c-brand-fg)" style={{ transform: showAllSessions ? 'rotate(180deg)' : undefined }} />
                    </Pressable>
                  ) : null}
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
              <View className="flex-row items-center gap-4">
                <ProgressRing
                  value={players.length ? markedPercent : null}
                  size={64}
                  stroke={7}
                  color={markedPercent === 100 ? 'var(--c-success)' : 'var(--c-brand-fg)'}
                  label={`${markedCount} din ${players.length} marcați`}
                >
                  {markedPercent === 100 ? (
                    <MaterialIcons name="check" size={22} color="var(--c-success-fg)" />
                  ) : (
                    <Text className="t-num text-[14px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>{markedPercent}%</Text>
                  )}
                </ProgressRing>
              <View className="flex-1 min-w-0">
                {selectedMeta ? (
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <MaterialIcons name={selectedMeta.icon} size={13} color={selectedMeta.fg} />
                    <Text className="t-eyebrow" style={{ color: selectedMeta.fg }}>{selectedMeta.label}</Text>
                  </View>
                ) : null}
                <Text className="text-[18px] font-bold leading-snug" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>
                  {selectedEvent?.title ?? 'Selectează o sesiune'}
                </Text>
                <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
                  {selectedEvent
                    ? `${selectedEvent.teamName ?? 'Echipă'} · ${formatCoachDate(selectedEvent.startTime)} · ${formatCoachTimeRange(selectedEvent.startTime, selectedEvent.endTime)}`
                    : 'Lista de prezență apare aici.'}
                </Text>
              </View>
              </View>

              <View className="flex-row gap-2 sm:gap-2.5">
                <StatTile icon="fact-check" label="Marcați" value={`${markedCount}/${players.length}`} hint="din lot" />
                <StatTile icon="check-circle" tone="success" label="Prezenți" value={presentCount} hint="jucători" />
                <StatTile
                  icon="trending-up"
                  label="Rată"
                  value={presentRate == null ? '—' : `${presentRate}%`}
                  hint={markedCount ? 'din marcați' : 'nemarcată'}
                  color={presentRate == null ? undefined : attendanceRateColor(presentRate)}
                />
              </View>

              {unmarkedCount > 0 && players.length > 0 ? (
                <Pressable
                  onPress={() => setBulkConfirmOpen(true)}
                  disabled={bulkSaving}
                  accessibilityRole="button"
                  accessibilityLabel={`Marchează restul prezenți (${unmarkedCount})`}
                  className="ui-press h-11 rounded-[12px] px-4 flex-row items-center justify-center gap-2 border"
                  style={{ backgroundColor: 'var(--c-success-bg)', borderColor: 'var(--c-success-border)', opacity: bulkSaving ? 0.7 : 1 } as any}
                >
                  {bulkSaving ? (
                    <ActivityIndicator size="small" color="var(--c-success-fg)" />
                  ) : (
                    <MaterialIcons name="check-circle" size={17} color="var(--c-success-fg)" />
                  )}
                  <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-success-fg)' }}>
                    Marchează restul prezenți ({unmarkedCount})
                  </Text>
                </Pressable>
              ) : null}
            </GlassCard>

            {loadingAttendance ? (
              <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă prezența">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-[110px] md:h-[76px] w-full rounded-[14px]" />
                ))}
              </View>
            ) : players.length ? (
              <View className="gap-2.5 ui-stagger">
                {players.map((player) => (
                  <AttendanceRow
                    key={player.playerId}
                    player={player}
                    busy={bulkSaving || savingPlayerId === player.playerId}
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

      <ConfirmDialog
        visible={bulkConfirmOpen}
        icon="check-circle"
        title="Marchează restul prezenți"
        message={`${unmarkedIds.length} ${unmarkedIds.length === 1 ? 'jucător nemarcat va fi trecut' : 'jucători nemarcați vor fi trecuți'} ca prezenți. Cei deja marcați nu se schimbă.`}
        confirmLabel="Confirmă"
        cancelLabel="Anulează"
        loading={bulkSaving}
        onConfirm={markRemainingPresent}
        onCancel={() => setBulkConfirmOpen(false)}
      />
    </ScrollView>
  );
}
