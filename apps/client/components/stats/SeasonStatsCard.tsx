import { useEffect, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { gamesApi, type PlayerSeason } from '../../services/gamesApi';
import { parseApiDate } from '../../utils/dates';
import { plural } from '../../utils/plural';
import { formatPct, formatStat } from '../../utils/seasonStats';
import FilterChips from '../ui/FilterChips';
import { Skeleton } from '../ui/Skeleton';

/**
 * A player's season, from the finished matches' box scores (server
 * GET /api/games/season/players/:id). Averages or totals, shooting from
 * full-mode sheets, and the last five matches on demand.
 */

type StatView = 'avg' | 'total';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View className="rounded-[12px] px-3 py-2.5 min-w-0" style={{ backgroundColor: 'var(--c-surface-2)' }}>
      <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }} numberOfLines={2}>{label}</Text>
      <Text className="t-num text-[20px] font-bold mt-0.5" style={{ color: 'var(--c-ink-strong)' }}>{value}</Text>
      {hint ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

function shortDate(value: string | null) {
  if (!value) return '';
  const date = parseApiDate(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' }).format(date);
}

export default function SeasonStatsCard({ playerId }: { playerId: number }) {
  const [data, setData] = useState<PlayerSeason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<StatView>('avg');
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    gamesApi.playerSeason(playerId)
      .then((season) => { if (alive) setData(season); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Nu am putut încărca statisticile.'); });
    return () => { alive = false; };
  }, [playerId]);

  const avg = mode === 'avg';
  const pick = (average: number | null, total: number) => (avg ? formatStat(average) : formatStat(total));
  const full = (data?.fullGames ?? 0) > 0;

  return (
    <View className="ui-rise rounded-[16px] border p-4 md:p-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
      <View className="flex-row flex-wrap items-center gap-2.5 mb-4">
        <View className="w-8 h-8 rounded-[9px] items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name="sports-basketball" size={17} color="var(--c-brand-fg)" />
        </View>
        <View className="flex-1 min-w-[140px]">
          <Text className="f-display text-[15px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>
            Sezonul {data?.season.label ?? ''}
          </Text>
          {data ? (
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
              {data.games ? `${plural(data.games, 'meci încheiat', 'meciuri încheiate')}` : 'Niciun meci încheiat încă'}
            </Text>
          ) : null}
        </View>
        {data?.games ? (
          <FilterChips
            label="Afișare statistici"
            value={mode}
            onChange={setMode}
            options={[{ key: 'avg', label: 'Medii' }, { key: 'total', label: 'Totaluri' }]}
          />
        ) : null}
      </View>

      {error ? (
        <Text className="t-meta" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
      ) : !data ? (
        <Skeleton className="h-[120px] w-full rounded-[12px]" />
      ) : !data.games ? (
        <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
          Statisticile apar după primul meci încheiat în care jucătorul e pe foaia de joc.
        </Text>
      ) : (
        <View className="gap-3">
          {/* Only what the sheets recorded: a simple-mode season has points
              and fouls, not eight tiles of "—". */}
          <View className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Puncte', value: pick(data.averages.pts, data.totals.pts), show: true },
              { label: 'Recuperări', value: pick(data.averages.reb, data.totals.reb), show: full },
              { label: 'Pase decisive', value: pick(data.averages.ast, data.totals.ast), show: full },
              { label: 'Faulturi', value: pick(data.averages.pf, data.totals.pf), show: true },
              { label: 'Furturi', value: pick(data.averages.stl, data.totals.stl), show: full },
              { label: 'Capace', value: pick(data.averages.blk, data.totals.blk), show: full },
              { label: 'Mingi pierdute', value: pick(data.averages.tov, data.totals.tov), show: full },
              {
                label: 'Minute',
                value: avg ? formatStat(data.averages.minutes) : formatStat(Math.round(data.totals.secondsPlayed / 60)),
                show: data.timedGames > 0,
              },
            ].filter((tile) => tile.show).map((tile) => (
              <Tile key={tile.label} label={tile.label} value={tile.value} hint={avg ? 'pe meci' : 'total'} />
            ))}
          </View>

          {full ? (
            <View className="grid grid-cols-3 gap-2">
              <Tile label="Aruncări de 2" value={formatPct(data.shooting.fg2Pct)} hint={`${data.shooting.fgm2}/${data.shooting.fga2}`} />
              <Tile label="Aruncări de 3" value={formatPct(data.shooting.fg3Pct)} hint={`${data.shooting.fgm3}/${data.shooting.fga3}`} />
              <Tile label="Aruncări libere" value={formatPct(data.shooting.ftPct)} hint={`${data.shooting.ftm}/${data.shooting.fta}`} />
            </View>
          ) : null}

          {data.fullGames < data.games ? (
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
              {full
                ? `Recuperările, pasele și procentele vin din ${plural(data.fullGames, 'meciul ținut', 'meciurile ținute')} în modul complet.`
                : 'Recuperările, pasele, furturile și procentele apar după meciurile ținute în modul complet.'}
            </Text>
          ) : null}

          {data.recent.length ? (
            <View>
              <Pressable
                onPress={() => setShowRecent((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showRecent }}
                className="ui-press self-start flex-row items-center gap-1 h-8"
              >
                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                  {showRecent ? 'Ascunde ultimele meciuri' : `Ultimele meciuri (${data.recent.length})`}
                </Text>
                <MaterialIcons name="expand-more" size={16} color="var(--c-brand-fg)" style={{ transform: showRecent ? 'rotate(180deg)' : undefined }} />
              </Pressable>
              {showRecent ? (
                <View className="mt-1">
                  {data.recent.map((game, index) => (
                    <View
                      key={game.eventId}
                      className="flex-row items-center gap-3 py-2.5"
                      style={index > 0 ? ({ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any) : undefined}
                    >
                      <View className="flex-1 min-w-0">
                        <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                          {game.opponentName ? `vs ${game.opponentName}` : game.title}
                        </Text>
                        <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                          {[shortDate(game.startTime), `${game.scoreUs}–${game.scoreThem}`].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text className="t-num text-[13px] font-semibold text-right" style={{ color: 'var(--c-ink-soft)' }}>
                        {[`${game.pts} pct`, game.reb != null ? `${game.reb} rec` : null, game.ast != null ? `${game.ast} pase` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
