import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { GENDER_LABELS, LEVEL_LABELS } from '../../components/myclub/teamDisplay';
import { AttendanceRate, Chip, CoachPlayerRow, StatTile } from '../../components/coach/CoachPrimitives';
import { getPlayerBadge } from '../../components/coach/coachDisplay';
import { formatCoachDate, getCoachScopedEvents, getEventTimestamp, isUpcoming } from '../../components/coach/coachUtils';

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

function TeamCard({ team }: { team: TeamWithPlayers }) {
  const chips = [
    team.level ? LEVEL_LABELS[team.level] : null,
    team.gender ? GENDER_LABELS[team.gender] : null,
    team.seasonName || null,
  ].filter(Boolean) as string[];

  // Lowest attendance first: the reason to open a squad card is the players who
  // are slipping, not an alphabetical roster.
  const preview = useMemo(
    () => [...team.players]
      .sort((a, b) => (a.attendanceRate ?? 101) - (b.attendanceRate ?? 101))
      .slice(0, ROSTER_PREVIEW),
    [team.players],
  );
  const hidden = team.players.length - preview.length;

  return (
    <View
      className="rounded-[16px] border p-5 gap-4 min-w-0"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-start gap-3">
        <View className="w-11 h-11 rounded-[13px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name="shield" size={21} color="var(--c-brand-fg)" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[17px] font-bold leading-tight" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{team.name}</Text>
          {team.leagueName ? (
            <Text className="text-[12.5px] font-medium mt-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{team.leagueName}</Text>
          ) : null}
        </View>
      </View>

      {chips.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {chips.map((chip) => <Chip key={chip} label={chip} />)}
        </View>
      ) : null}

      <View className="flex-row gap-2 sm:gap-2.5">
        <StatTile label="Lot" value={team.players.length} hint={team.players.length === 1 ? 'jucător' : 'jucători'} />
        <StatTile
          label="Urmează"
          value={team.nextEvent ? formatCoachDate(team.nextEvent.startTime) : '—'}
          hint={team.nextEvent ? team.nextEvent.title : 'nimic programat'}
        />
      </View>

      {team.players.length ? (
        <View className="gap-2.5">
          <Text className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-faint)' }}>
            Prezența cea mai scăzută
          </Text>
          {preview.map((player) => (
            <CoachPlayerRow
              key={player.id}
              firstName={player.firstName}
              lastName={player.lastName}
              badge={getPlayerBadge(player)}
              meta={player.position || player.status || 'Jucător'}
              trailing={<AttendanceRate rate={player.attendanceRate} />}
            />
          ))}
          {hidden > 0 ? (
            <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>
              +{hidden} {hidden === 1 ? 'alt jucător' : 'alți jucători'} în lot
            </Text>
          ) : null}
        </View>
      ) : (
        <EmptyState icon="groups" compact title="Lot gol" message="Niciun jucător alocat acestei echipe încă." />
      )}
    </View>
  );
}

function TeamsSkeleton() {
  return (
    <View className="grid grid-cols-1 xl:grid-cols-2 gap-3" accessibilityRole="progressbar" accessibilityLabel="Se încarcă echipele">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-[420px] w-full rounded-[16px]" />
      ))}
    </View>
  );
}

export default function CoachTeamsScreen() {
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
      const [teamRows, eventRows] = await Promise.all([
        teamsApi.getTeams(),
        eventsApi.getEvents(),
      ]);
      const playerPairs = await Promise.all(
        teamRows.map(async (team) => [team.id, await teamsApi.getTeamPlayers(team.id).catch(() => [])] as const),
      );

      setTeams(teamRows);
      setEvents(eventRows);
      setPlayersByTeam(Object.fromEntries(playerPairs));
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

  const scopedEvents = useMemo(() => getCoachScopedEvents(events, session), [events, session]);
  const scopedTeamIds = useMemo(
    () => new Set(scopedEvents.map((event) => event.teamId).filter((id): id is number => id != null)),
    [scopedEvents],
  );
  const visibleTeams = useMemo<TeamWithPlayers[]>(() => {
    const baseTeams = scopedTeamIds.size ? teams.filter((team) => scopedTeamIds.has(team.id)) : teams;

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
  }, [playersByTeam, scopedEvents, scopedTeamIds, teams]);

  const subtitle = visibleTeams.length
    ? `${visibleTeams.length} ${visibleTeams.length === 1 ? 'echipă' : 'echipe'} · ${session?.clubName ?? 'Clubul tău'}`
    : 'Loturile și activitatea lor viitoare.';

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHeader
          title="Echipe"
          subtitle={subtitle}
          actions={
            <Pressable
              onPress={() => loadData(true)}
              className="w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

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
          <View className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {visibleTeams.map((team) => <TeamCard key={team.id} team={team} />)}
          </View>
        )}
      </PageContainer>
    </ScrollView>
  );
}
