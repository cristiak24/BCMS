import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import GlassCard from '../../components/ui/GlassCard';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import SectionHeader from '../../components/ui/SectionHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { AttendanceRate, CoachPlayerRow, SessionRow, StatTile } from '../../components/coach/CoachPrimitives';
import { getCoachScopeLabel, getCoachScopedEvents, getEventTimestamp, isUpcoming } from '../../components/coach/coachUtils';

/**
 * "Panou antrenor" — a digest, not an archive: four numbers, the next few
 * sessions and the players whose attendance needs a look. Everything deeper
 * lives on /schedule and /attendance, which the two actions link to.
 */

const WEEK_MS = 7 * 24 * 3600000;

/** Sessions shown on the panel before it starts competing with /schedule. */
const SESSION_LIMIT = 4;

/** Roster entries in the focus rail — a list, not a report. */
const FOCUS_LIMIT = 5;

function HomeSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă panoul">
      <View className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[86px] w-full rounded-[14px]" />
        ))}
      </View>
      <View className="flex-col xl:flex-row gap-4">
        <View className="flex-1 gap-2.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[68px] w-full rounded-[14px]" />
          ))}
        </View>
        <Skeleton className="w-full xl:w-[360px] h-[300px] rounded-[16px]" />
      </View>
    </View>
  );
}

export default function CoachDashboardScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);

    try {
      const [eventRows, teamRows, rosterRows] = await Promise.all([
        eventsApi.getEvents(),
        teamsApi.getTeams(),
        teamsApi.getRoster().catch(() => []),
      ]);
      setEvents(eventRows);
      setTeams(teamRows);
      setPlayers(rosterRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu s-a putut încărca panoul antrenorului.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scopedEvents = useMemo(() => getCoachScopedEvents(events, session), [events, session]);
  const upcomingEvents = useMemo(
    () => scopedEvents.filter(isUpcoming).sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [scopedEvents],
  );
  const nextEvents = upcomingEvents.slice(0, SESSION_LIMIT);
  const thisWeekCount = upcomingEvents.filter((event) => getEventTimestamp(event) - Date.now() <= WEEK_MS).length;

  const teamIds = new Set(scopedEvents.map((event) => event.teamId).filter((id): id is number => id != null));
  const visibleTeamsCount = teamIds.size || teams.length;

  const lowAttendancePlayers = useMemo(
    () => players
      .filter((player) => player.attendanceRate != null)
      .sort((a, b) => (a.attendanceRate ?? 100) - (b.attendanceRate ?? 100))
      .slice(0, FOCUS_LIMIT),
    [players],
  );

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHeader
          title="Panou antrenor"
          // The scope ("assigned sessions" vs "the club's sessions") changes what
          // every number below counts, so it belongs in the subtitle rather than
          // in a separate eyebrow line under the header.
          subtitle={`${getCoachScopeLabel(events, session)} · ${session?.clubName ?? 'Club'}`}
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
          <HomeSkeleton />
        ) : error ? (
          <ErrorState
            title="Nu am putut încărca panoul"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadData(true)}
          />
        ) : (
          <View className="gap-4">
            {/* Two columns at 375px rather than four: four tiles across a phone
                left ~80px each and ellipsised every label. */}
            <View className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <StatTile icon="event-available" label="Sesiuni" value={upcomingEvents.length} hint="viitoare" />
              <StatTile icon="date-range" label="7 zile" value={thisWeekCount} hint="săptămâna asta" />
              <StatTile icon="groups" label="Echipe" value={visibleTeamsCount} hint="active" />
              <StatTile icon="sports-basketball" label="Jucători" value={players.length} hint="în lot" />
            </View>

            <View className="flex-col xl:flex-row gap-4">
              <View className="flex-1 min-w-0">
                <SectionHeader
                  title="Sesiuni următoare"
                  subtitle="Antrenamente, meciuri și cantonamente care îți cer atenția."
                  actionLabel="Program"
                  onAction={() => router.replace('/schedule' as any)}
                />

                {nextEvents.length ? (
                  <View className="gap-2.5">
                    {nextEvents.map((event) => <SessionRow key={event.id} event={event} />)}
                  </View>
                ) : (
                  <EmptyState
                    icon="event-busy"
                    compact
                    title="Nicio sesiune viitoare"
                    message="Antrenamentele și meciurile programate apar aici."
                  />
                )}
              </View>

              {/* Fixed rail from xl up, full width below — at 1280px a shared
                  row keeps both lists above the fold. */}
              <View className="w-full xl:w-[360px] shrink-0">
                <GlassCard className="gap-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 min-w-0">
                      <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Focus lot</Text>
                      <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }}>
                        Cea mai scăzută prezență recentă
                      </Text>
                    </View>
                    <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                      <MaterialIcons name="monitor-heart" size={18} color="var(--c-brand-fg)" />
                    </View>
                  </View>

                  {lowAttendancePlayers.length ? (
                    <View className="gap-2.5">
                      {lowAttendancePlayers.map((player) => (
                        <CoachPlayerRow
                          key={player.id}
                          firstName={player.firstName}
                          lastName={player.lastName}
                          meta={player.teamName || player.teamNames?.[0] || player.position || 'Jucător'}
                          trailing={<AttendanceRate rate={player.attendanceRate} />}
                        />
                      ))}
                    </View>
                  ) : (
                    <EmptyState
                      icon="fact-check"
                      compact
                      title="Nicio prezență marcată"
                      message="Focusul apare după primele sesiuni marcate."
                    />
                  )}

                  <Pressable
                    onPress={() => router.replace('/coach/attendance' as any)}
                    accessibilityRole="button"
                    accessibilityLabel="Gestionează prezența"
                    className="h-11 rounded-[12px] px-4 flex-row items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--c-brand-surface)' }}
                  >
                    <MaterialIcons name="fact-check" size={17} color="var(--c-on-brand)" />
                    <Text className="text-[13px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Gestionează prezența</Text>
                  </Pressable>
                </GlassCard>
              </View>
            </View>
          </View>
        )}
      </PageContainer>
    </ScrollView>
  );
}
