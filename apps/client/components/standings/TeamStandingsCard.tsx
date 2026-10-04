import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/ScreenState';
import { basketballApi, type Match, type StandingRow } from '../../services/basketballApi';
import { teamsApi, type Team } from '../../services/teamsApi';

/**
 * FRB league table for the viewer's OWN teams (coach and player/parent home,
 * and their team pages). Admins see the same data per team in Clubul meu
 * (TeamFrbPanel), so the admin home deliberately has no standings.
 *
 * Teams without FRB ids are skipped; with none left the card renders nothing.
 * Pass `teams` when the page already has them, or `teamId` to let the card
 * resolve that one team itself.
 */

const hasFrbIds = (team: Team) => Boolean(team.frbLeagueId && team.frbSeasonId && team.frbTeamId);

const normalizeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The team's name as FRB spells it — the one name present in (nearly) every
 * match of that FRB team. Our saved names are local ("U16 Masculin") and
 * rarely equal FRB's ("CSM Oradea U16"), so they can't find the row alone.
 */
function inferFrbName(matches: Match[]) {
  const counts = new Map<string, number>();
  for (const match of matches) {
    for (const name of [match.homeTeam, match.awayTeam]) {
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let max = 0;
  for (const [name, count] of counts) {
    if (count > max) {
      best = name;
      max = count;
    }
  }
  return max >= 2 ? best : null;
}

type TableLine = { kind: 'row'; row: StandingRow; ours: boolean } | { kind: 'gap'; key: string };

/** Compact: up to 8 lines — the whole table when short, else the top 3 plus our neighbourhood. */
function tableLines(rows: StandingRow[], ourIndex: number, full: boolean): TableLine[] {
  const toLine = (row: StandingRow, index: number): TableLine => ({ kind: 'row', row, ours: index === ourIndex });
  if (full) return rows.map(toLine);
  if (rows.length <= 8 || ourIndex < 0 || ourIndex <= 5) return rows.slice(0, 8).map(toLine);
  const keep = [0, 1, 2, ourIndex - 2, ourIndex - 1, ourIndex, ourIndex + 1].filter((i, at, all) => i >= 0 && i < rows.length && all.indexOf(i) === at);
  const lines: TableLine[] = [];
  keep.forEach((index, at) => {
    if (at > 0 && index - keep[at - 1] > 1) lines.push({ kind: 'gap', key: `gap-${index}` });
    lines.push(toLine(rows[index], index));
  });
  return lines;
}

export default function TeamStandingsCard({
  teams: teamsProp,
  teamId,
  full = false,
  showWhenEmpty = false,
  onOpenTeam,
}: {
  teams?: Team[] | null;
  teamId?: number;
  /** Team page: every row. Home: a compact window around our row. */
  full?: boolean;
  /** On a dedicated tab, say why it's empty instead of rendering nothing. */
  showWhenEmpty?: boolean;
  onOpenTeam?: (id: number) => void;
}) {
  const [resolved, setResolved] = useState<Team[] | null>(teamsProp ?? null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [standings, setStandings] = useState<Record<string, StandingRow[] | 'error'>>({});
  const [frbNames, setFrbNames] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (teamsProp !== undefined) {
      setResolved(teamsProp);
      return;
    }
    if (teamId == null) return;
    let cancelled = false;
    teamsApi.getTeams()
      .then((rows) => { if (!cancelled) setResolved(rows.filter((row) => row.id === teamId)); })
      .catch(() => { if (!cancelled) setResolved([]); });
    return () => { cancelled = true; };
  }, [teamsProp, teamId]);

  const teams = useMemo(() => (resolved ? resolved.filter(hasFrbIds) : null), [resolved]);
  const team = teams?.find((t) => t.id === selectedId) ?? teams?.[0] ?? null;
  const key = team ? `${team.frbLeagueId}|${team.frbSeasonId}` : null;
  const rows = key ? standings[key] : undefined;

  useEffect(() => {
    if (!team || !key || standings[key] !== undefined) return;
    basketballApi.getStandings(team.frbLeagueId, team.frbSeasonId)
      .then((data) => setStandings((prev) => ({ ...prev, [key]: data ?? [] })))
      .catch(() => setStandings((prev) => ({ ...prev, [key]: 'error' })));
  }, [team, key, standings]);

  const list = Array.isArray(rows) ? rows : [];
  const directIndex = team ? list.findIndex((row) => normalizeName(row.team) === normalizeName(team.name)) : -1;

  // Only when our saved name isn't in the table: learn FRB's spelling from the team's matches.
  useEffect(() => {
    if (!team || !list.length || directIndex >= 0 || team.id in frbNames) return;
    basketballApi.getMatches(team.frbLeagueId, team.frbSeasonId, team.frbTeamId, 'all')
      .then((matches) => setFrbNames((prev) => ({ ...prev, [team.id]: inferFrbName(matches) })))
      .catch(() => setFrbNames((prev) => ({ ...prev, [team.id]: null })));
  }, [team, list.length, directIndex, frbNames]);

  if (teams !== null && teams.length === 0) {
    return showWhenEmpty ? (
      <EmptyState compact icon="leaderboard" title="Fără clasament" message="Echipa nu este legată de o competiție FRB." />
    ) : null;
  }

  const inferred = team ? frbNames[team.id] : null;
  const ourIndex = directIndex >= 0 ? directIndex : inferred ? list.findIndex((row) => normalizeName(row.team) === normalizeName(inferred)) : -1;
  const ours = ourIndex >= 0 ? list[ourIndex] : null;
  const winRate = ours && ours.played ? Math.round((ours.wins / ours.played) * 100) : null;

  return (
    <View
      className="ui-rise rounded-[16px] border overflow-hidden"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-3 px-4 md:px-5 py-3.5 mb-3" style={{ borderBottomWidth: 1, borderBottomColor: 'var(--c-border-soft)' } as any}>
        <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-purple-bg)' }}>
          <MaterialIcons name="leaderboard" size={16} color="var(--c-purple-fg)" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)', letterSpacing: '-0.01em' } as any} numberOfLines={1}>Clasament</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
            {team ? [team.leagueName, team.seasonName].filter(Boolean).join(' · ') || 'Competiție FRB' : 'Competiție FRB'}
          </Text>
        </View>
        {team && onOpenTeam ? (
          <Pressable
            onPress={() => onOpenTeam(team.id)}
            accessibilityRole="link"
            className="ui-press flex-row items-center gap-1 rounded-[8px] border px-2.5 h-8 shrink-0 hover:bg-[var(--c-surface-2)]"
            style={{ borderColor: 'var(--c-border)' } as any}
          >
            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Echipa</Text>
            <MaterialIcons name="arrow-forward" size={14} color="var(--c-muted)" />
          </Pressable>
        ) : null}
      </View>

      {teams && teams.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerClassName="px-4 md:px-5 gap-1.5">
          {teams.map((t) => {
            const active = t.id === team?.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setSelectedId(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className="ui-press rounded-full border px-3 h-8 items-center justify-center shrink-0"
                style={{
                  backgroundColor: active ? 'var(--c-ink-strong)' : 'var(--c-surface)',
                  borderColor: active ? 'var(--c-ink-strong)' : 'var(--c-border)',
                } as any}
              >
                <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-surface)' : 'var(--c-ink-soft)' }} numberOfLines={1}>{t.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View className="pb-2">
        {!teams || rows === undefined ? (
          <View className="px-4 md:px-5 pb-2 gap-2">
            <Skeleton className="h-[64px] w-full rounded-[12px]" />
            <Skeleton className="h-[160px] w-full rounded-[12px]" />
          </View>
        ) : rows === 'error' || list.length === 0 ? (
          <View className="px-4 md:px-5 pb-3">
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
              {rows === 'error' ? 'Nu am putut încărca clasamentul din FRB.' : 'Clasament indisponibil pentru acest sezon.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Our line at a glance: place, record, win rate. */}
            <View className="flex-row items-stretch mx-4 md:mx-5 mb-3 rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--c-border-soft)', backgroundColor: 'var(--c-surface-2)' } as any}>
              <View className="px-4 py-3 justify-center" style={{ borderRightWidth: 1, borderRightColor: 'var(--c-border-soft)' } as any}>
                <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>Loc</Text>
                <View className="flex-row items-baseline gap-1 mt-1">
                  <Text className="t-num text-[26px] font-bold leading-none" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.03em' } as any}>{ours ? ours.position : '—'}</Text>
                  <Text className="t-num text-[12px] font-semibold" style={{ color: 'var(--c-faint)' }}>/ {list.length}</Text>
                </View>
              </View>
              <View className="flex-1 min-w-0 px-4 py-3 justify-center gap-2">
                <View className="flex-row items-center gap-4">
                  {[
                    { label: 'Meciuri', value: ours?.played },
                    { label: 'Victorii', value: ours?.wins, color: 'var(--c-success-fg)' },
                    { label: 'Înfrângeri', value: ours?.losses, color: 'var(--c-danger-fg)' },
                    { label: 'Puncte', value: ours?.points },
                  ].map((stat) => (
                    <View key={stat.label} className="min-w-0">
                      <Text className="text-[11px] font-medium" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{stat.label}</Text>
                      <Text className="t-num text-[15px] font-bold" style={{ color: stat.color ?? 'var(--c-ink)' }}>{stat.value ?? '—'}</Text>
                    </View>
                  ))}
                </View>
                {winRate != null ? (
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                      <View className="ui-bar h-full rounded-full" style={{ width: `${winRate}%`, backgroundColor: 'var(--c-purple)' }} />
                    </View>
                    <Text className="t-num text-[11.5px] font-semibold shrink-0" style={{ color: 'var(--c-muted)' }}>{winRate}% victorii</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="mx-4 md:mx-5 mb-2">
              <View className="flex-row items-center px-2 pb-1.5">
                <Text className="t-eyebrow w-7" style={{ color: 'var(--c-faint)' }}>#</Text>
                <Text className="t-eyebrow flex-1" style={{ color: 'var(--c-faint)' }}>Echipă</Text>
                {['J', 'V', 'Î', 'Pct'].map((h) => (
                  <Text key={h} className="t-eyebrow w-9 text-right" style={{ color: 'var(--c-faint)' }}>{h}</Text>
                ))}
              </View>
              {tableLines(list, ourIndex, full).map((line) => line.kind === 'gap' ? (
                <View key={line.key} className="items-center py-0.5">
                  <MaterialIcons name="more-horiz" size={16} color="var(--c-faint)" />
                </View>
              ) : (
                <View
                  key={`${line.row.position}-${line.row.team}`}
                  className="relative flex-row items-center px-2 py-2 rounded-[8px]"
                  style={{
                    backgroundColor: line.ours ? 'var(--c-surface-tint)' : 'transparent',
                    borderTopWidth: line.ours ? 0 : 1,
                    borderTopColor: 'var(--c-border-soft)',
                  } as any}
                >
                  {line.ours ? <View pointerEvents="none" className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ backgroundColor: 'var(--c-brand-fg)' }} /> : null}
                  <Text className="t-num w-7 text-[13px] font-semibold" style={{ color: line.ours ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>{line.row.position}</Text>
                  <Text className="flex-1 min-w-0 text-[13px]" style={{ color: line.ours ? 'var(--c-brand-fg)' : 'var(--c-ink)', fontWeight: line.ours ? 700 : 500 } as any} numberOfLines={1}>{line.row.team}</Text>
                  <Text className="t-num w-9 text-right text-[13px]" style={{ color: 'var(--c-ink-soft)' }}>{line.row.played}</Text>
                  <Text className="t-num w-9 text-right text-[13px]" style={{ color: 'var(--c-ink-soft)' }}>{line.row.wins}</Text>
                  <Text className="t-num w-9 text-right text-[13px]" style={{ color: 'var(--c-ink-soft)' }}>{line.row.losses}</Text>
                  <Text className="t-num w-9 text-right text-[13px] font-bold" style={{ color: line.ours ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>{line.row.points}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}
