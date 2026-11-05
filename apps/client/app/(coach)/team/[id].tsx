import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { useSession } from '../../../context/AuthContext';
import { CalendarEvent, eventsApi } from '../../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../../services/teamsApi';
import PageContainer from '../../../components/ui/PageContainer';
import PageHero, { GlassStat, StatStrip } from '../../../components/admin/PageHero';
import { DenseList } from '../../../components/ui/DenseList';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { GENDER_LABELS, LEVEL_LABELS } from '../../../components/myclub/teamDisplay';
import { AttendanceRate, Chip, CoachPlayerRow, SessionRow } from '../../../components/coach/CoachPrimitives';
import { attendanceRateColor, getPlayerBadge } from '../../../components/coach/coachDisplay';
import { formatCoachDate, getEventTimestamp, isUpcoming } from '../../../components/coach/coachUtils';
import BulkAddPlayersDialog from '../../../components/family/BulkAddPlayersDialog';
import TeamStandingsCard from '../../../components/standings/TeamStandingsCard';
import TeamSeasonTable from '../../../components/stats/TeamSeasonTable';
import { coachCoachesTeam } from '../../../utils/coachEventScope';
import { ATTENDANCE_PERIOD_LABEL, pooledAttendanceRate } from '../../../utils/attendanceRate';
import { plural, pluralWord } from '../../../utils/plural';
import { playerStatusLabel } from '../../../utils/playerStatus';

import { tr } from '../../../i18n';
/**
 * A coach's own squad in full — the roster TeamCard on /coach/teams only
 * previews (5 rows + "+N others"), plus the team's upcoming sessions.
 */

function DetailSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel={tr('Se încarcă echipa')}>
      <View className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[68px] w-full rounded-[12px]" />
        ))}
      </View>
    </View>
  );
}

