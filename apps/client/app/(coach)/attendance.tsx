import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent, EventAttendance, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import GlassCard from '../../components/ui/GlassCard';
import PageContainer from '../../components/ui/PageContainer';
import PageHero, { GlassStat } from '../../components/admin/PageHero';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { CoachPlayerRow, SessionRow } from '../../components/coach/CoachPrimitives';
import ProgressRing from '../../components/ui/ProgressRing';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { attendanceRateColor, attendanceStatusTone, eventTypeMeta, getPlayerBadge, isPresentStatus } from '../../components/coach/coachDisplay';
import { formatCoachDate, formatCoachTimeRange, getCoachScopedEvents } from '../../components/coach/coachUtils';
import { AttendanceNoteInput, AttendanceNoteToggle } from '../../components/attendance/AttendanceNoteField';
import AttendanceMarkButtons from '../../components/attendance/AttendanceMarkButtons';
import AttendanceSaveStatus, { useSaveStatus } from '../../components/attendance/AttendanceSaveStatus';
import { attendanceMarkMeta, type AttendanceMark } from '../../utils/attendanceStatus';
import { isAttendanceOpen } from '../../utils/attendanceWindow';
import { defaultSession, splitSessions } from '../../utils/attendanceSessions';
import { coachCanChangeEvent } from '../../utils/coachEventScope';
import { plural } from '../../utils/plural';

/**
 * "Prezență" — pick a session on the left, mark the squad on the right.
 *
 * Every mark saves the moment it is tapped (one request per player), the same
 * on the admin sheet (audit R3-6): a coach marking a roster courtside never
 * loses a whole form to a forgotten "Salvează" or one failed request. A
 * session ahead of today can't be marked yet (server refuses it too).
 * Each row also carries the per-player feedback note, the same field as the
 * admin's sheet (audit R3-5); a saved note notifies the player's family.
 */

type AttendancePlayer = {
  playerId: number;
  firstName: string;
  lastName: string;
  number: number | null;
  status: string | null;
  /** The saved feedback note ('' = none). */
  note: string;
};

/** Sessions offered in the picker — anything older lives on /schedule. */
const UPCOMING_LIMIT = 4;
const PAST_LIMIT = 8;

/**
 * On a phone the picker sits ABOVE the roster, so twelve rows pushed the
 * players a full screen down. Show a couple of each group and let the coach
 * expand.
 */
const MOBILE_GROUP_PREVIEW = 2;

