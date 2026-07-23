import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useFirebaseAuth } from '../../context/AuthContext';
import { formatCoachDate, getCoachScopedEvents, getEventTimestamp, isUpcoming } from './coachUtils';

type TeamWithPlayers = Team & {
  players: Player[];
  nextEvent: CalendarEvent | null;
};

function PlayerRow({ player }: { player: Player }) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-[#F8FBFF] px-4 py-3">
      <View className="h-10 w-10 rounded-xl bg-white border border-[#E2EAF4] items-center justify-center">
        <Text className="text-[#0A2C93] font-black">{player.number ?? `${player.firstName?.[0] ?? 'P'}${player.lastName?.[0] ?? ''}`}</Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[#0E2041] font-black" numberOfLines={1}>{player.firstName} {player.lastName}</Text>
        <Text className="text-[#64748B] text-xs font-semibold mt-1">{player.status ?? 'active'}</Text>
      </View>
      <Text className="text-[#64748B] text-xs font-black">{player.attendanceRate == null ? '—' : `${player.attendanceRate}%`}</Text>
    </View>
  );
}

function TeamCard({ team }: { team: TeamWithPlayers }) {
  return (
    <View className="flex-1 min-w-[300px] rounded-[30px] border border-[#E3ECF6] bg-white p-6">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[#006092] text-[10px] font-black uppercase tracking-widest">{team.leagueName || 'Team'}</Text>
          <Text className="mt-3 text-[#050817] text-2xl font-black" numberOfLines={2}>{team.name}</Text>
          <Text className="mt-2 text-[#64748B] font-semibold" numberOfLines={1}>{team.seasonName || 'Current season'}</Text>
        </View>
        <View className="h-14 w-14 rounded-2xl bg-[#EBF4FF] items-center justify-center">
          <MaterialIcons name="groups" size={26} color="var(--c-brand-fg)" />
        </View>
      </View>

      <View className="mt-6 flex-row gap-3">
        <View className="flex-1 rounded-2xl bg-[#F0F6FC] p-4">
          <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest">Players</Text>
          <Text className="mt-2 text-[#0E2041] text-2xl font-black">{team.players.length}</Text>
        </View>
        <View className="flex-1 rounded-2xl bg-[#F0F6FC] p-4">
          <Text className="text-[#64748B] text-[10px] font-black uppercase tracking-widest">Next</Text>
          <Text className="mt-2 text-[#0E2041] text-base font-black" numberOfLines={1}>
            {team.nextEvent ? formatCoachDate(team.nextEvent.startTime) : 'None'}
          </Text>
        </View>
      </View>

      <View className="mt-6 gap-3">
        {team.players.slice(0, 5).map((player) => <PlayerRow key={player.id} player={player} />)}
        {!team.players.length ? (
          <View className="rounded-2xl bg-[#F8FBFF] px-4 py-8 items-center">
            <Text className="text-[#64748B] font-bold text-center">No players linked to this team yet.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function CoachTeams() {
  const { session } = useFirebaseAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [playersByTeam, setPlayersByTeam] = useState<Record<number, Player[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

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
      setError(err instanceof Error ? err.message : 'Could not load coach teams.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scopedEvents = useMemo(() => getCoachScopedEvents(events, session), [events, session]);
  const scopedTeamIds = new Set(scopedEvents.map((event) => event.teamId).filter((id): id is number => id != null));
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

  return (
    <ScrollView className="flex-1 bg-[#F1F5F9]" contentContainerClassName="px-5 md:px-10 py-8 pb-20">
      <View className="w-full max-w-7xl mx-auto">
        <View className="flex-row items-start justify-between gap-4 mb-8">
          <View className="flex-1">
            <Text className="text-[#0E2041] text-4xl md:text-5xl font-black tracking-tight">Teams</Text>
            <Text className="text-[#64748B] text-base md:text-lg font-semibold mt-3">Roster snapshots and upcoming team work.</Text>
          </View>

          <Pressable onPress={() => loadData(true)} className="h-12 w-12 rounded-full bg-white border border-[#E3ECF6] items-center justify-center">
            {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={22} color="var(--c-brand-fg)" />}
          </Pressable>
        </View>

        {error ? (
          <View className="mb-6 rounded-[24px] border border-red-100 bg-white px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="error-outline" size={22} color="var(--c-danger)" />
            <Text className="flex-1 text-red-600 font-bold">{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View className="py-16 items-center justify-center">
            <ActivityIndicator size="large" color="var(--c-brand-fg)" />
          </View>
        ) : visibleTeams.length ? (
          <View className="flex-row flex-wrap gap-6">
            {visibleTeams.map((team) => <TeamCard key={team.id} team={team} />)}
          </View>
        ) : (
          <View className="rounded-[30px] border border-[#E3ECF6] bg-white px-6 py-12 items-center">
            <MaterialIcons name="groups" size={34} color="var(--c-faint)" />
            <Text className="text-[#64748B] font-bold text-center mt-3">No teams available for this coach account.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