export default function CoachTeamDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useSession();
  const teamId = Number(id);

  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);

    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const [teamRows, playerRows, eventRows, stats] = await Promise.all([
        teamsApi.getTeams(),
        teamsApi.getTeamPlayers(teamId),
        eventsApi.getEvents({ start: since.toISOString() }),
        // The squad list carries no attendance; the team's stats do (the
        // shared 30-day rate, server lib/attendanceRate.ts).
        teamsApi.getTeamStats(teamId).catch(() => null),
      ]);

      const statByPlayer = new Map((stats?.players ?? []).map((row) => [row.playerId, row]));
      setTeam(teamRows.find((row) => row.id === teamId) ?? null);
      setPlayers(playerRows.map((player) => {
        const stat = statByPlayer.get(player.id);
        return stat
          ? { ...player, attendanceRate: stat.attendanceRate, attendanceAttended: stat.present, attendanceCounted: stat.total }
          : player;
      }));
      setEvents(eventRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Echipa nu a putut fi încărcată.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (Number.isFinite(teamId)) loadData();
  }, [loadData, teamId]);

  const chips = useMemo(() => {
    if (!team) return [] as string[];
    return [
      team.level ? LEVEL_LABELS[team.level] : null,
      team.gender ? GENDER_LABELS[team.gender] : null,
      team.seasonName || null,
    ].filter(Boolean) as string[];
  }, [team]);

  const upcomingEvents = useMemo(
    () => events
      .filter((event) => event.teamId === teamId && isUpcoming(event))
      .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [events, teamId],
  );

  // Pooled over the squad's marked sessions, last 30 days (utils/attendanceRate.ts).
  const average = pooledAttendanceRate(players);

  // Lowest attendance first — the players a coach needs to see are the ones
  // slipping, not an alphabetical roster.
  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => (a.attendanceRate ?? 101) - (b.attendanceRate ?? 101)),
    [players],
  );

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <Pressable
          onPress={() => router.push('/coach/teams')}
          accessibilityRole="button"
          accessibilityLabel={tr('Înapoi la echipele mele')}
          className="flex-row items-center gap-1.5 self-start mb-3 min-h-[44px] lg:h-8 px-2 -ml-2 rounded-[9px]"
        >
          <MaterialIcons name="arrow-back" size={17} color="var(--c-muted)" />
          <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>{tr('Echipele mele')}</Text>
        </Pressable>

        <PageHero
          eyebrow={tr('Echipă')}
          title={team?.name || tr('Echipă')}
          subtitle={team ? [team.leagueName, team.seasonName].filter(Boolean).join(' · ') : tr('Se încarcă...')}
          leading={
            <View
              className="w-12 h-12 rounded-[14px] border items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
            >
              <MaterialIcons name="shield" size={22} color="var(--c-muted)" />
            </View>
          }
          actions={
            <Pressable
              onPress={() => loadData(true)}
              className="ui-press hidden sm:flex w-10 h-10 rounded-[11px] border items-center justify-center"
              style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
              accessibilityRole="button"
              accessibilityLabel={tr('Reîmprospătează')}
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        >
          {team ? (
            <>
              {chips.length ? (
                <View className="flex-row flex-wrap gap-1.5">
                  {chips.map((chip) => <Chip key={chip} label={chip} />)}
                </View>
              ) : null}
              <StatStrip className="grid-cols-3">
                <GlassStat dot="var(--c-purple)" label={tr('Lot')} value={players.length} hint={pluralWord(players.length, tr('jucător'), tr('jucători'))} />
                <GlassStat
                  dot={attendanceRateColor(average)}
                  label={tr('Prezență')}
                  hint={ATTENDANCE_PERIOD_LABEL.toLowerCase()}
                  value={average ?? '—'}
                  suffix={average == null ? undefined : '%'}
                  bar={average ?? undefined}
                />
                <GlassStat
                  dot="var(--c-brand-fg)"
                  label={tr('Urmează')}
                  value={upcomingEvents.length}
                  hint={upcomingEvents[0] ? tr('Următoarea: {0}', { '0': formatCoachDate(upcomingEvents[0].startTime) }) : tr('nimic programat')}
                />
              </StatStrip>
            </>
          ) : null}
        </PageHero>

        {loading ? (
          <DetailSkeleton />
        ) : error ? (
          <ErrorState
            title={tr('Nu am putut încărca echipa')}
            message={error}
            actionLabel={tr('Reîncearcă')}
            onAction={() => loadData(true)}
          />
        ) : !team ? (
          <EmptyState icon="groups" title={tr('Echipa nu este disponibilă')} message={tr('Întoarce-te la lista echipelor tale.')} />
        ) : (
          <View className="gap-5">
            <View className="gap-2.5">
              <View className="flex-row items-center gap-2">
                <Text accessibilityRole="header" className="f-display flex-1 text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>{tr('Lot')}</Text>
                {/* Adding players is the team's own coach's (server: bulk route). */}
                {coachCoachesTeam(team, session?.id) ? (
                  <Pressable
                    onPress={() => setShowBulk(true)}
                    accessibilityRole="button"
                    className="ui-press h-10 px-3 rounded-[10px] border flex-row items-center gap-1.5"
                    style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                  >
                    <MaterialIcons name="group-add" size={15} color="var(--c-brand-fg)" />
                    <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{tr('Adaugă din listă')}</Text>
                  </Pressable>
                ) : null}
              </View>
              {notice ? <Text className="t-meta" style={{ color: 'var(--c-success-fg)' }}>{notice}</Text> : null}
              {sortedPlayers.length === 0 ? (
                <EmptyState icon="groups" compact title={tr('Lotul este gol')} message={tr('Niciun jucător nu este alocat acestei echipe deocamdată.')} />
              ) : (
                <DenseList label={tr('Lot')}>
                  {sortedPlayers.map((player) => (
                    <CoachPlayerRow
                      key={player.id}
                      inList
                      firstName={player.firstName}
                      lastName={player.lastName}
                      badge={getPlayerBadge(player)}
                      // „Activ” on every row said nothing; only another status does.
                      meta={player.position || (player.status && player.status !== 'active' ? playerStatusLabel(player.status) : null)}
                      trailing={<AttendanceRate rate={player.attendanceRate} />}
                    />
                  ))}
                </DenseList>
              )}
            </View>

            <View className="gap-2.5">
              <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>{tr('Următoarele sesiuni')}</Text>
              {upcomingEvents.length === 0 ? (
                <EmptyState icon="event-busy" compact title={tr('Niciun eveniment programat')} message={tr('Antrenamentele și meciurile viitoare ale echipei apar aici.')} />
              ) : (
                <DenseList label={tr('Următoarele sesiuni')}>
                  {upcomingEvents.map((event) => <SessionRow key={event.id} inList event={event} />)}
                </DenseList>
              )}
            </View>

            {Number.isFinite(teamId) ? <TeamSeasonTable teamId={teamId} /> : null}

            <TeamStandingsCard teams={team ? [team] : null} full />
          </View>
        )}
      </PageContainer>
      {team ? (
        <BulkAddPlayersDialog
          visible={showBulk}
          teamId={team.id}
          teamName={team.name}
          onClose={() => setShowBulk(false)}
          onDone={({ created, skipped }) => {
            setShowBulk(false);
            setNotice(`${plural(created, tr('jucător adăugat'), tr('jucători adăugați'))}${skipped.length ? tr(', {0} deja în lot', { '0': plural(skipped.length, 'era', 'erau') }) : ''}.`);
            void loadData(true);
          }}
        />
      ) : null}
    </ScrollView>
  );
}
