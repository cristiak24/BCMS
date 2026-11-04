import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import PageContainer from '../../components/ui/PageContainer';
import PageHero, { GlassStat, StatStrip } from '../../components/admin/PageHero';
import { DenseList } from '../../components/ui/DenseList';
import { coachManagedTeamIds } from '../../utils/coachEventScope';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { GENDER_LABELS, LEVEL_LABELS } from '../../components/myclub/teamDisplay';
import { AttendanceRate, Chip, CoachPlayerRow, StatTile } from '../../components/coach/CoachPrimitives';
import { attendanceRateColor, getPlayerBadge } from '../../components/coach/coachDisplay';
import ProgressRing from '../../components/ui/ProgressRing';
import { formatCoachDate, getCoachScopedEvents, getEventTimestamp, isUpcoming } from '../../components/coach/coachUtils';
import { ATTENDANCE_PERIOD_LABEL, pooledAttendanceRate } from '../../utils/attendanceRate';
import { plural, pluralWord } from '../../utils/plural';
import { playerStatusLabel } from '../../utils/playerStatus';

/**
 * "Echipe" — the coach's squads, each card carrying the three things a coach
 * opens the screen for: how many players, what's next, and who is drifting on
 * attendance.
 */

/** Roster rows per card before the list turns into a "+N" summary. */
const ROSTER_PREVIEW = 5;

type TeamWithPlayers = Team & {
  players: Player[];
  nextEvent: CalendarEvent | null;
};

