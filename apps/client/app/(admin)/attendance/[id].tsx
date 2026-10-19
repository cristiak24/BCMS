import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { teamsApi, Team, Player } from '../../../services/teamsApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../../components/HeaderContext';
import PageHero, { GlassStat } from '../../../components/admin/PageHero';
import Button from '../../../components/ui/Button';
import PageContainer from '../../../components/ui/PageContainer';
import FilterChips from '../../../components/ui/FilterChips';
import ProgressRing from '../../../components/ui/ProgressRing';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import { CoachPlayerRow } from '../../../components/coach/CoachPrimitives';
import { eventTypeMeta, getPlayerBadge } from '../../../components/coach/coachDisplay';
import { formatCoachDate, formatCoachTimeRange } from '../../../components/coach/coachUtils';
import { AttendanceNoteInput, AttendanceNoteToggle } from '../../../components/attendance/AttendanceNoteField';
import AttendanceMarkButtons from '../../../components/attendance/AttendanceMarkButtons';
import AttendanceSaveStatus, { useSaveStatus } from '../../../components/attendance/AttendanceSaveStatus';
import { attendanceMarkMeta, toAttendanceMark, type AttendanceMark } from '../../../utils/attendanceStatus';
import { isAttendanceOpen } from '../../../utils/attendanceWindow';
import { plural } from '../../../utils/plural';

/**
 * Admin "Notare prezență" for one event.
 *
 * Rebuilt on the coach Prezență vocabulary (status rail, filled segment,
 * "restul prezenți"): the old page drew its title in `--c-brand-surface-deep`
 * (invisible on the dark shell), used 4px coloured left borders on 20px-radius
 * cards, a separate in-card search next to the header search, and a table
 * header that sat over an empty roster.
 *
 * Same behaviour as the coach screen (audit R3-6): a mark saves the moment it
 * is tapped and rolls back if the request fails; a note has its own
 * "Salvează nota" (a note typed letter by letter should not be a request per
 * keystroke). A session ahead of today is read-only. The header search
 * filters the roster.
 */

type StatusFilter = 'all' | 'unmarked' | AttendanceMark;

type RosterEntry = {
  id: number;
  firstName: string;
  lastName: string;
  number: number | null;
  position: string | null;
  status: AttendanceMark | null;
  /** Draft note as typed. */
  note: string;
  /** Note as last saved. */
  savedNote: string;
};

const SCHEDULE_PATH = '/admin/schedule';

function sortRoster(a: RosterEntry, b: RosterEntry) {
  const aNumber = a.number ?? 999;
  const bNumber = b.number ?? 999;
  if (aNumber !== bNumber) return aNumber - bNumber;
  return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
}

