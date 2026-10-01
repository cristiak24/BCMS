import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../../services/teamsApi';
import PageContainer from '../../../components/ui/PageContainer';
import PageHeader from '../../../components/ui/PageHeader';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { GENDER_LABELS, LEVEL_LABELS } from '../../../components/myclub/teamDisplay';
import { AttendanceRate, Chip, CoachPlayerRow, SessionRow, StatTile } from '../../../components/coach/CoachPrimitives';
import { attendanceRateColor, getPlayerBadge } from '../../../components/coach/coachDisplay';
import { formatCoachDate, getEventTimestamp, isUpcoming } from '../../../components/coach/coachUtils';
import BulkAddPlayersDialog from '../../../components/family/BulkAddPlayersDialog';

/**
 * A coach's own squad in full — the roster TeamCard on /coach/teams only
 * previews (5 rows + "+N others"), plus the team's upcoming sessions.
 */

function DetailSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă echipa">
      <Skeleton className="h-[120px] w-full rounded-[16px]" />
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
      const [teamRows, playerRows, eventRows] = await Promise.all([
        teamsApi.getTeams(),
        teamsApi.getTeamPlayers(teamId),
        eventsApi.getEvents({ start: since.toISOString() }),
      ]);

      setTeam(teamRows.find((row) => row.id === teamId) ?? null);
      setPlayers(playerRows);
      setEvents(eventRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Echipa nu a putut fi încărcată.');
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

  const rated = players.filter((player) => player.attendanceRate != null);
  const average = rated.length
    ? Math.round(rated.reduce((sum, player) => sum + (player.attendanceRate ?? 0), 0) / rated.length)
    : null;

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
          accessibilityLabel="Înapoi la echipele mele"
          className="flex-row items-center gap-1.5 self-start mb-3 min-h-[44px] lg:h-8 px-2 -ml-2 rounded-[9px]"
        >
          <MaterialIcons name="arrow-back" size={17} color="var(--c-muted)" />
          <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Echipele mele</Text>
        </Pressable>

        <PageHeader
          keepTitleOnMobile
          actionsOnMobile={false}
          title={team?.name || 'Echipă'}
          subtitle={team ? [team.leagueName, team.seasonName].filter(Boolean).join(' · ') : 'Se încarcă...'}
          actions={
            <Pressable
              onPress={() => loadData(true)}
              className="w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

        {loading ? (
          <DetailSkeleton />
        ) : error ? (
          <ErrorState
            title="Nu am putut încărca echipa"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadData(true)}
          />
        ) : !team ? (
          <EmptyState icon="groups" title="Echipa nu este disponibilă" message="Întoarce-te la lista echipelor tale." />
        ) : (
          <View className="gap-4">
            <View
              className="rounded-[16px] border p-4 gap-3.5"
              style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
            >
              {chips.length ? (
                <View className="flex-row flex-wrap gap-1.5">
                  {chips.map((chip) => <Chip key={chip} label={chip} />)}
                </View>
              ) : null}

              <View className="flex-row gap-2 sm:gap-2.5">
                <StatTile icon="groups" tone="purple" label="Lot" value={players.length} hint={players.length === 1 ? 'jucător' : 'jucători'} />
                <StatTile
                  icon="trending-up"
                  tone="brand"
                  label="Prezență medie"
                  value={average == null ? '—' : `${average}%`}
                  color={attendanceRateColor(average)}
                  hint={average == null ? 'nemarcată' : 'lot'}
                />
                <StatTile
                  icon="event"
                  tone="brand"
                  label="Urmează"
                  value={upcomingEvents.length}
                  hint={upcomingEvents[0] ? formatCoachDate(upcomingEvents[0].startTime) : 'nimic programat'}
                />
              </View>
            </View>

            <View className="gap-2.5">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-faint)' }}>Lot complet</Text>
                <Pressable
                  onPress={() => setShowBulk(true)}
                  accessibilityRole="button"
                  className="ui-press h-9 px-3 rounded-[10px] border flex-row items-center gap-1.5"
                  style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                >
                  <MaterialIcons name="group-add" size={15} color="var(--c-brand-fg)" />
                  <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Adaugă din listă</Text>
                </Pressable>
              </View>
              {notice ? <Text className="t-meta" style={{ color: 'var(--c-success-fg)' }}>{notice}</Text> : null}
              {sortedPlayers.length === 0 ? (
                <EmptyState icon="groups" compact title="Lotul este gol" message="Niciun jucător nu este alocat acestei echipe deocamdată." />
              ) : (
                <View className="gap-2 ui-stagger">
                  {sortedPlayers.map((player) => (
                    <CoachPlayerRow
                      key={player.id}
                      firstName={player.firstName}
                      lastName={player.lastName}
                      badge={getPlayerBadge(player)}
                      meta={player.position || player.status || 'Jucător'}
                      rate={player.attendanceRate ?? null}
                      trailing={<AttendanceRate rate={player.attendanceRate} />}
                    />
                  ))}
                </View>
              )}
            </View>

            <View className="gap-2.5">
              <Text className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-faint)' }}>Urmează</Text>
              {upcomingEvents.length === 0 ? (
                <EmptyState icon="event-busy" compact title="Niciun eveniment programat" message="Antrenamentele și meciurile viitoare ale echipei apar aici." />
              ) : (
                upcomingEvents.map((event) => <SessionRow key={event.id} event={event} />)
              )}
            </View>
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
            setNotice(`${created} ${created === 1 ? 'jucător adăugat' : 'jucători adăugați'}${skipped.length ? `, ${skipped.length} ${skipped.length === 1 ? 'era' : 'erau'} deja în lot` : ''}.`);
            void loadData(true);
          }}
        />
      ) : null}
    </ScrollView>
  );
}