function TeamCard({ team, onPress }: { team: TeamWithPlayers; onPress: () => void }) {
  const chips = [
    team.level ? LEVEL_LABELS[team.level] : null,
    team.gender ? GENDER_LABELS[team.gender] : null,
    team.seasonName || null,
  ].filter(Boolean) as string[];

  // The players below 75%, lowest first: the reason to open a squad card is
  // who is slipping. It took the five lowest whatever their rate, so the list
  // „Prezența cea mai scăzută” showed players at 100%.
  const slipping = useMemo(
    () => team.players
      .filter((player) => player.attendanceRate != null && player.attendanceRate < 75)
      .sort((a, b) => (a.attendanceRate ?? 101) - (b.attendanceRate ?? 101)),
    [team.players],
  );
  const preview = slipping.slice(0, ROSTER_PREVIEW);
  const hidden = slipping.length - preview.length;
  const anyRated = team.players.some((player) => player.attendanceRate != null);

  // Last 30 days, pooled over the squad's marked sessions (utils/attendanceRate.ts).
  const average = pooledAttendanceRate(team.players);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Vezi echipa ${team.name}`}
      className="ui-lift ui-press relative overflow-hidden rounded-[16px] border p-4 gap-3.5 min-w-0 text-left w-full"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-3.5">
        <View
          className="w-11 h-11 rounded-[13px] border items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
        >
          <MaterialIcons name="shield" size={21} color="var(--c-muted)" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="f-display text-[17px] font-extrabold leading-tight" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.02em' } as any} numberOfLines={2}>{team.name}</Text>
          {team.leagueName ? (
            <Text className="t-meta mt-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{team.leagueName}</Text>
          ) : null}
        </View>
        <ProgressRing value={average} size={52} stroke={6} color={attendanceRateColor(average)} label={average == null ? 'Fără prezență marcată în ultimele 30 de zile' : `Prezență ${average}% în ultimele 30 de zile`}>
          <Text className="f-display t-num text-[12.5px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>{average == null ? '—' : `${average}%`}</Text>
        </ProgressRing>
      </View>

      {chips.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {chips.map((chip) => <Chip key={chip} label={chip} />)}
        </View>
      ) : null}

      <View className="flex-row gap-2 sm:gap-2.5">
        <StatTile icon="groups" tone="purple" label="Lot" value={team.players.length} hint={pluralWord(team.players.length, 'jucător', 'jucători')} />
        <StatTile
          icon="event"
          tone="brand"
          label="Urmează"
          value={team.nextEvent ? formatCoachDate(team.nextEvent.startTime) : '—'}
          hint={team.nextEvent ? team.nextEvent.title : 'nimic programat'}
        />
      </View>

      {team.players.length ? (
        <View className="gap-2">
          <Text className="t-label" style={{ color: 'var(--c-muted)' }}>Prezență sub 75%</Text>
          {preview.length ? (
            <DenseList label={`Jucători sub 75% în ${team.name}`}>
              {preview.map((player) => (
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
          ) : (
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
              {anyRated ? 'Toți jucătorii cu prezență marcată sunt peste 75%.' : 'Nicio prezență marcată în ultimele 30 de zile.'}
            </Text>
          )}
          {hidden > 0 ? (
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
              +{plural(hidden, 'alt jucător', 'alți jucători')} sub 75%
            </Text>
          ) : null}
        </View>
      ) : (
        <EmptyState icon="groups" compact title="Lot gol" message="Niciun jucător alocat acestei echipe încă." />
      )}
    </Pressable>
  );
}

function TeamsSkeleton() {
  return (
    <View className="grid grid-cols-1 xl:grid-cols-2 gap-3" accessibilityRole="progressbar" accessibilityLabel="Se încarcă echipele">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-[380px] w-full rounded-[16px]" />
      ))}
    </View>
  );
}

export default function CoachTeamsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [playersByTeam, setPlayersByTeam] = useState<Record<number, Player[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);

    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      // One roster request for every team a coach has, grouped by team name
      // client-side — matches dashboard.tsx's getRoster() pattern instead of
      // firing a getTeamPlayers() request per team (N+1).
      const [teamRows, eventRows, rosterRows] = await Promise.all([
        teamsApi.getTeams(),
        // Only "next session" is shown per team — no need for past events.
        eventsApi.getEvents({ start: since.toISOString() }),
        teamsApi.getRoster().catch(() => []),
      ]);
      const playersByTeamId: Record<number, Player[]> = {};
      teamRows.forEach((team) => {
        playersByTeamId[team.id] = rosterRows.filter(
          (player) => player.teamName === team.name || player.teamNames?.includes(team.name),
        );
      });

      setTeams(teamRows);
      setEvents(eventRows);
      setPlayersByTeam(playersByTeamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu s-au putut încărca echipele.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scopedEvents = useMemo(() => getCoachScopedEvents(events, session, teams), [events, session, teams]);
  const scopedTeamIds = useMemo(
    () => new Set(scopedEvents.map((event) => event.teamId).filter((id): id is number => id != null)),
    [scopedEvents],
  );
  const visibleTeams = useMemo<TeamWithPlayers[]>(() => {
    // The teams the coach manages, plus a team of a session they were assigned
    // to. With no session ahead this used to fall back to the whole club.
    const managed = coachManagedTeamIds(teams, session?.id);
    const baseTeams = teams.filter((team) => managed.has(team.id) || scopedTeamIds.has(team.id));

    return baseTeams.map((team) => {
      const nextEvent = scopedEvents
        .filter((event) => event.teamId === team.id && isUpcoming(event))
        .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b))[0] ?? null;

      return {
        ...team,
        players: playersByTeam[team.id] ?? [],
        nextEvent,
      };
    });
  }, [playersByTeam, scopedEvents, scopedTeamIds, session?.id, teams]);

  const totalPlayers = visibleTeams.reduce((sum, team) => sum + team.players.length, 0);
  const teamsAverage = pooledAttendanceRate(visibleTeams.flatMap((team) => team.players));

  const subtitle = visibleTeams.length
    ? `${plural(visibleTeams.length, 'echipă', 'echipe')} · ${session?.clubName ?? 'Clubul tău'}`
    : 'Loturile și activitatea lor viitoare.';

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHero
          eyebrow="Echipe"
          title="Echipele mele"
          subtitle={subtitle}
          actions={
            <Pressable
              onPress={() => loadData(true)}
              className="ui-press hidden sm:flex w-10 h-10 rounded-[11px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        >
          {!loading && !error && visibleTeams.length ? (
            <StatStrip className="grid-cols-3">
              <GlassStat dot="var(--c-brand-fg)" label="Echipe" value={visibleTeams.length} />
              <GlassStat dot="var(--c-purple)" label="Jucători" value={totalPlayers} />
              <GlassStat
                dot={teamsAverage == null ? 'var(--c-faint)' : attendanceRateColor(teamsAverage)}
                label="Prezență"
                hint={ATTENDANCE_PERIOD_LABEL.toLowerCase()}
                value={teamsAverage ?? '—'}
                suffix={teamsAverage == null ? undefined : '%'}
                bar={teamsAverage ?? undefined}
              />
            </StatStrip>
          ) : null}
        </PageHero>

        {loading ? (
          <TeamsSkeleton />
        ) : error ? (
          <ErrorState
            title="Nu am putut încărca echipele"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadData(true)}
          />
        ) : visibleTeams.length === 0 ? (
          <EmptyState
            icon="groups"
            title="Nicio echipă alocată"
            message="Când clubul îți atribuie o echipă, lotul și programul ei apar aici."
          />
        ) : (
          // Two columns only from xl: the cards carry a roster list, so at 1024px
          // a second column squeezed every player name to an ellipsis.
          <View className="grid grid-cols-1 xl:grid-cols-2 gap-3 ui-stagger">
            {visibleTeams.map((team) => (
              <TeamCard key={team.id} team={team} onPress={() => router.push(`/coach/team/${team.id}` as any)} />
            ))}
          </View>
        )}
      </PageContainer>
    </ScrollView>
  );
}