function toAttendancePlayer(player: Player): AttendancePlayer {
  return {
    playerId: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    number: player.number,
    status: null,
    note: '',
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
      note: row.note ?? '',
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
 * Marking row. The four marks are a segmented control (AttendanceMarkButtons):
 * the selected one is filled, so a coach can see at a glance which players
 * are still unmarked.
 */
function AttendanceRow({
  player,
  busy,
  locked,
  onMark,
  onSaveNote,
}: {
  player: AttendancePlayer;
  busy: boolean;
  locked: boolean;
  onMark: (status: AttendanceMark) => void;
  onSaveNote: (note: string) => Promise<boolean>;
}) {
  const unmarked = !player.status;
  const [noteOpen, setNoteOpen] = useState(Boolean(player.note));
  const [draft, setDraft] = useState(player.note);
  const [savingNote, setSavingNote] = useState(false);
  useEffect(() => { setDraft(player.note); }, [player.note]);
  const noteDirty = draft.trim() !== player.note.trim();
  const saveNote = async () => {
    setSavingNote(true);
    try {
      await onSaveNote(draft.trim());
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <View
      className="relative overflow-hidden rounded-[14px] border pl-4 pr-3.5 py-2.5 gap-2.5 flex-col md:flex-row md:flex-wrap md:items-center md:gap-4"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
    >
      {/* Status rail: the row's state is readable from the left edge alone,
          so a coach scrolling a 15-player list sees the gaps at a glance. */}
      <View
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: attendanceMarkMeta(player.status)?.solid ?? 'var(--c-border-strong)', transition: 'background-color 0.2s ease' } as any}
      />
      <View className="flex-row items-center gap-2 flex-1 min-w-0 md:min-w-[170px]">
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
        <AttendanceNoteToggle open={noteOpen} hasNote={Boolean(player.note.trim())} onPress={() => setNoteOpen((v) => !v)} />
      </View>

      <AttendanceMarkButtons
        value={player.status}
        playerName={`${player.firstName} ${player.lastName}`}
        busy={busy}
        disabled={locked}
        onMark={onMark}
      />

      {noteOpen ? (
        <View className="w-full md:basis-full gap-2">
          <AttendanceNoteInput value={draft} onChange={setDraft} playerName={`${player.firstName} ${player.lastName}`} />
          <View className="flex-row items-center justify-end gap-2.5">
            {unmarked ? (
              <Text className="flex-1 text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>
                Marchează întâi prezența, apoi salvează nota.
              </Text>
            ) : noteDirty ? (
              <Text className="flex-1 text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>
                Familia primește nota ca notificare.
              </Text>
            ) : null}
            <Button
              size="sm"
              variant={noteDirty ? 'primary' : 'secondary'}
              icon={noteDirty ? 'save' : 'check'}
              label={noteDirty ? 'Salvează nota' : 'Salvat'}
              disabled={!noteDirty || unmarked || busy || locked}
              loading={savingNote}
              onPress={saveNote}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function CoachAttendanceScreen() {
  const { session } = useSession();
  const { isMobile } = useResponsive();
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [players, setPlayers] = useState<AttendancePlayer[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingPlayerId, setSavingPlayerId] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveStatus = useSaveStatus();

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setError(null);

    try {
      // The last month (sessions still being marked) plus everything ahead.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [eventRows, teamRows] = await Promise.all([
        eventsApi.getEvents({ start: since.toISOString() }),
        teamsApi.getTeams(),
      ]);
      const groups = splitSessions(getCoachScopedEvents(eventRows, session, teamRows).filter((event) => event.type !== 'admin'));
      setTeams(teamRows);
      setEvents([...groups.upcoming, ...groups.past]);
      setSelectedEventId((current) => current ?? defaultSession(groups)?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu s-au putut încărca sesiunile.');
    } finally {
      setLoadingEvents(false);
    }
  }, [session]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // `events` is already upcoming (soonest first) then past (latest first).
  const pickerGroups = useMemo(() => {
    const groups = splitSessions(events);
    return { upcoming: groups.upcoming.slice(0, UPCOMING_LIMIT), past: groups.past.slice(0, PAST_LIMIT) };
  }, [events]);
  const pickerCount = pickerGroups.upcoming.length + pickerGroups.past.length;
  // Keep the selected session visible even when it sits past the preview cut.
  const visibleGroups = useMemo(() => {
    if (!isMobile || showAllSessions) return pickerGroups;
    const cut = (list: CalendarEvent[]) => {
      const preview = list.slice(0, MOBILE_GROUP_PREVIEW);
      const selected = list.find((event) => event.id === selectedEventId);
      return selected && !preview.includes(selected) ? [...preview.slice(0, MOBILE_GROUP_PREVIEW - 1), selected] : preview;
    };
    return { upcoming: cut(pickerGroups.upcoming), past: cut(pickerGroups.past) };
  }, [isMobile, pickerGroups, selectedEventId, showAllSessions]);
  const hiddenSessionCount = pickerCount - visibleGroups.upcoming.length - visibleGroups.past.length;

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  // The session whose sheet is on screen. Responses (loads AND saves) that
  // come back for any other session are dropped: tapping through the picker
  // quickly used to let a slow response for session A overwrite session B's
  // list — and a save for A could flip the same player's row on B.
  const activeEventIdRef = useRef<number | null>(null);
  const selectedNotYet = selectedEvent ? !isAttendanceOpen(selectedEvent.startTime) : false;
  // A team with no coach is shown, but its sheet is the admin's (WP7-F1).
  const selectedNotMine = selectedEvent ? !coachCanChangeEvent(selectedEvent, teams, session?.id) : false;
  const selectedLocked = selectedNotYet || selectedNotMine;
  const { reset: resetSaveStatus } = saveStatus;

  const loadAttendance = useCallback(async () => {
    activeEventIdRef.current = selectedEvent?.id ?? null;
    resetSaveStatus();
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
  }, [selectedEvent, resetSaveStatus]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  /** Optimistic: the segment fills at once and rolls back if the save fails. */
  const markPlayer = async (playerId: number, status: AttendanceMark) => {
    if (!selectedEvent || selectedLocked) return;

    const eventId = selectedEvent.id;
    const previous = players.find((player) => player.playerId === playerId)?.status ?? null;
    const setStatus = (value: string | null) => setPlayers((current) => current.map((player) => player.playerId === playerId ? { ...player, status: value } : player));
    setSavingPlayerId(playerId);
    setStatus(status);

    try {
      await saveStatus.track(eventsApi.updateEventAttendance(eventId, [{ playerId, status }]));
    } catch (err) {
      if (activeEventIdRef.current === eventId) setStatus(previous);
      Alert.alert('Prezență', err instanceof Error ? err.message : 'Nu s-a putut actualiza prezența.');
    } finally {
      setSavingPlayerId(null);
    }
  };

  /** Saves one player's note with their current status (the API needs both). */
  const saveNote = async (playerId: number, note: string) => {
    if (!selectedEvent) return false;
    const player = players.find((row) => row.playerId === playerId);
    if (!player?.status) return false;
    const eventId = selectedEvent.id;
    try {
      await saveStatus.track(eventsApi.updateEventAttendance(eventId, [{ playerId, status: player.status, note: note || null }]));
      if (activeEventIdRef.current !== eventId) return true;
      setPlayers((current) => current.map((row) => (row.playerId === playerId ? { ...row, note } : row)));
      return true;
    } catch (err) {
      Alert.alert('Notă', err instanceof Error ? err.message : 'Nu s-a putut salva nota.');
      return false;
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
      await saveStatus.track(eventsApi.updateEventAttendance(
        eventId,
        unmarkedIds.map((playerId) => ({ playerId, status: 'present' })),
      ));
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
        <PageHero
          eyebrow={selectedMeta ? `Prezență · ${selectedMeta.label}` : 'Prezență'}
          title={selectedEvent?.title ?? 'Prezență'}
          subtitle={selectedEvent
            ? `${selectedEvent.teamName ?? 'Echipă'} · ${formatCoachDate(selectedEvent.startTime)} · ${formatCoachTimeRange(selectedEvent.startTime, selectedEvent.endTime)}`
            : 'Alege o sesiune și marchează disponibilitatea jucătorilor.'}
          leading={
            <ProgressRing
              value={players.length ? markedPercent : null}
              size={56}
              stroke={6}
              color={markedPercent === 100 ? 'var(--c-success)' : 'var(--c-brand-fg)'}
              label={`${markedCount} din ${players.length} marcați`}
            >
              {markedPercent === 100 ? (
                <MaterialIcons name="check" size={20} color="var(--c-success-fg)" />
              ) : (
                <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>{markedPercent}%</Text>
              )}
            </ProgressRing>
          }
          actions={
            <>
              {unmarkedCount > 0 && players.length > 0 && !selectedLocked ? (
                <Button
                  variant="primary"
                  icon="check-circle"
                  label={`Restul prezenți (${unmarkedCount})`}
                  loading={bulkSaving}
                  onPress={() => setBulkConfirmOpen(true)}
                />
              ) : null}
              <Pressable
                onPress={() => loadEvents()}
                className="ui-press w-10 h-10 rounded-[11px] border items-center justify-center"
                style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
                accessibilityRole="button"
                accessibilityLabel="Reîmprospătează"
              >
                {loadingEvents ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
              </Pressable>
            </>
          }
        >
          <View className="grid grid-cols-3 gap-2 ui-stagger">
            <GlassStat dot="var(--c-brand-fg)" label="Marcați" value={`${markedCount}/${players.length}`} hint="din lot" />
            <GlassStat dot="var(--c-success)" label="Prezenți" value={presentCount} hint="jucători" />
            <GlassStat
              dot={presentRate == null ? 'var(--c-faint)' : attendanceRateColor(presentRate)}
              label="Rată"
              value={presentRate ?? '—'}
              suffix={presentRate == null ? undefined : '%'}
              bar={presentRate ?? undefined}
            />
          </View>
        </PageHero>

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
                <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Sesiuni</Text>
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
                  {([
                    { key: 'upcoming', title: 'Urmează', list: visibleGroups.upcoming },
                    { key: 'past', title: 'Trecute', list: visibleGroups.past },
                  ] as const).map((group) => group.list.length ? (
                    <View key={group.key} className="gap-2">
                      <Text className="t-eyebrow mt-1" style={{ color: 'var(--c-faint)' }} accessibilityRole="header">{group.title}</Text>
                      {group.list.map((event) => (
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
                    </View>
                  ) : null)}
                  {hiddenSessionCount > 0 || (isMobile && showAllSessions) ? (
                    <Pressable
                      onPress={() => setShowAllSessions((value) => !value)}
                      accessibilityRole="button"
                      accessibilityLabel={showAllSessions ? 'Arată mai puține sesiuni' : `Arată toate sesiunile (${pickerCount})`}
                      className="ui-press h-10 rounded-[11px] border flex-row items-center justify-center gap-1.5"
                      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
                    >
                      <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                        {showAllSessions ? 'Arată mai puține' : `Arată toate (${pickerCount})`}
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
            {loadingAttendance ? (
              <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă prezența">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-[110px] md:h-[76px] w-full rounded-[14px]" />
                ))}
              </View>
            ) : players.length ? (
              <View className="gap-2.5">
                {selectedLocked && selectedEvent ? (
                  <View className="flex-row items-start gap-2.5 rounded-[12px] border px-3.5 py-3" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
                    <MaterialIcons name="lock" size={18} color="var(--c-muted)" style={{ marginTop: 1 }} />
                    <Text className="flex-1 text-[13px] font-medium leading-5" style={{ color: 'var(--c-ink-soft)' }}>
                      {selectedNotMine
                        ? 'Echipa nu are un antrenor alocat, așa că prezența o notează administratorul clubului. Tu vezi lista.'
                        : `Prezența se poate nota din ziua evenimentului (${formatCoachDate(selectedEvent.startTime)}). Până atunci vezi doar lotul.`}
                    </Text>
                  </View>
                ) : (
                  <AttendanceSaveStatus state={saveStatus.state} />
                )}
                <View className="gap-2.5 ui-stagger">
                  {players.map((player) => (
                    <AttendanceRow
                      key={player.playerId}
                      player={player}
                      busy={bulkSaving || savingPlayerId === player.playerId}
                      locked={selectedLocked}
                      onMark={(status) => markPlayer(player.playerId, status)}
                      onSaveNote={(note) => saveNote(player.playerId, note)}
                    />
                  ))}
                </View>
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
        message={`${plural(unmarkedIds.length, 'jucător nemarcat va fi trecut', 'jucători nemarcați vor fi trecuți')} ca prezenți. Cei deja marcați nu se schimbă.`}
        confirmLabel="Confirmă"
        cancelLabel="Anulează"
        loading={bulkSaving}
        onConfirm={markRemainingPresent}
        onCancel={() => setBulkConfirmOpen(false)}
      />
    </ScrollView>
  );
}
