import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { l12Api, type L12Event, type L12Lineup, type L12Overview, type L12OverviewMatch, type L12Team } from '../../services/l12Api';
import { teamsApi, type Player } from '../../services/teamsApi';
import PageContainer from '../ui/PageContainer';
import PageHeader from '../ui/PageHeader';
import ConfirmDialog from '../ui/ConfirmDialog';
import UnsavedBar from '../ui/UnsavedBar';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import { ToastHost, useToasts } from '../ui/Toast';
import SelectField from '../ui/SelectField';
import FilterChips from '../ui/FilterChips';
import Pagination, { usePagination } from '../ui/Pagination';
import L12Editor, { EMPTY_LINEUP, L12_MIN_PLAYERS, lineupForRoster, resolveTeamGender, sortLineupPlayers, validateLineup } from './L12Editor';
import Button from '../ui/Button';
import ActionSheet from '../ui/ActionSheet';
import { downloadL12Word, printL12, type L12DocumentInput } from './l12Document';
import { StatusChip, useL12Base } from './L12MatchLink';
import { DayHeading, KIND_META, L12Hero, MatchTicket, TeamAvatar, TeamTile, isOwnSide, matchKind, type HeroNext, type MatchKind } from './L12Visuals';

/**
 * L12 area, shared by admins (/admin/l12…) and coaches (/coach/l12…):
 *  - home: upcoming matches with their sheet status + each team's L12 constant
 *  - match: the sheet for one match, started from the team's L12 constant
 *  - team: edit the team's L12 constant
 */

function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return withTime ? `${day}, ${date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}` : day;
}

/** Comparable form of a lineup — what decides "unsaved". */
function snapshot(lineup: L12Lineup | null) {
  if (!lineup) return '';
  return JSON.stringify({
    competition: lineup.competition?.trim() || null,
    gender: lineup.gender,
    captainPlayerId: lineup.captainPlayerId,
    players: lineup.players.map((p) => [p.playerId, p.shirtNumber, p.license.trim(), p.u22, p.citizenship.trim(), p.naturalized]),
    staff: Object.fromEntries(
      Object.entries(lineup.staff)
        .map(([role, entry]) => [role, { name: entry?.name.trim() ?? '', license: entry?.license.trim() ?? '' }] as const)
        .filter(([, entry]) => entry.name || entry.license),
    ),
  });
}

/** "Amical: A vs B" / "Meci amical A vs B" → "A vs B" — the kind is shown as a badge. */
function stripKindPrefix(title: string) {
  return title.replace(/^\s*(meci\s+)?(amical|municipal)\s*[:·–-]?\s*/i, '');
}

/** "Amical: A vs B" → ['A', 'B']; a title without "vs" is one side. */
function sidesOf(title: string): [string, string | null] {
  const clean = stripKindPrefix(title);
  const sides = clean.split(/\s+vs\.?\s+/i).map((part) => part.trim());
  return sides.length === 2 ? [sides[0], sides[1]] : [clean, null];
}

function splitTeams(title: string, teamName: string) {
  const parts = stripKindPrefix(title).split(/\s+vs\.?\s+/i);
  if (parts.length === 2) return { homeTeam: parts[0].trim(), awayTeam: parts[1].trim() };
  return { homeTeam: teamName, awayTeam: title };
}

function useUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}

