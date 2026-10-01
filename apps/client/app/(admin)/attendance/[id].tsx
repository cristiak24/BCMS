import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { teamsApi, Team, Player } from '../../../services/teamsApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../../components/HeaderContext';
import PageContainer from '../../../components/ui/PageContainer';
import FilterChips from '../../../components/ui/FilterChips';
import ProgressRing from '../../../components/ui/ProgressRing';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import UnsavedBar from '../../../components/ui/UnsavedBar';
import { CoachPlayerRow } from '../../../components/coach/CoachPrimitives';
import { eventTypeMeta, getPlayerBadge } from '../../../components/coach/coachDisplay';
import { formatCoachDate, formatCoachTimeRange } from '../../../components/coach/coachUtils';

/**
 * Admin "Notare prezență" for one event.
 *
 * Rebuilt on the coach Prezență vocabulary (status rail, filled segment,
 * "restul prezenți"): the old page drew its title in `--c-brand-surface-deep`
 * (invisible on the dark shell), used 4px coloured left borders on 20px-radius
 * cards, a separate in-card search next to the header search, and a table
 * header that sat over an empty roster.
 *
 * Unlike the coach screen this one edits in a draft and saves once — admins
 * also write a per-player note here, and a note typed letter by letter should
 * not be a request per keystroke. The header search filters the roster.
 */

type AttendanceStatus = 'present' | 'absent' | 'medical';
type StatusFilter = 'all' | 'unmarked' | AttendanceStatus;

type RosterEntry = {
  id: number;
  firstName: string;
  lastName: string;
  number: number | null;
  position: string | null;
  status: AttendanceStatus | null;
  note: string;
};

const SCHEDULE_PATH = '/admin/schedule';