function noteDirty(entry: RosterEntry) {
  return entry.note.trim() !== entry.savedNote.trim();
}

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
  const { toasts, showToast, dismissToast } = useToasts();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const saveStatus = useSaveStatus();
  // Flag the event as graded once per visit; a failure there must not undo a saved mark.
  const gradedRef = useRef(false);

  useEffect(() => {
    setSearchPlaceholder('Caută jucător după nume sau număr…');
    setHeaderActions(null);
    setMobileFab(null);
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setSearchValue('');
      setHeaderActions(null);
      setMobileFab(null);
    };
  }, [setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

  const loadData = useCallback(async () => {
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      setError('Evenimentul nu există.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const eventDetails = await eventsApi.getEventById(eventId);
      setEvent(eventDetails);

      if (eventDetails.teamId) {
        const [teamDetails, players, attendance] = await Promise.all([
          teamsApi.getTeamById(eventDetails.teamId).catch(() => null),
          teamsApi.getTeamPlayers(eventDetails.teamId).catch(() => [] as Player[]),
          eventsApi.getEventAttendance(eventId),
        ]);
        setTeam(teamDetails);

        const rows = players
          .map((player): RosterEntry => {
            const record = attendance.find((row) => row.playerId === player.id);
            return {
              id: player.id,
              firstName: player.firstName,
              lastName: player.lastName,
              number: player.number,
              position: player.position,
              status: toAttendanceMark(record?.status),
              note: record?.note ?? '',
              savedNote: record?.note ?? '',
            };
          })
          .sort(sortRoster);
        setRoster(rows);
        setOpenNotes(new Set(rows.filter((row) => row.note.trim()).map((row) => row.id)));
      } else {
        setRoster([]);
      }
    } catch (err) {
      console.error('Failed to load attendance screen data', err);
      setError(err instanceof Error ? err.message : 'Prezența nu a putut fi încărcată.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dirtyNotes = roster.filter(noteDirty).length;
  const locked = event ? !isAttendanceOpen(event.startTime) : false;

  // An unsaved note is easy to lose with one misclick on the sidebar.
  useEffect(() => {
    if (!dirtyNotes) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyNotes]);

  const patchRows = (ids: Set<number>, patch: (row: RosterEntry) => RosterEntry) => {
    setRoster((rows) => rows.map((row) => (ids.has(row.id) ? patch(row) : row)));
  };

  const setBusy = (ids: number[], busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => (busy ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const markGraded = () => {
    if (!event || gradedRef.current || String(event.status ?? '').toLowerCase() === 'graded') return;
    gradedRef.current = true;
    eventsApi.updateEvent(event.id, { status: 'graded' }).then(setEvent).catch(() => { gradedRef.current = false; });
  };

  /** Saves marks at once; optimistic, rolled back on failure. */
  const saveMarks = async (marks: { id: number; status: AttendanceMark }[]) => {
    if (!event || locked || !marks.length) return false;
    const ids = marks.map((mark) => mark.id);
    const previous = new Map(roster.filter((row) => ids.includes(row.id)).map((row) => [row.id, row.status]));
    const next = new Map(marks.map((mark) => [mark.id, mark.status]));
    patchRows(new Set(ids), (row) => ({ ...row, status: next.get(row.id) ?? row.status }));
    setBusy(ids, true);
    try {
      await saveStatus.track(eventsApi.updateEventAttendance(event.id, marks.map((mark) => ({ playerId: mark.id, status: mark.status }))));
      markGraded();
      return true;
    } catch (err) {
      patchRows(new Set(ids), (row) => ({ ...row, status: previous.get(row.id) ?? null }));
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Prezența nu s-a salvat. Încearcă din nou.' });
      return false;
    } finally {
      setBusy(ids, false);
    }
  };

  const setStatus = (playerId: number, status: AttendanceMark) => {
    const row = roster.find((entry) => entry.id === playerId);
    if (!row || row.status === status) return;
    void saveMarks([{ id: playerId, status }]);
  };

  const saveNote = async (playerId: number) => {
    const row = roster.find((entry) => entry.id === playerId);
    if (!event || locked || !row?.status) return;
    const note = row.note.trim();
    setBusy([playerId], true);
    try {
      await saveStatus.track(eventsApi.updateEventAttendance(event.id, [{ playerId, status: row.status, note: note || null }]));
      patchRows(new Set([playerId]), (entry) => ({ ...entry, note, savedNote: note }));
      showToast({ variant: 'success', message: note ? 'Nota a fost salvată. Familia primește o notificare.' : 'Nota a fost ștearsă.' });
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nota nu s-a salvat. Încearcă din nou.' });
    } finally {
      setBusy([playerId], false);
    }
  };

  const setNote = (playerId: number, note: string) => {
    setRoster((rows) => rows.map((row) => (row.id === playerId ? { ...row, note } : row)));
  };

  const toggleNote = (playerId: number) => {
    setOpenNotes((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const markRemainingPresent = async () => {
    setBulkSaving(true);
    try {
      await saveMarks(roster.filter((row) => !row.status).map((row) => ({ id: row.id, status: 'present' as const })));
    } finally {
      setBulkSaving(false);
      setBulkConfirmOpen(false);
    }
  };

  const counts = useMemo(() => ({
    all: roster.length,
    unmarked: roster.filter((row) => !row.status).length,
    present: roster.filter((row) => row.status === 'present').length,
    absent: roster.filter((row) => row.status === 'absent').length,
    late: roster.filter((row) => row.status === 'late').length,
    medical: roster.filter((row) => row.status === 'medical').length,
  }), [roster]);

  const visibleRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return roster.filter((row) => {
      if (filter === 'unmarked' ? row.status : filter !== 'all' && row.status !== filter) return false;
      if (!query) return true;
      return `${row.firstName} ${row.lastName}`.toLowerCase().includes(query) || String(row.number ?? '').includes(query);
    });
  }, [roster, filter, searchValue]);

  const goBack = () => router.back(SCHEDULE_PATH);

  const backButton = (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel="Înapoi la program"
      className="ui-press self-start h-9 pl-2 pr-3 rounded-[10px] border flex-row items-center gap-1.5"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
    >
      <MaterialIcons name="chevron-left" size={18} color="var(--c-ink-soft)" />
      <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Program</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
        <PageContainer>
          <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă prezența">
            <Skeleton className="h-9 w-28 rounded-[10px]" />
            <Skeleton className="h-8 w-2/3 max-w-[520px] rounded-[10px]" />
            <Skeleton className="h-[180px] lg:h-[104px] w-full rounded-[16px]" />
            <View className="gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[120px] lg:h-[68px] w-full rounded-[14px]" />
              ))}
            </View>
          </View>
        </PageContainer>
      </ScrollView>
    );
  }

  if (!event) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
        <PageContainer>
          <View className="gap-4">
            {backButton}
            <ErrorState
              title="Prezența nu a putut fi afișată"
              message={error ?? 'Evenimentul nu există sau a fost șters.'}
              actionLabel="Reîncearcă"
              onAction={loadData}
            />
          </View>
        </PageContainer>
      </ScrollView>
    );
  }

  const meta = eventTypeMeta(event.type);
  const graded = String(event.status ?? '').toLowerCase() === 'graded';
  const marked = counts.all - counts.unmarked;
  const markedPercent = counts.all ? Math.round((marked / counts.all) * 100) : 0;
  const teamName = team?.name ?? event.teamName ?? null;
  const facts = [
    { icon: 'event', label: formatCoachDate(event.startTime) },
    { icon: 'schedule', label: formatCoachTimeRange(event.startTime, event.endTime) },
    event.location ? { icon: 'place', label: event.location } : null,
    teamName ? { icon: 'groups', label: teamName } : null,
  ].filter(Boolean) as { icon: string; label: string }[];

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-16" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <View className="mb-3 self-start">{backButton}</View>

          <PageHero
            eyebrow="Notare prezență"
            title={event.title}
            subtitle={roster.length > 0 ? `${marked} din ${counts.all} marcați${counts.unmarked ? ` · ${counts.unmarked} încă nemarcați` : ' · toți jucătorii sunt marcați'}` : undefined}
            leading={roster.length > 0 ? (
              <ProgressRing
                value={markedPercent}
                size={56}
                stroke={6}
                color={markedPercent === 100 ? 'var(--c-success)' : 'var(--c-brand-fg)'}
                label={`${marked} din ${counts.all} marcați`}
              >
                {markedPercent === 100 ? (
                  <MaterialIcons name="check" size={20} color="var(--c-success-fg)" />
                ) : (
                  <Text className="f-display t-num text-[13px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>{markedPercent}%</Text>
                )}
              </ProgressRing>
            ) : (
              <View className="w-12 h-12 rounded-[14px] items-center justify-center shrink-0" style={{ backgroundColor: meta.bg }}>
                <MaterialIcons name={meta.icon} size={22} color={meta.fg} />
              </View>
            )}
            actions={counts.unmarked > 0 && !locked ? (
              <Button
                icon="done-all"
                label={`Restul prezenți (${counts.unmarked})`}
                loading={bulkSaving}
                onPress={() => setBulkConfirmOpen(true)}
              />
            ) : undefined}
            className="mb-4"
          >
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: meta.bg }}>
                <MaterialIcons name={meta.icon} size={13} color={meta.fg} />
                <Text className="text-[12px] font-bold" style={{ color: meta.fg }}>{meta.label}</Text>
              </View>
              {graded ? (
                <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: 'var(--c-success-bg)' }}>
                  <MaterialIcons name="task-alt" size={13} color="var(--c-success-fg)" />
                  <Text className="text-[12px] font-bold" style={{ color: 'var(--c-success-fg)' }}>Notat</Text>
                </View>
              ) : null}
              {facts.map((fact) => (
                <View key={fact.icon} className="flex-row items-center gap-1.5 min-w-0 ml-1">
                  <MaterialIcons name={fact.icon} size={14} color="var(--c-faint)" />
                  <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{fact.label}</Text>
                </View>
              ))}
            </View>
            {roster.length > 0 ? (
              <View className="grid grid-cols-3 gap-2 max-w-[520px] ui-stagger">
                <GlassStat value={counts.present + counts.late} label="Prezenți" dot="var(--c-success)" hint={counts.late ? `din care ${plural(counts.late, 'întârziat', 'întârziați')}` : undefined} />
                <GlassStat value={counts.absent} label="Absenți" dot="var(--c-danger)" />
                <GlassStat value={counts.medical} label="Motivați" dot="var(--c-warning)" />
              </View>
            ) : null}
          </PageHero>

          {/* Roster */}
          <View className="gap-3">
            {roster.length > 0 ? (
              <FilterChips
                label="Filtru prezență"
                value={filter}
                onChange={setFilter}
                options={[
                  { key: 'all', label: 'Toți', count: counts.all },
                  { key: 'unmarked', label: 'Nemarcați', dot: 'var(--c-border-strong)', count: counts.unmarked },
                  { key: 'present', label: 'Prezenți', dot: 'var(--c-success)', count: counts.present },
                  { key: 'late', label: 'Întârziați', dot: 'var(--c-brand-fg)', count: counts.late },
                  { key: 'absent', label: 'Absenți', dot: 'var(--c-danger)', count: counts.absent },
                  { key: 'medical', label: 'Motivați', dot: 'var(--c-warning)', count: counts.medical },
                ]}
              />
            ) : null}

            {roster.length > 0 ? (
              locked ? (
                <View className="flex-row items-start gap-2.5 rounded-[12px] border px-3.5 py-3" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
                  <MaterialIcons name="lock" size={18} color="var(--c-muted)" style={{ marginTop: 1 }} />
                  <Text className="flex-1 text-[13px] font-medium leading-5" style={{ color: 'var(--c-ink-soft)' }}>
                    Prezența se poate nota din ziua evenimentului ({formatCoachDate(event.startTime)}). Până atunci vezi doar lotul.
                  </Text>
                </View>
              ) : (
                <AttendanceSaveStatus state={saveStatus.state} />
              )
            ) : null}

            {roster.length === 0 ? (
              <View className="rounded-[16px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                <EmptyState
                  icon="groups"
                  title={event.teamId ? 'Lotul echipei este gol' : 'Eveniment fără echipă'}
                  message={event.teamId
                    ? `${teamName ?? 'Echipa'} nu are încă jucători. Adaugă jucători în lot și revino aici pentru prezență.`
                    : 'Prezența se notează pe lotul unei echipe. Alocă o echipă acestui eveniment.'}
                  actionLabel={event.teamId ? 'Deschide echipa' : 'Deschide evenimentul'}
                  onAction={() => router.push((event.teamId ? `/admin/team/${event.teamId}` : `/admin/event/${event.id}`) as any)}
                />
              </View>
            ) : visibleRows.length === 0 ? (
              <EmptyState
                compact
                icon="search-off"
                title="Niciun jucător"
                message={searchValue.trim() ? `Nimic pentru „${searchValue.trim()}”.` : 'Niciun jucător în acest filtru.'}
                actionLabel="Arată toți"
                onAction={() => {
                  setFilter('all');
                  setSearchValue('');
                }}
              />
            ) : (
              <View className="gap-2 ui-stagger">
                {visibleRows.map((row) => (
                  <AttendanceRow
                    key={row.id}
                    row={row}
                    busy={bulkSaving || busyIds.has(row.id)}
                    locked={locked}
                    noteOpen={openNotes.has(row.id)}
                    onToggleNote={() => toggleNote(row.id)}
                    onStatus={(status) => setStatus(row.id, status)}
                    onNote={(note) => setNote(row.id, note)}
                    onSaveNote={() => saveNote(row.id)}
                  />
                ))}
              </View>
            )}
          </View>
        </PageContainer>
      </ScrollView>

      <ConfirmDialog
        visible={bulkConfirmOpen}
        icon="done-all"
        title="Marchează restul prezenți"
        message={`${plural(counts.unmarked, 'jucător nemarcat va fi trecut', 'jucători nemarcați vor fi trecuți')} ca prezenți. Cei deja marcați nu se schimbă.`}
        confirmLabel="Marchează"
        cancelLabel="Anulează"
        loading={bulkSaving}
        onConfirm={markRemainingPresent}
        onCancel={() => setBulkConfirmOpen(false)}
      />

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}