function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Înapoi la ${label}`}
      className="ui-press self-start h-9 pl-2 pr-3 rounded-[10px] border flex-row items-center gap-1.5"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
    >
      <MaterialIcons name="chevron-left" size={18} color="var(--c-ink-soft)" />
      <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{label}</Text>
    </Pressable>
  );
}

function PageShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-36" showsVerticalScrollIndicator={false}>
        <PageContainer>{children}</PageContainer>
      </ScrollView>
      {footer}
    </View>
  );
}

function LoadingSheet() {
  return (
    <PageShell>
      <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă L12">
        <Skeleton className="h-9 w-28 rounded-[10px]" />
        <Skeleton className="h-8 w-2/3 max-w-[520px] rounded-[10px]" />
        <Skeleton className="h-[120px] w-full rounded-[16px]" />
        <Skeleton className="h-[360px] w-full rounded-[16px]" />
      </View>
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────

const MATCHES_PAGE_SIZE = 12;

type StatusFilter = 'all' | 'unset' | 'set';
type HomeTab = 'matches' | 'teams';

function dayKey(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toDateString();
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Fără dată';
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Azi';
  if (date.toDateString() === tomorrow.toDateString()) return 'Mâine';
  const label = date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (next: T) => void; options: { key: T; label: string; count?: number }[] }) {
  return (
    <View className="glass p-[3px] rounded-[12px] flex-row self-start">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="ui-press px-3.5 h-[32px] rounded-[9px] flex-row items-center gap-1.5"
            style={active ? ({ backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any) : undefined}
          >
            <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>{option.label}</Text>
            {option.count != null ? (
              <Text className="t-num text-[11.5px] font-semibold" style={{ color: 'var(--c-faint)' }}>{option.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const monthKeyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function L12HomeScreen() {
  const router = useRouter();
  const base = useL12Base();
  const [data, setData] = useState<L12Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<HomeTab>('matches');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [monthFilter, setMonthFilter] = useState<string>('upcoming');
  const [kindFilter, setKindFilter] = useState<'all' | MatchKind>('all');

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await l12Api.overview());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca L12.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Cancelled fixtures never need a sheet.
  const liveMatches = useMemo(() => (data?.matches ?? []).filter((m) => m.status !== 'cancelled'), [data]);
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const isUpcoming = useCallback((m: L12OverviewMatch) => new Date(m.startTime).getTime() >= todayStart, [todayStart]);

  const teamScopedMatches = useMemo(() => {
    if (teamFilter === 'all') return liveMatches;
    return liveMatches.filter((match) => String(match.teamId) === teamFilter);
  }, [liveMatches, teamFilter]);

  const monthOptions = useMemo(() => {
    const counts = new Map<string, number>();
    teamScopedMatches.forEach((m) => counts.set(monthKeyOf(m.startTime), (counts.get(monthKeyOf(m.startTime)) ?? 0) + 1));
    const current = monthKeyOf(new Date().toISOString());
    return [
      { key: 'upcoming', label: 'Următoarele meciuri', count: teamScopedMatches.filter(isUpcoming).length },
      ...[...counts.keys()].sort().map((key) => ({
        key,
        label: `${monthLabel(key)}${key === current ? ' · luna asta' : ''}`,
        count: counts.get(key)!,
      })),
    ];
  }, [teamScopedMatches, isUpcoming]);

  const monthScopedMatches = useMemo(() => teamScopedMatches.filter((m) => (
    monthFilter === 'upcoming' ? isUpcoming(m) : monthKeyOf(m.startTime) === monthFilter
  )), [teamScopedMatches, monthFilter, isUpcoming]);

  const kindOptions = useMemo(() => {
    const count = (kind: MatchKind) => monthScopedMatches.filter((m) => matchKind(m) === kind).length;
    return [
      { key: 'all' as const, label: 'Toate', count: monthScopedMatches.length },
      ...(['frb', 'amical', 'municipal'] as const).map((kind) => ({ key: kind, label: KIND_META[kind].plural, dot: KIND_META[kind].fg, count: count(kind) })),
    ];
  }, [monthScopedMatches]);

  const kindScopedMatches = useMemo(
    () => (kindFilter === 'all' ? monthScopedMatches : monthScopedMatches.filter((m) => matchKind(m) === kindFilter)),
    [monthScopedMatches, kindFilter],
  );

  const statusOptions = useMemo(() => [
    { key: 'all' as const, label: 'Toate' },
    { key: 'unset' as const, label: 'Nesetate', count: kindScopedMatches.filter((m) => !m.hasLineup).length },
    { key: 'set' as const, label: 'Setate', count: kindScopedMatches.filter((m) => m.hasLineup).length },
  ], [kindScopedMatches]);

  const filteredMatches = useMemo(() => {
    if (statusFilter === 'all') return kindScopedMatches;
    return kindScopedMatches.filter((m) => (statusFilter === 'set' ? m.hasLineup : !m.hasLineup));
  }, [kindScopedMatches, statusFilter]);

  const upcomingCount = useMemo(() => liveMatches.filter(isUpcoming).length, [liveMatches, isUpcoming]);
  const filtersActive = teamFilter !== 'all' || monthFilter !== 'upcoming' || kindFilter !== 'all' || statusFilter !== 'all';
  const resetFilters = () => { setTeamFilter('all'); setMonthFilter('upcoming'); setKindFilter('all'); setStatusFilter('all'); };

  const { page, totalPages, pageItems: pagedMatches, setPage, rangeStart, rangeEnd, total } = usePagination(
    filteredMatches,
    MATCHES_PAGE_SIZE,
    `${teamFilter}:${monthFilter}:${kindFilter}:${statusFilter}`,
  );

  // A page of matches split into day groups, so the list reads as a schedule
  // rather than one undifferentiated column of cards.
  const dayGroups = useMemo(() => {
    const groups: { key: string; label: string; matches: typeof pagedMatches }[] = [];
    for (const match of pagedMatches) {
      const key = dayKey(match.startTime);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.matches.push(match);
      else groups.push({ key, label: dayLabel(match.startTime), matches: [match] });
    }
    return groups;
  }, [pagedMatches]);

  const teamOptions = useMemo(() => {
    if (!data) return [];
    return [
      { key: 'all', label: 'Toate echipele', count: liveMatches.length },
      ...data.teams.map((team) => ({
        key: String(team.id),
        label: team.name,
        count: liveMatches.filter((m) => m.teamId === team.id).length,
      })),
    ];
  }, [data, liveMatches]);

  const teamsSet = data ? data.teams.filter((t) => t.hasTemplate).length : 0;

  const upcomingMatches = useMemo(
    () => liveMatches.filter(isUpcoming).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [liveMatches, isUpcoming],
  );
  const unsetUpcoming = useMemo(() => upcomingMatches.filter((m) => !m.hasLineup), [upcomingMatches]);
  const heroNext = useMemo<HeroNext | null>(() => {
    const match = unsetUpcoming[0] ?? upcomingMatches[0];
    if (!match) return null;
    const [home, away] = sidesOf(match.title);
    return { match, home, away };
  }, [unsetUpcoming, upcomingMatches]);

  return (
    <PageShell>
      {error ? (
        <ErrorState title="Nu am putut încărca L12" message={error} actionLabel="Reîncearcă" onAction={load} />
      ) : !data ? (
        <View className="gap-3">
          <Skeleton className="h-[64px] w-full rounded-[14px]" />
          <Skeleton className="h-[64px] w-full rounded-[14px]" />
          <Skeleton className="h-[64px] w-full rounded-[14px]" />
        </View>
      ) : (
        <View className="gap-5">
          <L12Hero
            unset={unsetUpcoming.length}
            ready={upcomingMatches.length - unsetUpcoming.length}
            teamsSet={teamsSet}
            teamsTotal={data.teams.length}
            next={heroNext}
            onOpenNext={(eventId) => router.push(`${base}/match/${eventId}` as any)}
          />

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { key: 'matches', label: 'Meciuri', count: upcomingCount },
              { key: 'teams', label: 'L12 constant', count: data.teams.length },
            ]}
          />

          {tab === 'matches' ? (
            liveMatches.length === 0 ? (
              <EmptyState compact icon="sports-basketball" title="Niciun meci programat" message="Meciurile oficiale FRB, amicalele și meciurile municipale din Program apar aici." />
            ) : (
              <View className="gap-4">
                <View className="gap-2.5">
                  <View className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row lg:items-center gap-2">
                    {data.teams.length > 1 ? (
                      <SelectField label="Echipă" icon="groups" options={teamOptions} value={teamFilter} onChange={setTeamFilter} className="min-w-0 lg:w-[280px]" />
                    ) : null}
                    <SelectField label="Lună" icon="calendar-month" options={monthOptions} value={monthFilter} onChange={setMonthFilter} className="min-w-0 lg:w-[250px]" />
                    <View className="lg:ml-auto">
                      <Segmented value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1 min-w-0">
                      <FilterChips label="Tip meci" options={kindOptions} value={kindFilter} onChange={setKindFilter} />
                    </View>
                    {filtersActive ? (
                      <Pressable onPress={resetFilters} accessibilityRole="button" className="ui-press h-8 px-2.5 rounded-[9px] flex-row items-center gap-1 shrink-0">
                        <MaterialIcons name="close" size={14} color="var(--c-muted)" />
                        <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Resetează</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {filteredMatches.length === 0 ? (
                  <EmptyState
                    compact
                    icon="search-off"
                    title="Niciun meci pentru aceste filtre"
                    message={monthFilter === 'upcoming' ? 'Nu sunt meciuri viitoare pentru selecția asta. Alege o lună din listă ca să vezi și meciurile trecute.' : 'Încearcă altă lună, echipă sau alt tip de meci.'}
                    actionLabel={filtersActive ? 'Resetează filtrele' : undefined}
                    onAction={filtersActive ? resetFilters : undefined}
                  />
                ) : (
                  <>
                    <View className="grid grid-cols-1 xl:grid-cols-2 gap-x-4 gap-y-4 items-start">
                      {dayGroups.map((group) => (
                        <View key={group.key + group.label} className="gap-2">
                          <DayHeading label={group.label} count={group.matches.length} />
                          <View className="gap-2 ui-stagger">
                            {group.matches.map((match) => {
                              const [home, away] = sidesOf(match.title);
                              // The club's team is usually one of the two sides already.
                              const showTeam = teamFilter === 'all' && Boolean(match.teamName) && ![home, away].includes(match.teamName);
                              return (
                                <MatchTicket
                                  key={match.eventId}
                                  match={match}
                                  home={home}
                                  away={away}
                                  showTeam={showTeam}
                                  played={!isUpcoming(match)}
                                  onPress={() => router.push(`${base}/match/${match.eventId}` as any)}
                                />
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </View>
                    <Pagination page={page} totalPages={totalPages} onPageChange={setPage} rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} itemNoun="meciuri" />
                  </>
                )}
              </View>
            )
          ) : data.teams.length === 0 ? (
            <EmptyState compact icon="groups" title="Nicio echipă" message="Creează o echipă ca să-i setezi L12-ul." />
          ) : (
            <View className="gap-3">
              <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{teamsSet} din {data.teams.length} echipe au L12 constant setat.</Text>
              <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 ui-stagger">
                {data.teams.map((team) => (
                  <TeamTile
                    key={team.id}
                    name={team.name}
                    subtitle={[team.leagueName, team.coachName].filter(Boolean).join(' · ') || '—'}
                    set={team.hasTemplate}
                    count={team.templatePlayerCount}
                    onPress={() => router.push(`${base}/team/${team.id}` as any)}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared sheet screen state
// ─────────────────────────────────────────────────────────────

function useRoster(teamId: number | null) {
  const [roster, setRoster] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (teamId == null) return;
    let cancelled = false;
    setLoading(true);
    teamsApi.getTeamPlayers(teamId)
      .then((rows) => { if (!cancelled) setRoster(rows); })
      .catch(() => { if (!cancelled) setRoster([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);
  return { roster, loading };
}

function defaultLineup(team: L12Team): L12Lineup {
  return { ...EMPTY_LINEUP, competition: team.leagueName || null, gender: resolveTeamGender(team) };
}

/** The sheet's category always follows the team — it is not a user choice. */
function withTeamGender(lineup: L12Lineup, team: L12Team): L12Lineup {
  const gender = resolveTeamGender(team);
  return gender && lineup.gender !== gender ? { ...lineup, gender } : lineup;
}

/** Exports go out only when the sheet is printable; small sheets get a nudge, not a block. */
function checkBeforeExport(lineup: L12Lineup, notify: (message: string, variant: 'error' | 'info') => void) {
  const problem = validateLineup(lineup);
  if (problem) {
    notify(problem, 'error');
    return false;
  }
  if (lineup.players.length < L12_MIN_PLAYERS) notify(`Foaia are ${lineup.players.length} jucători — minimum ${L12_MIN_PLAYERS} pentru joc.`, 'info');
  return true;
}

function MetaChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 h-7 px-2.5 rounded-[8px]" style={{ backgroundColor: 'var(--c-surface-2)' }}>
      <MaterialIcons name={icon} size={14} color="var(--c-muted)" />
      <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Match
// ─────────────────────────────────────────────────────────────

export function L12MatchScreen() {
  const { id } = useLocalSearchParams();
  const eventId = Number(id);
  const router = useRouter();
  const base = useL12Base();
  const { toasts, showToast, dismissToast } = useToasts();

  const [event, setEvent] = useState<L12Event | null>(null);
  const [team, setTeam] = useState<L12Team | null>(null);
  const [template, setTemplate] = useState<L12Lineup | null>(null);
  const [saved, setSaved] = useState<L12Lineup | null>(null);
  const [draft, setDraft] = useState<L12Lineup>(EMPTY_LINEUP);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'template' | 'reset' | 'saveTemplate' | null>(null);
  const { roster, loading: rosterLoading } = useRoster(team?.id ?? null);
  const [seeded, setSeeded] = useState(false);
  // What "no changes" means: the saved sheet, or the blank sheet it opened with.
  const [baseline, setBaseline] = useState<L12Lineup | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(eventId) || eventId <= 0) {
      setError('Meciul nu există.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await l12Api.getForEvent(eventId);
      setEvent(data.event);
      setTeam(data.team);
      setTemplate(data.template);
      setSaved(data.lineup);
      setSeeded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca L12.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Seed the draft once the roster is in: the saved sheet, else the team's L12
  // constant (minus anyone no longer on the roster), else an empty sheet.
  useEffect(() => {
    if (!team || rosterLoading || seeded) return;
    if (saved) {
      // Baseline gets the same category fix so it never reads as an edit.
      setDraft(withTeamGender(saved, team));
      setBaseline(withTeamGender(saved, team));
    } else if (template) {
      // Pre-filled from the template but not yet on this match: offer the save.
      setDraft(withTeamGender(lineupForRoster({ ...template, competition: template.competition ?? team.leagueName ?? null }, roster), team));
      setBaseline(null);
    } else {
      setDraft(defaultLineup(team));
      setBaseline(defaultLineup(team));
    }
    setSeeded(true);
  }, [team, saved, template, roster, rosterLoading, seeded]);

  const dirty = seeded && snapshot(draft) !== snapshot(baseline);
  useUnloadGuard(dirty);

  const save = async () => {
    const problem = validateLineup(draft);
    if (problem) {
      showToast({ variant: 'error', message: problem });
      return;
    }
    setSaving(true);
    try {
      const result = await l12Api.saveForEvent(eventId, { ...(team ? withTeamGender(draft, team) : draft), players: sortLineupPlayers(draft.players) });
      setSaved(result);
      setDraft(team ? withTeamGender(result, team) : result);
      setBaseline(team ? withTeamGender(result, team) : result);
      showToast({ variant: 'success', message: 'L12 salvat pentru acest meci.' });
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Salvarea a eșuat.' });
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!team) return;
    const problem = validateLineup(draft);
    if (problem) {
      showToast({ variant: 'error', message: problem });
      return;
    }
    try {
      const result = await l12Api.saveTemplate(team.id, { ...withTeamGender(draft, team), players: sortLineupPlayers(draft.players) });
      setTemplate(result);
      showToast({ variant: 'success', message: `L12 constant pentru ${team.name} actualizat.` });
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut salva L12-ul constant.' });
    }
  };

  const reset = async () => {
    try {
      await l12Api.resetForEvent(eventId);
      setSaved(null);
      setSeeded(false);
      showToast({ variant: 'success', message: 'L12-ul meciului a fost șters.' });
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut șterge L12-ul.' });
    }
  };

  const docInput = useMemo<L12DocumentInput | null>(() => {
    if (!event || !team) return null;
    const { homeTeam, awayTeam } = splitTeams(event.title, team.name);
    return {
      teamName: team.name,
      homeTeam,
      awayTeam,
      competition: draft.competition ?? '',
      gender: resolveTeamGender(team),
      date: formatDate(event.startTime),
      lineup: { ...draft, players: sortLineupPlayers(draft.players) },
    };
  }, [event, team, draft]);

  if (loading) return <LoadingSheet />;

  if (!event || !team) {
    return (
      <PageShell>
        <View className="gap-4">
          <BackButton label="L12" onPress={() => router.back(base)} />
          <ErrorState title="L12 nu poate fi afișat" message={error ?? 'Meciul nu există.'} actionLabel="Reîncearcă" onAction={load} />
        </View>
      </PageShell>
    );
  }

  const fromTemplate = !saved && Boolean(template);
  const { homeTeam, awayTeam } = splitTeams(event.title, team.name);
  const teamGender = resolveTeamGender(team);
  const notify = (message: string, variant: 'error' | 'info') => showToast({ variant, message });
  const exportAs = (kind: 'pdf' | 'word') => {
    if (!docInput || !checkBeforeExport(docInput.lineup, notify)) return;
    if (kind === 'pdf') printL12(docInput);
    else downloadL12Word(docInput);
  };
  const known = [...(template?.players ?? []), ...(saved?.players ?? [])];

  return (
    <PageShell
      footer={dirty ? (
        <UnsavedBar
          label={saved ? 'Modificări nesalvate' : 'L12 nesalvat'}
          saving={saving}
          onSave={save}
          onDiscard={saved ? () => setDraft(withTeamGender(saved, team)) : undefined}
        />
      ) : null}
    >
      <View className="mb-5 gap-4">
        <View className="flex-row items-center gap-2">
          <Button size="sm" icon="chevron-left" label="L12" onPress={() => router.back(base)} />
          <StatusChip set={Boolean(saved)} label={saved ? 'Setat pentru meci' : 'Nesetat'} />
        </View>

        <View className="ui-rise relative overflow-hidden rounded-[16px] border p-3.5 md:p-4 gap-3" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
          <View pointerEvents="none" className="absolute rounded-full" style={{ width: 220, height: 220, right: -50, top: -100, backgroundColor: 'var(--c-surface-tint)', opacity: 0.8 }} />
          <View className="relative flex-col lg:flex-row lg:items-start gap-3">
            <View className="flex-1 min-w-0">
              <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Formular L-12 · {team.name}</Text>
              <View className="mt-2 flex-col md:flex-row md:items-center gap-x-3 gap-y-1.5">
                <View className="flex-row items-center gap-2 min-w-0">
                  <TeamAvatar name={homeTeam} mine={isOwnSide(homeTeam, team.name)} size={30} />
                  <Text className="f-display text-[17px] md:text-[19px] font-extrabold leading-tight shrink" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.02em' } as any} numberOfLines={2}>{homeTeam}</Text>
                </View>
                {awayTeam ? (
                  <>
                    <Text className="f-display text-[12px] font-bold uppercase" style={{ color: 'var(--c-faint)', letterSpacing: '0.08em' } as any}>vs</Text>
                    <View className="flex-row items-center gap-2 min-w-0">
                      <TeamAvatar name={awayTeam} mine={isOwnSide(awayTeam, team.name)} size={30} />
                      <Text className="f-display text-[17px] md:text-[19px] font-extrabold leading-tight shrink" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.02em' } as any} numberOfLines={2}>{awayTeam}</Text>
                    </View>
                  </>
                ) : null}
              </View>
              <View className="flex-row flex-wrap gap-1.5 mt-3">
                <MetaChip icon="event" label={formatDate(event.startTime, true)} />
                {event.location ? <MetaChip icon="place" label={event.location} /> : null}
                {teamGender ? <MetaChip icon="groups" label={teamGender === 'M' ? 'Masculin' : 'Feminin'} /> : null}
              </View>
            </View>
            <View className="flex-row flex-wrap gap-2 lg:justify-end shrink-0">
              <Button icon="picture-as-pdf" label="PDF" onPress={() => exportAs('pdf')} />
              <Button icon="description" label="Word" onPress={() => exportAs('word')} />
              <Button icon="leaderboard" label="Statistică live" onPress={() => router.push(`${base.replace('/l12', '')}/stats/${eventId}` as any)} />
              <Button icon="more-horiz" label="Mai multe" iconOnlyOnMobile accessibilityLabel="Mai multe acțiuni" onPress={() => setMenuOpen(true)} />
            </View>
          </View>

          {fromTemplate ? (
            <View className="flex-row items-center gap-2.5 rounded-[12px] px-3.5 py-2.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
              <MaterialIcons name="info-outline" size={17} color="var(--c-brand-fg)" />
              <Text className="flex-1 text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>
                Pornit din L12-ul constant al echipei. Salvează ca să-l fixezi pe acest meci.
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <L12Editor lineup={draft} onChange={setDraft} roster={roster} rosterLoading={rosterLoading} known={known} />

      <ActionSheet
        visible={menuOpen}
        title="L12 pentru acest meci"
        subtitle={team.name}
        onClose={() => setMenuOpen(false)}
        actions={[
          ...(template ? [{ key: 'load', label: 'Încarcă L12 constant', icon: 'restore', hint: 'Înlocuiește foaia cu formula de bază', onPress: () => setConfirm('template') }] : []),
          ...(draft.players.length > 0 ? [{ key: 'saveTemplate', label: 'Salvează ca L12 constant', icon: 'bookmark', hint: 'Meciurile următoare pornesc de aici', onPress: () => setConfirm('saveTemplate') }] : []),
          { key: 'team', label: 'Deschide L12 constant', icon: 'groups', onPress: () => router.push(`${base}/team/${team.id}` as any) },
          ...(saved ? [{ key: 'reset', label: 'Șterge L12-ul meciului', icon: 'delete-outline', tone: 'danger' as const, onPress: () => setConfirm('reset') }] : []),
        ]}
      />

      <ConfirmDialog
        visible={confirm != null}
        destructive={confirm === 'reset'}
        icon={confirm === 'reset' ? 'delete-outline' : confirm === 'saveTemplate' ? 'bookmark' : 'restore'}
        title={confirm === 'reset' ? 'Ștergi L12-ul acestui meci?' : confirm === 'saveTemplate' ? 'Salvezi ca L12 constant?' : 'Încarci L12-ul constant?'}
        message={confirm === 'reset'
          ? 'Meciul revine la „Nesetat”. L12-ul constant al echipei rămâne neschimbat.'
          : confirm === 'saveTemplate'
            ? `Foaia de acum devine formula de bază pentru meciurile următoare ale echipei ${team.name}.`
            : 'Jucătorii și staff-ul de pe foaie vor fi înlocuiți cu cei din L12-ul constant.'}
        confirmLabel={confirm === 'reset' ? 'Șterge' : confirm === 'saveTemplate' ? 'Salvează' : 'Încarcă'}
        cancelLabel="Anulează"
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === 'reset') void reset();
          else if (action === 'saveTemplate') void saveAsTemplate();
          else if (template) setDraft(withTeamGender(lineupForRoster({ ...template, competition: template.competition ?? draft.competition }, roster), team));
        }}
        onCancel={() => setConfirm(null)}
      />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Team template ("L12 constant")
// ─────────────────────────────────────────────────────────────

export function L12TemplateScreen() {
  const { id } = useLocalSearchParams();
  const teamId = Number(id);
  const router = useRouter();
  const base = useL12Base();
  const { toasts, showToast, dismissToast } = useToasts();

  const [team, setTeam] = useState<L12Team | null>(null);
  const [saved, setSaved] = useState<L12Lineup | null>(null);
  const [draft, setDraft] = useState<L12Lineup>(EMPTY_LINEUP);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { roster, loading: rosterLoading } = useRoster(team?.id ?? null);
  const [seeded, setSeeded] = useState(false);
  // What "no changes" means: the saved sheet, or the blank sheet it opened with.
  const [baseline, setBaseline] = useState<L12Lineup | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(teamId) || teamId <= 0) {
      setError('Echipa nu există.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await l12Api.getTemplate(teamId);
      setTeam(data.team);
      setSaved(data.template);
      setSeeded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca L12-ul constant.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!team || rosterLoading || seeded) return;
    const initial = saved ? withTeamGender(lineupForRoster(saved, roster), team) : defaultLineup(team);
    setDraft(initial);
    setBaseline(initial);
    setSeeded(true);
  }, [team, saved, roster, rosterLoading, seeded]);

  const dirty = seeded && snapshot(draft) !== snapshot(baseline);
  useUnloadGuard(dirty);

  const save = async () => {
    const problem = validateLineup(draft);
    if (problem) {
      showToast({ variant: 'error', message: problem });
      return;
    }
    setSaving(true);
    try {
      const result = await l12Api.saveTemplate(teamId, { ...(team ? withTeamGender(draft, team) : draft), players: sortLineupPlayers(draft.players) });
      setSaved(result);
      setDraft(team ? withTeamGender(result, team) : result);
      setBaseline(team ? withTeamGender(result, team) : result);
      showToast({ variant: 'success', message: 'L12 constant salvat.' });
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Salvarea a eșuat.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSheet />;

  if (!team) {
    return (
      <PageShell>
        <View className="gap-4">
          <BackButton label="L12" onPress={() => router.back(base)} />
          <ErrorState title="L12 nu poate fi afișat" message={error ?? 'Echipa nu există.'} actionLabel="Reîncearcă" onAction={load} />
        </View>
      </PageShell>
    );
  }

  const teamGender = resolveTeamGender(team);
  const blankDoc: L12DocumentInput = {
    teamName: team.name,
    homeTeam: team.name,
    awayTeam: '',
    competition: draft.competition ?? team.leagueName ?? '',
    gender: teamGender,
    date: '',
    lineup: { ...draft, players: sortLineupPlayers(draft.players) },
  };
  const notify = (message: string, variant: 'error' | 'info') => showToast({ variant, message });
  const exportAs = (kind: 'pdf' | 'word') => {
    if (!checkBeforeExport(blankDoc.lineup, notify)) return;
    if (kind === 'pdf') printL12(blankDoc);
    else downloadL12Word(blankDoc);
  };

  return (
    <PageShell
      footer={dirty ? (
        <UnsavedBar
          label={saved ? 'Modificări nesalvate' : 'L12 constant nesalvat'}
          saving={saving}
          onSave={save}
          onDiscard={saved ? () => setDraft(withTeamGender(lineupForRoster(saved, roster), team)) : undefined}
        />
      ) : null}
    >
      <View className="mb-5 gap-4">
        <View className="flex-row items-center gap-2">
          <Button size="sm" icon="chevron-left" label="L12" onPress={() => router.back(base)} />
          <StatusChip set={Boolean(saved)} label={saved ? 'Salvat' : 'Nesetat'} />
        </View>

        <View className="ui-rise relative overflow-hidden rounded-[16px] border p-3.5 md:p-4" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
          <View pointerEvents="none" className="absolute rounded-full" style={{ width: 220, height: 220, right: -50, top: -100, backgroundColor: 'var(--c-surface-tint)', opacity: 0.8 }} />
          <View className="relative flex-col lg:flex-row lg:items-start gap-3">
            <View className="flex-1 min-w-0">
              <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>L12 constant</Text>
              <View className="flex-row items-center gap-2.5 mt-2 min-w-0">
                <TeamAvatar name={team.name} mine size={34} />
                <Text className="f-display text-[17px] md:text-[19px] font-extrabold leading-tight shrink" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.02em' } as any} numberOfLines={2}>
                  {team.name}
                </Text>
              </View>
              <Text className="text-[13px] mt-1.5" style={{ color: 'var(--c-muted)' }}>
                Formula de bază a echipei. Fiecare meci nou pornește de aici.
              </Text>
              <View className="flex-row flex-wrap gap-1.5 mt-3">
                {team.leagueName ? <MetaChip icon="emoji-events" label={team.leagueName} /> : null}
                {team.seasonName ? <MetaChip icon="date-range" label={team.seasonName} /> : null}
                {teamGender ? <MetaChip icon="groups" label={teamGender === 'M' ? 'Masculin' : 'Feminin'} /> : null}
                {saved?.updatedAt ? <MetaChip icon="schedule" label={`Actualizat ${formatDate(saved.updatedAt)}`} /> : null}
              </View>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <Button icon="picture-as-pdf" label="PDF" onPress={() => exportAs('pdf')} />
              <Button icon="description" label="Word" onPress={() => exportAs('word')} />
            </View>
          </View>
        </View>
      </View>

      <L12Editor lineup={draft} onChange={setDraft} roster={roster} rosterLoading={rosterLoading} showMatchDetails={false} known={saved?.players ?? []} />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </PageShell>
  );
}