const STATUS_OPTIONS: { status: AttendanceStatus; label: string; icon: string; fg: string; bg: string; solid: string }[] = [
  { status: 'present', label: 'Prezent', icon: 'check-circle', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', solid: 'var(--c-success)' },
  { status: 'absent', label: 'Absent', icon: 'cancel', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', solid: 'var(--c-danger)' },
  { status: 'medical', label: 'Motivat', icon: 'medical-services', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', solid: 'var(--c-warning)' },
];

const OPTION_BY_STATUS = Object.fromEntries(STATUS_OPTIONS.map((option) => [option.status, option])) as Record<AttendanceStatus, (typeof STATUS_OPTIONS)[number]>;

function toStatus(raw: string | null | undefined): AttendanceStatus | null {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'present') return 'present';
  if (value === 'absent') return 'absent';
  if (value === 'medical' || value === 'excused') return 'medical';
  return null;
}

function sortRoster(a: RosterEntry, b: RosterEntry) {
  const aNumber = a.number ?? 999;
  const bNumber = b.number ?? 999;
  if (aNumber !== bNumber) return aNumber - bNumber;
  return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
}

function isDirty(entry: RosterEntry, saved: RosterEntry | undefined) {
  return !saved || saved.status !== entry.status || saved.note.trim() !== entry.note.trim();
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
  // Last saved state, keyed by player — the draft is diffed against it.
  const [saved, setSaved] = useState<Map<number, RosterEntry>>(new Map());
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
              status: toStatus(record?.status),
              note: record?.note ?? '',
            };
          })
          .sort(sortRoster);
        setRoster(rows);
        setSaved(new Map(rows.map((row) => [row.id, row])));
        setOpenNotes(new Set(rows.filter((row) => row.note.trim()).map((row) => row.id)));
      } else {
        setRoster([]);
        setSaved(new Map());
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

  const dirtyRows = useMemo(() => roster.filter((row) => isDirty(row, saved.get(row.id))), [roster, saved]);
  const dirtyCount = dirtyRows.length;

  // A half-marked sheet is easy to lose with one misclick on the sidebar.
  useEffect(() => {
    if (!dirtyCount) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const setStatus = (playerId: number, status: AttendanceStatus) => {
    setRoster((rows) => rows.map((row) => (row.id === playerId ? { ...row, status: row.status === status ? null : status } : row)));
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

  const markRemainingPresent = () => {
    setRoster((rows) => rows.map((row) => (row.status ? row : { ...row, status: 'present' })));
    setBulkConfirmOpen(false);
  };

  const discard = () => {
    setRoster((rows) => rows.map((row) => saved.get(row.id) ?? row));
  };

  const save = async () => {
    if (!event || !dirtyCount || saving) return;
    setSaving(true);
    try {
      await eventsApi.updateEventAttendance(
        event.id,
        dirtyRows.map((row) => ({
          playerId: row.id,
          status: row.status ?? 'pending',
          note: row.note.trim() ? row.note.trim() : null,
        })),
      );
      const next = new Map(saved);
      dirtyRows.forEach((row) => next.set(row.id, { ...row, note: row.note.trim() }));
      setSaved(next);
      // Flag the event as graded; a failure here must not undo a saved sheet.
      eventsApi.updateEvent(event.id, { status: 'graded' }).then(setEvent).catch(() => undefined);
      showToast({ variant: 'success', message: 'Prezența și notele au fost salvate.' });
    } catch (err) {
      console.error('Submit failed', err);
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Salvarea a eșuat. Încearcă din nou.' });
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => ({
    all: roster.length,
    unmarked: roster.filter((row) => !row.status).length,
    present: roster.filter((row) => row.status === 'present').length,
    absent: roster.filter((row) => row.status === 'absent').length,
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
      <ScrollView className="flex-1" contentContainerClassName="pb-32" showsVerticalScrollIndicator={false}>
        <PageContainer>
          {/* Event header — the event is the content here, so it stays on phones too. */}
          <View className="mb-5 gap-3">
            <View className="flex-row flex-wrap items-center gap-2">
              {backButton}
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
            </View>

            <View>
              <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Notare prezență</Text>
              <Text
                className="text-[22px] md:text-[28px] font-bold leading-tight mt-1"
                style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.5px' } as any}
              >
                {event.title}
              </Text>
              <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
                {facts.map((fact) => (
                  <View key={fact.icon} className="flex-row items-center gap-1.5 min-w-0">
                    <MaterialIcons name={fact.icon} size={15} color="var(--c-faint)" />
                    <Text className="text-[13px] font-medium" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{fact.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Summary strip — one row on desktop so the roster below gets the
              full page width (the note field is what needs it). Nothing to
              summarise or filter on an empty roster, so both are skipped. */}
          {roster.length > 0 ? (
            <View
              className="rounded-[16px] border p-4 md:p-5 mb-4 flex-col lg:flex-row lg:items-center gap-4 lg:gap-6"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
            >
              <View className="flex-row items-center gap-4 lg:shrink-0 lg:min-w-[260px]">
                <ProgressRing
                  value={markedPercent}
                  size={64}
                  stroke={7}
                  color={markedPercent === 100 ? 'var(--c-success)' : 'var(--c-brand-fg)'}
                  label={`${marked} din ${counts.all} marcați`}
                >
                  {markedPercent === 100 ? (
                    <MaterialIcons name="check" size={22} color="var(--c-success-fg)" />
                  ) : (
                    <Text className="t-num text-[14px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>{markedPercent}%</Text>
                  )}
                </ProgressRing>
                <View className="flex-1 min-w-0">
                  <Text className="t-num text-[22px] font-bold leading-none" style={{ color: 'var(--c-ink-strong)' }}>
                    {marked}<Text className="text-[15px]" style={{ color: 'var(--c-faint)' }}> / {counts.all} marcați</Text>
                  </Text>
                  <Text className="text-[13px] font-medium mt-1" style={{ color: 'var(--c-muted)' }}>
                    {counts.unmarked ? `${counts.unmarked} încă nemarcați` : 'Toți jucătorii sunt marcați'}
                  </Text>
                </View>
              </View>

              <View className="grid grid-cols-3 gap-2 lg:flex-1 lg:max-w-[520px]">
                {STATUS_OPTIONS.map((option) => (
                  <View
                    key={option.status}
                    className="rounded-[12px] px-3 py-2.5 min-w-0 flex-col xl:flex-row xl:items-center xl:gap-2.5"
                    style={{ backgroundColor: option.bg }}
                  >
                    <View className="hidden xl:flex">
                      <MaterialIcons name={option.icon} size={18} color={option.fg} />
                    </View>
                    <Text className="t-num text-[20px] font-bold leading-none" style={{ color: option.fg }}>{counts[option.status]}</Text>
                    <Text className="text-[12px] font-semibold mt-1 xl:mt-0" style={{ color: option.fg }} numberOfLines={1}>
                      {option.status === 'present' ? 'Prezenți' : option.status === 'absent' ? 'Absenți' : 'Motivați'}
                    </Text>
                  </View>
                ))}
              </View>

              {counts.unmarked > 0 ? (
                <Pressable
                  onPress={() => setBulkConfirmOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Marchează restul prezenți (${counts.unmarked})`}
                  className="ui-press h-11 rounded-[12px] px-4 flex-row items-center justify-center gap-2 border lg:ml-auto lg:shrink-0"
                  style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
                >
                  <MaterialIcons name="done-all" size={17} color="var(--c-success-fg)" />
                  <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                    Restul prezenți ({counts.unmarked})
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

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
                  { key: 'absent', label: 'Absenți', dot: 'var(--c-danger)', count: counts.absent },
                  { key: 'medical', label: 'Motivați', dot: 'var(--c-warning)', count: counts.medical },
                ]}
              />
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
                    dirty={isDirty(row, saved.get(row.id))}
                    noteOpen={openNotes.has(row.id)}
                    onToggleNote={() => toggleNote(row.id)}
                    onStatus={(status) => setStatus(row.id, status)}
                    onNote={(note) => setNote(row.id, note)}
                  />
                ))}
              </View>
            )}
          </View>
        </PageContainer>
      </ScrollView>

      {/* Save bar — only while there is something to save. */}
      {dirtyCount > 0 ? (
        <UnsavedBar
          label={`Nesalvate: ${dirtyCount}`}
          saving={saving}
          onSave={save}
          onDiscard={discard}
        />
      ) : null}

      <ConfirmDialog
        visible={bulkConfirmOpen}
        icon="done-all"
        title="Marchează restul prezenți"
        message={`${counts.unmarked} ${counts.unmarked === 1 ? 'jucător nemarcat va fi trecut' : 'jucători nemarcați vor fi trecuți'} ca prezenți. Cei deja marcați nu se schimbă. Apasă apoi Salvează.`}
        confirmLabel="Marchează"
        cancelLabel="Anulează"
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
 * toggle, full-width status thirds, then the note. Tapping the active
 * status again clears it.
 */
function AttendanceRow({
  row,
  dirty,
  noteOpen,
  onToggleNote,
  onStatus,
  onNote,
}: {
  row: RosterEntry;
  dirty: boolean;
  noteOpen: boolean;
  onToggleNote: () => void;
  onStatus: (status: AttendanceStatus) => void;
  onNote: (note: string) => void;
}) {
  const active = row.status ? OPTION_BY_STATUS[row.status] : null;
  const hasNote = Boolean(row.note.trim());
  const metaParts = [row.position, row.status ? null : 'Nemarcat'].filter(Boolean);

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
          <View className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--c-warning)' }} accessibilityLabel="Modificat, nesalvat" />
        ) : null}
        <Pressable
          onPress={onToggleNote}
          accessibilityRole="button"
          accessibilityLabel={noteOpen ? 'Ascunde nota' : 'Adaugă notă'}
          accessibilityState={{ expanded: noteOpen }}
          className="xl:hidden ui-press w-9 h-9 rounded-[10px] border items-center justify-center shrink-0"
          style={{
            borderColor: hasNote ? 'color-mix(in srgb, var(--c-brand-fg) 35%, transparent)' : 'var(--c-border)',
            backgroundColor: hasNote ? 'var(--c-surface-tint)' : 'var(--c-surface-2)',
          } as any}
        >
          <MaterialIcons name={hasNote ? 'chat' : 'chat-bubble-outline'} size={16} color={hasNote ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
        </Pressable>
      </View>

      <View className={`${noteOpen ? 'flex' : 'hidden'} xl:flex order-last xl:order-none w-full xl:w-auto xl:flex-1 min-w-0`}>
        <TextInput
          value={row.note}
          onChangeText={onNote}
          placeholder="Notă / feedback pentru jucător…"
          placeholderTextColor="var(--c-faint)"
          multiline
          accessibilityLabel={`Notă pentru ${row.firstName} ${row.lastName}`}
          className="w-full min-h-[40px] max-h-[140px] rounded-[10px] border px-3 py-2.5 text-[13px] font-medium outline-none"
          style={{
            backgroundColor: 'var(--c-surface-2)',
            borderColor: 'var(--c-border)',
            color: 'var(--c-ink)',
            resize: 'none',
            fieldSizing: 'content',
            lineHeight: '18px',
          } as any}
        />
      </View>

      <View className="flex-row gap-1.5 shrink-0" accessibilityRole={'radiogroup' as any} accessibilityLabel={`Prezență ${row.firstName} ${row.lastName}`}>
        {STATUS_OPTIONS.map((option) => {
          const selected = row.status === option.status;
          return (
            <Pressable
              key={option.status}
              onPress={() => onStatus(option.status)}
              accessibilityRole={'radio' as any}
              accessibilityState={{ selected, checked: selected } as any}
              accessibilityLabel={option.label}
              className="ui-press flex-1 md:flex-none h-10 rounded-[10px] border px-3 flex-row items-center justify-center gap-1.5"
              style={{
                borderColor: selected ? option.fg : 'var(--c-border)',
                backgroundColor: selected ? option.bg : 'var(--c-surface-2)',
                boxShadow: selected ? `inset 0 0 0 1px ${option.fg}` : 'none',
                transition: 'background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
              } as any}
            >
              <MaterialIcons name={option.icon} size={16} color={selected ? option.fg : 'var(--c-muted)'} />
              <Text className="text-[12.5px] font-bold" style={{ color: selected ? option.fg : 'var(--c-muted)' }} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
