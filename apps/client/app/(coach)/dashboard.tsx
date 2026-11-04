import { useCallback, useMemo, useRef, useState } from 'react';
import { useCachedState } from '../../hooks/useCachedState';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type RosterSummary, type Team } from '../../services/teamsApi';
import { coachManagedTeamIds } from '../../utils/coachEventScope';
import { ATTENDANCE_PERIOD_LABEL, formatAttendanceRate, pooledAttendanceRate } from '../../utils/attendanceRate';
import { useSession } from '../../context/AuthContext';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';
import PageHero, { GlassStat, StatStrip } from '../../components/admin/PageHero';
import { DenseList } from '../../components/ui/DenseList';
import PageContainer from '../../components/ui/PageContainer';
import SectionHeader from '../../components/ui/SectionHeader';
import ProgressRing from '../../components/ui/ProgressRing';
import TeamStandingsCard from '../../components/standings/TeamStandingsCard';
import { formatToday, getGreeting } from '../../components/ui/HeroBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { AttendanceRate, CoachPlayerRow, SessionRow } from '../../components/coach/CoachPrimitives';
import { attendanceRateColor } from '../../components/coach/coachDisplay';
import {
  getCoachScopedEvents,
  getEventTimestamp,
  isUpcoming,
} from '../../components/coach/coachUtils';
import { plural } from '../../utils/plural';

/**
 * "Panou antrenor" — a digest, not an archive: a greeting with the very next
 * session, four numbers, the week at a glance, the next few sessions and the
 * squad's attendance health. Everything deeper lives on /schedule and
 * /coach/attendance, which the hero actions link to.
 */

const WEEK_MS = 7 * 24 * 3600000;

/** Sessions shown on the panel before it starts competing with /schedule. */
const SESSION_LIMIT = 5;

/** Roster entries in the focus rail — a list, not a report. */
const FOCUS_LIMIT = 5;

function getFirstName(name?: string | null, firstName?: string | null) {
  return firstName?.trim() || name?.trim().split(/\s+/)[0] || 'antrenor';
}

/**
 * Squad attendance: average ring, traffic-light buckets, and the players below
 * 75% — the list used to take the five lowest whatever their rate, so
 * „Necesită atenție” listed players at 100%.
 */
function SquadHealth({ players, average }: { players: Player[]; average: number | null }) {
  const rated = players.filter((player) => player.attendanceRate != null);
  const buckets = [
    { label: 'Peste 75%', color: 'var(--c-success)', count: rated.filter((p) => (p.attendanceRate ?? 0) >= 75).length },
    { label: '50–74%', color: 'var(--c-warning)', count: rated.filter((p) => (p.attendanceRate ?? 0) >= 50 && (p.attendanceRate ?? 0) < 75).length },
    { label: 'Sub 50%', color: 'var(--c-danger)', count: rated.filter((p) => (p.attendanceRate ?? 0) < 50).length },
  ];
  const focus = rated
    .filter((player) => (player.attendanceRate ?? 100) < 75)
    .sort((a, b) => (a.attendanceRate ?? 100) - (b.attendanceRate ?? 100))
    .slice(0, FOCUS_LIMIT);

  return (
    <GlassCard className="ui-rise gap-3.5">
      <View>
        <Text accessibilityRole="header" className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Prezența lotului</Text>
        <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>Jucătorii tăi · {ATTENDANCE_PERIOD_LABEL.toLowerCase()}</Text>
      </View>

      {rated.length ? (
        <>
          <View className="flex-row items-center gap-4">
            <ProgressRing value={average} size={64} stroke={7} color={attendanceRateColor(average)} label={average == null ? 'Fără prezență marcată' : `Prezență ${average}%`}>
              <Text className="f-display t-num text-[16px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>{formatAttendanceRate(average)}</Text>
            </ProgressRing>
            <View className="flex-1 min-w-0 gap-1.5">
              {buckets.map((bucket) => (
                <View key={bucket.label} className="flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: bucket.color }} />
                  <Text className="text-[13px] font-medium flex-1" style={{ color: 'var(--c-ink-soft)' }}>{bucket.label}</Text>
                  <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{bucket.count}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="t-label" style={{ color: 'var(--c-muted)' }}>Sub 75%</Text>
            {focus.length ? (
              <DenseList label="Jucători sub 75%">
                {focus.map((player) => (
                  <CoachPlayerRow
                    key={player.id}
                    inList
                    firstName={player.firstName}
                    lastName={player.lastName}
                    meta={player.teamName || player.teamNames?.[0] || player.position || 'Jucător'}
                    trailing={<AttendanceRate rate={player.attendanceRate} />}
                  />
                ))}
              </DenseList>
            ) : (
              <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Toți jucătorii cu prezență marcată sunt peste 75%.</Text>
            )}
          </View>
        </>
      ) : (
        <EmptyState
          icon="fact-check"
          compact
          title="Nicio prezență marcată"
          message="Statistica apare după primele sesiuni marcate."
        />
      )}
    </GlassCard>
  );
}

function HomeSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă panoul">
      <Skeleton className="h-[150px] w-full rounded-[16px]" />
      <View className="flex-col xl:flex-row gap-4">
        <View className="flex-1 gap-2.5">
          <Skeleton className="h-[170px] w-full rounded-[16px]" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[64px] w-full rounded-[14px]" />
          ))}
        </View>
        <Skeleton className="w-full xl:w-[380px] h-[440px] rounded-[16px]" />
      </View>
    </View>
  );
}