/**
 * One player. Wide desktop (xl): name | note | status on a single line, so the
 * page's width goes to the note instead of empty space. Tablet/laptop: name and
 * status share a row, the note drops below when opened. Phones: name + note
 * toggle, full-width status quarters, then the note.
 */
function AttendanceRow({
  row,
  busy,
  locked,
  noteOpen,
  onToggleNote,
  onStatus,
  onNote,
  onSaveNote,
}: {
  row: RosterEntry;
  busy: boolean;
  locked: boolean;
  noteOpen: boolean;
  onToggleNote: () => void;
  onStatus: (status: AttendanceMark) => void;
  onNote: (note: string) => void;
  onSaveNote: () => void;
}) {
  const active = attendanceMarkMeta(row.status);
  const hasNote = Boolean(row.savedNote.trim());
  const dirty = noteDirty(row);
  const metaParts = [row.position, row.status ? null : 'Nemarcat'].filter(Boolean);
  const playerName = `${row.firstName} ${row.lastName}`;

  return (
    <View
      className="relative overflow-hidden rounded-[14px] border pl-4 pr-3 py-3 flex-col md:flex-row md:flex-wrap xl:flex-nowrap md:items-center gap-3 xl:gap-4"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: active?.solid ?? 'var(--c-border-strong)', transition: 'background-color 0.2s ease' } as any}
      />

      <View className="flex-row items-center gap-2 min-w-0 md:flex-1 xl:flex-none xl:w-[260px] 2xl:w-[300px] xl:shrink-0">
        <View className="flex-1 min-w-0">
          <CoachPlayerRow
            bare
            firstName={row.firstName}
            lastName={row.lastName}
            badge={getPlayerBadge(row)}
            meta={metaParts.length ? metaParts.join(' · ') : null}
          />
        </View>
        {dirty ? (
          <View className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--c-warning)' }} accessibilityLabel="Notă nesalvată" />
        ) : null}
        <AttendanceNoteToggle open={noteOpen} hasNote={hasNote} onPress={onToggleNote} className="xl:hidden" />
      </View>

      <View className={`${noteOpen ? 'flex' : 'hidden'} xl:flex order-last xl:order-none w-full xl:w-auto xl:flex-1 min-w-0 flex-row items-start gap-2`}>
        <View className="flex-1 min-w-0">
          <AttendanceNoteInput value={row.note} onChange={onNote} playerName={playerName} editable={!locked} />
        </View>
        {dirty ? (
          <Button
            size="sm"
            icon="save"
            label="Salvează nota"
            disabled={!row.status || busy || locked}
            onPress={onSaveNote}
          />
        ) : null}
      </View>

      <AttendanceMarkButtons value={row.status} playerName={playerName} busy={busy} disabled={locked} onMark={onStatus} />
    </View>
  );
}
