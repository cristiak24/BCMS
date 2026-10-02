import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { l12Api, type L12Event, type L12Lineup, type L12Overview, type L12Team } from '../../services/l12Api';
import { teamsApi, type Player } from '../../services/teamsApi';
import PageContainer from '../ui/PageContainer';
import PageHeader from '../ui/PageHeader';
import ConfirmDialog from '../ui/ConfirmDialog';
import UnsavedBar from '../ui/UnsavedBar';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import { ToastHost, useToasts } from '../ui/Toast';
import FilterChips from '../ui/FilterChips';
import Pagination, { usePagination } from '../ui/Pagination';
import L12Editor, { EMPTY_LINEUP, lineupForRoster, sortLineupPlayers, validateLineup } from './L12Editor';
import { downloadL12Word, printL12, type L12DocumentInput } from './l12Document';
import { StatusChip, useL12Base } from './L12MatchLink';

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

function splitTeams(title: string, teamName: string) {
  const parts = title.split(/\s+vs\.?\s+/i);
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

function ActionButton({ icon, label, onPress, tone = 'neutral', disabled }: { icon: string; label: string; onPress: () => void; tone?: 'neutral' | 'danger'; disabled?: boolean }) {
  const fg = tone === 'danger' ? 'var(--c-danger-fg)' : 'var(--c-ink-soft)';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="ui-press h-10 px-3.5 rounded-[10px] border flex-row items-center gap-1.5 shrink-0"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', opacity: disabled ? 0.5 : 1 } as any}
    >
      <MaterialIcons name={icon} size={16} color={fg} />
      <Text className="text-[13px] font-semibold" style={{ color: fg }}>{label}</Text>
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

const MATCHES_PAGE_SIZE = 10;

type StatusFilter = 'all' | 'unset' | 'set';

export function L12HomeScreen() {
  const router = useRouter();
  const base = useL12Base();
  const [data, setData] = useState<L12Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'matches' | 'teams'>('matches');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

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

  const teamScopedMatches = useMemo(() => {
    if (!data) return [];
    if (teamFilter === 'all') return data.matches;
    return data.matches.filter((match) => String(match.teamId) === teamFilter);
  }, [data, teamFilter]);

  const statusOptions = useMemo(() => [
    { key: 'all' as const, label: 'Toate', count: teamScopedMatches.length },
    { key: 'unset' as const, label: 'Nesetate', count: teamScopedMatches.filter((m) => !m.hasLineup).length },
    { key: 'set' as const, label: 'Setate', count: teamScopedMatches.filter((m) => m.hasLineup).length },
  ], [teamScopedMatches]);

  const filteredMatches = useMemo(() => {
    if (statusFilter === 'all') return teamScopedMatches;
    return teamScopedMatches.filter((m) => (statusFilter === 'set' ? m.hasLineup : !m.hasLineup));
  }, [teamScopedMatches, statusFilter]);

  const { page, totalPages, pageItems: pagedMatches, setPage, rangeStart, rangeEnd, total } = usePagination(
    filteredMatches,
    MATCHES_PAGE_SIZE,
    `${teamFilter}:${statusFilter}`,
  );

  const teamOptions = useMemo(() => {
    if (!data) return [];
    return [
      { key: 'all', label: 'Toate echipele', count: data.matches.length },
      ...data.teams.map((team) => ({
        key: String(team.id),
        label: team.name,
        count: data.matches.filter((m) => m.teamId === team.id).length,
      })),
    ];
  }, [data]);

  return (
    <PageShell>
      <PageHeader title="L12" subtitle="Lista oficială a echipei pentru joc: 12 jucători, căpitanul și staff-ul tehnic." />

      {error ? (
        <ErrorState title="Nu am putut încărca L12" message={error} actionLabel="Reîncearcă" onAction={load} />
      ) : !data ? (
        <View className="gap-3">
          <Skeleton className="h-[64px] w-full rounded-[14px]" />
          <Skeleton className="h-[64px] w-full rounded-[14px]" />
          <Skeleton className="h-[64px] w-full rounded-[14px]" />
        </View>
      ) : (
        <View className="gap-4">
          {/* Below xl, only one section shows at a time — the team/L12-constant
              section used to sit under a potentially long match list and was
              easy to miss on a phone. */}
          <View className="p-[3px] rounded-[10px] flex-row self-start xl:hidden" style={{ backgroundColor: 'var(--c-surface-3)' }}>
            <Pressable
              onPress={() => setMobileTab('matches')}
              accessibilityRole="button"
              accessibilityState={{ selected: mobileTab === 'matches' }}
              className="px-3.5 h-8 rounded-[8px] justify-center"
              style={mobileTab === 'matches' ? ({ backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any) : undefined}
            >
              <Text className="text-[12px] font-semibold" style={{ color: mobileTab === 'matches' ? 'var(--c-ink)' : 'var(--c-muted)' }}>Meciuri</Text>
            </Pressable>
            <Pressable
              onPress={() => setMobileTab('teams')}
              accessibilityRole="button"
              accessibilityState={{ selected: mobileTab === 'teams' }}
              className="px-3.5 h-8 rounded-[8px] justify-center"
              style={mobileTab === 'teams' ? ({ backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any) : undefined}
            >
              <Text className="text-[12px] font-semibold" style={{ color: mobileTab === 'teams' ? 'var(--c-ink)' : 'var(--c-muted)' }}>L12 constant</Text>
            </Pressable>
          </View>

          <View className="flex-col xl:flex-row xl:items-start gap-6">
            <View className={`flex-1 min-w-0 ${mobileTab === 'teams' ? 'hidden xl:flex' : 'flex'}`}>
              <Text className="text-[15px] font-bold mb-1" style={{ color: 'var(--c-ink)' }}>Meciuri</Text>
              <Text className="t-meta mb-3" style={{ color: 'var(--c-muted)' }}>Meciurile următoare. Un L12 nesetat pornește din L12-ul constant al echipei.</Text>

              {data.matches.length === 0 ? (
                <EmptyState compact icon="sports-basketball" title="Niciun meci programat" message="Meciurile din program (inclusiv cele sincronizate de la FRB) apar aici." />
              ) : (
                <View className="gap-3">
                  <View className="gap-2">
                    {teamOptions.length > 2 ? <FilterChips options={teamOptions} value={teamFilter} onChange={setTeamFilter} label="Echipă" /> : null}
                    <FilterChips options={statusOptions} value={statusFilter} onChange={setStatusFilter} label="Stare L12" />
                  </View>

                  {filteredMatches.length === 0 ? (
                    <EmptyState compact icon="search-off" title="Niciun meci pentru acest filtru" message="Încearcă alt filtru de echipă sau de stare." />
                  ) : (
                    <>
                      <View className="gap-2 ui-stagger">
                        {pagedMatches.map((match) => (
                          <Pressable
                            key={match.eventId}
                            onPress={() => router.push(`${base}/match/${match.eventId}` as any)}
                            accessibilityRole="button"
                            accessibilityLabel={`L12 pentru ${match.title}`}
                            className="ui-lift ui-press rounded-[14px] border px-4 py-3 flex-row items-center gap-3 text-left"
                            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
                          >
                            <View className="flex-1 min-w-0">
                              <Text className="text-[14.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{match.title}</Text>
                              <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                {[formatDate(match.startTime, true), match.teamName].filter(Boolean).join(' · ')}
                              </Text>
                            </View>
                            <StatusChip set={match.hasLineup} label={match.hasLineup ? `${match.playerCount}/12` : 'Nesetat'} />
                            <MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" />
                          </Pressable>
                        ))}
                      </View>
                      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} itemNoun="meciuri" />
                    </>
                  )}
                </View>
              )}
            </View>

            <View className={`w-full xl:w-[420px] shrink-0 ${mobileTab === 'matches' ? 'hidden xl:flex' : 'flex'}`}>
              <Text className="text-[15px] font-bold mb-1" style={{ color: 'var(--c-ink)' }}>L12 constant</Text>
              <Text className="t-meta mb-3" style={{ color: 'var(--c-muted)' }}>Formula de bază a fiecărei echipe — jucători, căpitan și staff. Setează-o o dată aici și fiecare meci nou pornește din ea.</Text>
              {data.teams.length === 0 ? (
                <EmptyState compact icon="groups" title="Nicio echipă" message="Creează o echipă ca să-i setezi L12-ul." />
              ) : (
                <View className="gap-2 ui-stagger">
                  {data.teams.map((team) => (
                    <Pressable
                      key={team.id}
                      onPress={() => router.push(`${base}/team/${team.id}` as any)}
                      accessibilityRole="button"
                      accessibilityLabel={`L12 constant pentru ${team.name}`}
                      className="ui-lift ui-press rounded-[14px] border px-4 py-3 flex-row items-center gap-3 text-left"
                      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
                    >
                      <View className="flex-1 min-w-0">
                        <Text className="text-[14.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{team.name}</Text>
                        <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                          {[team.leagueName, team.coachName].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                      <StatusChip set={team.hasTemplate} label={team.hasTemplate ? `${team.templatePlayerCount}/12` : 'Nesetat'} />
                      <MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
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
  return { ...EMPTY_LINEUP, competition: team.leagueName || null, gender: team.gender ?? null };
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
      setDraft(saved);
      setBaseline(saved);
    } else if (template) {
      // Pre-filled from the template but not yet on this match: offer the save.
      setDraft(lineupForRoster({ ...template, competition: template.competition ?? team.leagueName ?? null }, roster));
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
      const result = await l12Api.saveForEvent(eventId, { ...draft, players: sortLineupPlayers(draft.players) });
      setSaved(result);
      setDraft(result);
      setBaseline(result);
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
      const result = await l12Api.saveTemplate(team.id, { ...draft, players: sortLineupPlayers(draft.players) });
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
      gender: draft.gender,
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

  return (
    <PageShell
      footer={dirty ? (
        <UnsavedBar
          label={saved ? 'Modificări nesalvate' : 'L12 nesalvat'}
          saving={saving}
          onSave={save}
          onDiscard={saved ? () => setDraft(saved) : undefined}
        />
      ) : null}
    >
      <View className="mb-5 gap-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <BackButton label="L12" onPress={() => router.back(base)} />
          <StatusChip set={Boolean(saved)} />
        </View>
        <View>
          <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Formular L-12 · {team.name}</Text>
          <Text className="text-[22px] md:text-[28px] font-bold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.5px' } as any}>
            {event.title}
          </Text>
          <Text className="text-[13px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }}>
            {[formatDate(event.startTime, true), event.location].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <ActionButton icon="picture-as-pdf" label="PDF" onPress={() => docInput && printL12(docInput)} />
          <ActionButton icon="description" label="Word" onPress={() => docInput && downloadL12Word(docInput)} />
          <ActionButton icon="leaderboard" label="Statistică live" onPress={() => router.push(`${base.replace('/l12', '')}/stats/${eventId}` as any)} />
          {template ? <ActionButton icon="restore" label="Încarcă L12 constant" onPress={() => setConfirm('template')} /> : null}
          <ActionButton icon="bookmark" label="Salvează ca L12 constant" onPress={() => setConfirm('saveTemplate')} disabled={draft.players.length === 0} />
          {saved ? <ActionButton icon="delete-outline" label="Șterge" tone="danger" onPress={() => setConfirm('reset')} /> : null}
        </View>

        {fromTemplate ? (
          <View className="flex-row items-center gap-2 rounded-[12px] px-3.5 py-2.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
            <MaterialIcons name="info" size={16} color="var(--c-brand-fg)" />
            <Text className="flex-1 text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>
              Pornit din L12-ul constant al echipei. Modifică ce e nevoie și salvează ca să-l fixezi pe acest meci.
            </Text>
          </View>
        ) : null}
      </View>

      <L12Editor lineup={draft} onChange={setDraft} roster={roster} rosterLoading={rosterLoading} />

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
          else if (template) setDraft(lineupForRoster({ ...template, competition: template.competition ?? draft.competition }, roster));
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
    const initial = saved ? lineupForRoster(saved, roster) : defaultLineup(team);
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
      const result = await l12Api.saveTemplate(teamId, { ...draft, players: sortLineupPlayers(draft.players) });
      setSaved(result);
      setDraft(result);
      setBaseline(result);
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

  const blankDoc: L12DocumentInput = {
    teamName: team.name,
    homeTeam: team.name,
    awayTeam: '',
    competition: draft.competition ?? '',
    gender: draft.gender,
    date: '',
    lineup: { ...draft, players: sortLineupPlayers(draft.players) },
  };

  return (
    <PageShell
      footer={dirty ? (
        <UnsavedBar
          label={saved ? 'Modificări nesalvate' : 'L12 constant nesalvat'}
          saving={saving}
          onSave={save}
          onDiscard={saved ? () => setDraft(lineupForRoster(saved, roster)) : undefined}
        />
      ) : null}
    >
      <View className="mb-5 gap-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <BackButton label="L12" onPress={() => router.back(base)} />
          <StatusChip set={Boolean(saved)} />
        </View>
        <View>
          <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>L12 constant</Text>
          <Text className="text-[22px] md:text-[28px] font-bold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.5px' } as any}>
            {team.name}
          </Text>
          <Text className="text-[13px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }}>
            Formula de bază: fiecare meci nou al echipei pornește de aici. Pe meci o poți modifica oricând.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <ActionButton icon="picture-as-pdf" label="PDF" onPress={() => printL12(blankDoc)} />
          <ActionButton icon="description" label="Word" onPress={() => downloadL12Word(blankDoc)} />
        </View>
      </View>

      <L12Editor lineup={draft} onChange={setDraft} roster={roster} rosterLoading={rosterLoading} />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </PageShell>
  );
}