export default function CoachDashboardScreen() {
  const router = useRouter();
  const { session } = useSession();
  // Remembered per account (hooks/useCachedState): a revisit paints last
  // time's panel at once; the load below refreshes it in the background.
  const [events, setEvents, eventsFromCache] = useCachedState<CalendarEvent[]>('coach-home.events', []);
  const [teams, setTeams] = useCachedState<Team[]>('coach-home.teams', []);
  const [players, setPlayers] = useCachedState<Player[]>('coach-home.players', []);
  const [summary, setSummary] = useCachedState<RosterSummary | null>('coach-home.summary', null);
  const [loading, setLoading] = useState(!eventsFromCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasData = useRef(eventsFromCache);
  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else if (!hasData.current) setLoading(true);
    setError(null);

    try {
      // Upcoming only (plus today): the panel never shows past sessions, and
      // this used to download the club's whole history.
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const [eventRows, teamRows, rosterRows, rosterSummary] = await Promise.all([
        eventsApi.getEvents({ start: since.toISOString() }),
        teamsApi.getTeams(),
        teamsApi.getRoster(),
        teamsApi.getRosterSummary().catch(() => null),
      ]);
      setEvents(eventRows);
      setTeams(teamRows);
      // The coach's roster also lists the club's unassigned players (so they
      // can be added to a team); the panel counts the coach's squads only.
      setPlayers(rosterRows.filter((player) => !player.isUnassigned));
      setSummary(rosterSummary);
      hasData.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu s-a putut încărca panoul antrenorului.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setEvents, setTeams, setPlayers, setSummary]);

  // Refetches on mount AND when the app/tab resumes after a while in the
  // background, instead of leaving a stale or failed load on screen.
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const scopedEvents = useMemo(() => getCoachScopedEvents(events, session, teams), [events, session, teams]);
  const upcomingEvents = useMemo(
    () => scopedEvents.filter(isUpcoming).sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [scopedEvents],
  );
  const nextEvents = upcomingEvents.slice(0, SESSION_LIMIT);
  const thisWeekEvents = upcomingEvents.filter((event) => getEventTimestamp(event) - Date.now() <= WEEK_MS);
  const thisWeekMatches = thisWeekEvents.filter((event) => event.type === 'match').length;

  const teamIds = new Set(scopedEvents.map((event) => event.teamId).filter((id): id is number => id != null));
  // The teams the coach manages (server: the same rule as Program/Prezență);
  // it used to fall back to every team of the club.
  const managedTeamIds = useMemo(() => coachManagedTeamIds(teams, session?.id), [teams, session?.id]);
  const visibleTeamsCount = summary?.teamCount ?? managedTeamIds.size;
  // Standings: the coach's teams, plus a team of a single session they were
  // assigned to — never the whole club.
  const teamIdKey = [...teamIds].sort((a, b) => a - b).join(',');
  const coachTeams = useMemo(() => {
    const ids = new Set(teamIdKey ? teamIdKey.split(',').map(Number) : []);
    return teams.filter((team) => managedTeamIds.has(team.id) || ids.has(team.id));
  }, [teams, teamIdKey, managedTeamIds]);

  // One rate everywhere (utils/attendanceRate.ts): last 30 days, pooled.
  const averageAttendance = summary ? summary.attendance?.rate ?? summary.averageAttendance ?? null : pooledAttendanceRate(players);
  const playerCount = summary?.athleteCount ?? players.length;

  // push, not replace: the browser/phone back button should return to the panel.
  const goToAttendance = () => router.push('/coach/attendance' as any);
  const goToSchedule = () => router.push('/schedule' as any);

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
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
            {/* One way to each place: the hero chips, the next-session card and
                the week strip repeated what the list below says. */}
            <PageHero
              className=""
              eyebrow={formatToday()}
              title={`${getGreeting()}, ${getFirstName(session?.name, session?.firstName)}`}
              // The scope changes what every number below counts, so it is
              // stated up front.
              subtitle={`Sesiunile echipelor tale · ${session?.clubName ?? 'Club'}`}
              actions={
                <>
                  <Button variant="primary" icon="fact-check" label="Marchează prezența" onPress={goToAttendance} />
                  <Pressable
                    onPress={() => loadData(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Reîmprospătează"
                    className="ui-press hidden sm:flex h-10 w-10 rounded-[11px] border items-center justify-center"
                    style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
                  >
                    {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={18} color="var(--c-ink-soft)" />}
                  </Pressable>
                </>
              }
            >
              <StatStrip className="grid-cols-2 lg:grid-cols-4">
                <GlassStat dot="var(--c-brand-fg)" label="Sesiuni în 7 zile" value={thisWeekEvents.length} />
                <GlassStat dot="var(--c-sky-fg)" label="Meciuri în 7 zile" value={thisWeekMatches} />
                <GlassStat dot="var(--c-purple)" label="Jucători" value={playerCount} hint={`în ${plural(visibleTeamsCount, 'echipă', 'echipe')}`} />
                <GlassStat
                  dot={averageAttendance == null ? 'var(--c-faint)' : averageAttendance >= 75 ? 'var(--c-success)' : averageAttendance >= 50 ? 'var(--c-warning)' : 'var(--c-danger)'}
                  label="Prezență"
                  hint={ATTENDANCE_PERIOD_LABEL.toLowerCase()}
                  value={averageAttendance ?? '—'}
                  suffix={averageAttendance == null ? undefined : '%'}
                  bar={averageAttendance ?? undefined}
                />
              </StatStrip>
            </PageHero>

            <View className="flex-col xl:flex-row gap-4">
              <View className="flex-1 min-w-0 gap-4">
                <View>
                  <SectionHeader
                    title="Sesiuni următoare"
                    subtitle={thisWeekEvents.length ? `${plural(thisWeekEvents.length, 'sesiune', 'sesiuni')} în următoarele 7 zile` : 'Nimic în următoarele 7 zile'}
                    trailing={<Button icon="calendar-today" label="Tot programul" onPress={goToSchedule} className="self-start" />}
                  />

                  {nextEvents.length ? (
                    <DenseList label="Sesiuni următoare">
                      {nextEvents.map((event) => <SessionRow key={event.id} inList event={event} />)}
                    </DenseList>
                  ) : (
                    <EmptyState
                      icon="event-busy"
                      compact
                      title="Nicio sesiune viitoare"
                      message="Antrenamentele și meciurile programate apar aici."
                    />
                  )}
                </View>
              </View>

              {/* Fixed rail from xl up, full width below — at 1280px a shared
                  row keeps both lists above the fold. */}
              <View className="w-full xl:w-[380px] shrink-0 gap-4">
                <SquadHealth players={players} average={averageAttendance} />
                <TeamStandingsCard teams={coachTeams} onOpenTeam={(id) => router.push(`/coach/team/${id}` as any)} />
              </View>
            </View>
          </View>
        )}
      </PageContainer>
    </ScrollView>
  );
}
