import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { gamesApi, type TeamSeason, type TeamSeasonRow } from '../../services/gamesApi';
import { useResponsive } from '../../hooks/useResponsive';
import { plural } from '../../utils/plural';
import { formatStat, sortSeasonRows, type SeasonSortKey } from '../../utils/seasonStats';
import { Skeleton } from '../ui/Skeleton';

/**
 * The team's season, one row per player who was on a finished match sheet
 * (server GET /api/games/season/teams/:id). Sortable by tapping a column
 * header. On a phone only player · M · Pct/m stay; a row opens the rest.
 */

const COLUMNS: { key: SeasonSortKey; label: string; full: string }[] = [
  { key: 'games', label: 'M', full: 'Meciuri' },
  { key: 'pts', label: 'Pct/m', full: 'Puncte pe meci' },
  { key: 'reb', label: 'Rec/m', full: 'Recuperări pe meci' },
  { key: 'ast', label: 'Pase/m', full: 'Pase decisive pe meci' },
  { key: 'ptsTotal', label: 'Total', full: 'Total puncte' },
];

function cell(row: TeamSeasonRow, key: SeasonSortKey) {
  if (key === 'games') return String(row.games);
  if (key === 'ptsTotal') return String(row.totals.pts);
  return formatStat(row.averages[key]);
}

export default function TeamSeasonTable({ teamId, title = 'Statistici de sezon' }: { teamId: number; title?: string }) {
  const { width } = useResponsive();
  const compact = width < 640;
  const [data, setData] = useState<TeamSeason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SeasonSortKey>('pts');
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    gamesApi.teamSeason(teamId)
      .then((season) => { if (alive) setData(season); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Nu am putut încărca statisticile.'); });
    return () => { alive = false; };
  }, [teamId]);

  const rows = useMemo(() => (data ? sortSeasonRows(data.players, sortKey) : []), [data, sortKey]);
  // Rebounds/assists exist only on full-mode sheets: no empty "—" columns.
  const anyFull = (data?.players ?? []).some((row) => row.fullGames > 0);
  const available = COLUMNS.filter((column) => anyFull || (column.key !== 'reb' && column.key !== 'ast'));
  const columns = compact ? available.slice(0, 2) : available;
  const colWidth = compact ? 'w-[52px]' : 'w-[72px]';

  return (
    <View className="rounded-[16px] border p-4 md:p-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
      <View className="flex-row items-center gap-2.5 mb-3">
        <View className="w-8 h-8 rounded-[9px] items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name="leaderboard" size={17} color="var(--c-brand-fg)" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="f-display text-[15px] font-bold" style={{ color: 'var(--c-ink-strong)' }} accessibilityRole="header">{title}</Text>
          {data ? (
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
              Sezonul {data.season.label} · {data.games ? plural(data.games, 'meci încheiat', 'meciuri încheiate') : 'niciun meci încheiat'}
            </Text>
          ) : null}
        </View>
      </View>

      {error ? (
        <Text className="t-meta" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
      ) : !data ? (
        <Skeleton className="h-[140px] w-full rounded-[12px]" />
      ) : !rows.length ? (
        <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Statisticile apar după primul meci încheiat cu foaia de statistică.</Text>
      ) : (
        <View>
          <View className="flex-row items-center gap-2 px-2 pb-2" style={{ borderBottomWidth: 1, borderBottomColor: 'var(--c-border)' } as any}>
            <Text className="flex-1 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--c-faint)' }}>Jucător</Text>
            {columns.map((column) => {
              const active = sortKey === column.key;
              return (
                <Pressable
                  key={column.key}
                  onPress={() => setSortKey(column.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sortează după ${column.full.toLowerCase()}`}
                  accessibilityState={{ selected: active }}
                  className={`ui-press ${colWidth} flex-row items-center justify-end gap-0.5`}
                >
                  <Text className="text-[11.5px] font-bold uppercase tracking-[0.04em]" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-faint)' }} numberOfLines={1}>
                    {column.label}
                  </Text>
                  {active ? <MaterialIcons name="arrow-downward" size={12} color="var(--c-brand-fg)" /> : null}
                </Pressable>
              );
            })}
            {compact ? <View className="w-4" /> : null}
          </View>

          {rows.map((row, index) => {
            const open = compact && openId === row.playerId;
            const name = `${row.firstName} ${row.lastName}`.trim();
            const content = (
              <View className="flex-row items-center gap-2 px-2 py-2.5">
                <View className="flex-1 min-w-0 flex-row items-center gap-2">
                  <Text className="t-num w-6 text-[12px] font-bold text-right" style={{ color: 'var(--c-faint)' }}>{row.number || ''}</Text>
                  <Text className="flex-1 text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{name}</Text>
                </View>
                {columns.map((column) => (
                  <Text
                    key={column.key}
                    className={`t-num ${colWidth} text-right text-[13.5px]`}
                    style={{ color: sortKey === column.key ? 'var(--c-ink-strong)' : 'var(--c-ink-soft)', fontWeight: sortKey === column.key ? 700 : 500 } as any}
                  >
                    {cell(row, column.key)}
                  </Text>
                ))}
                {compact ? <MaterialIcons name="expand-more" size={16} color="var(--c-faint)" style={{ transform: open ? 'rotate(180deg)' : undefined }} /> : null}
              </View>
            );
            return (
              <View key={row.playerId} style={index > 0 ? ({ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any) : undefined}>
                {compact ? (
                  <Pressable
                    onPress={() => setOpenId(open ? null : row.playerId)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${name}: detalii sezon`}
                    className="ui-press"
                  >
                    {content}
                  </Pressable>
                ) : content}
                {open ? (
                  <View className="flex-row flex-wrap gap-x-4 gap-y-1 px-2 pb-3 pl-10">
                    {available.slice(2).map((column) => (
                      <Text key={column.key} className="t-meta" style={{ color: 'var(--c-muted)' }}>
                        {column.full}: <Text className="t-num font-semibold" style={{ color: 'var(--c-ink)' }}>{cell(row, column.key)}</Text>
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}

          {anyFull && data.players.some((row) => row.fullGames < row.games) ? (
            <Text className="t-meta mt-3" style={{ color: 'var(--c-muted)' }}>
              Recuperările și pasele vin doar din meciurile ținute în modul complet; „—” = niciun astfel de meci.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
