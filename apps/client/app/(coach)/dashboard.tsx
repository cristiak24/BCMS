import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';
import PageHero, { GlassStat } from '../../components/admin/PageHero';
import PageContainer from '../../components/ui/PageContainer';
import SectionHeader from '../../components/ui/SectionHeader';
import ProgressRing from '../../components/ui/ProgressRing';
import TeamStandingsCard from '../../components/standings/TeamStandingsCard';
import { formatToday, getGreeting } from '../../components/ui/HeroBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { AttendanceRate, Chip, CoachPlayerRow, SessionRow } from '../../components/coach/CoachPrimitives';
import { attendanceRateColor, eventTypeMeta, formatRelativeDay } from '../../components/coach/coachDisplay';
import {
  formatCoachTimeRange,
  getCoachScopeLabel,
  getCoachScopedEvents,
  getEventDate,
  getEventTimestamp,
  isUpcoming,
} from '../../components/coach/coachUtils';

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

/** "în 2 zile" / "în 5 h" / "în 40 min" / "acum". */
function formatCountdown(value: string, now = Date.now()) {
  const date = getEventDate(value);
  if (!date) return '';
  const diff = date.getTime() - now;
  if (diff <= 0) return 'acum';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `în ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `în ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'în 1 zi' : `în ${days} zile`;
}

/** Glass tile inside the hero: what's next and when. */
function NextSessionPanel({ event, onPress }: { event: CalendarEvent | null; onPress: () => void }) {
  const panel = { boxShadow: 'var(--e-md)' } as any;
  if (!event) {
    return (
      <View className="glass rounded-[14px] px-4 py-3.5 lg:w-[320px]" style={panel}>
        <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>Următoarea sesiune</Text>
        <Text className="text-[14px] font-medium mt-2" style={{ color: 'var(--c-ink-soft)' }}>Nimic programat încă.</Text>
      </View>
    );
  }

  const meta = eventTypeMeta(event.type);
  const relative = formatRelativeDay(event.startTime);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Următoarea sesiune: ${event.title}`}
      className="glass ui-press ui-lift relative overflow-hidden rounded-[14px] pl-4 pr-3.5 py-3 lg:w-[320px] text-left"
      style={panel}
    >
      <View pointerEvents="none" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: meta.fg }} />
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View className="ui-ping w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--c-success)' }} />
          <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>Următoarea sesiune</Text>
        </View>
        <Text className="t-num text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{formatCountdown(event.startTime)}</Text>
      </View>
      <Text className="f-display text-[16px] font-bold mt-1.5 leading-snug" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
        {event.title}
      </Text>
      <View className="flex-row items-center gap-1.5 mt-1">
        <MaterialIcons name="schedule" size={13} color="var(--c-faint)" />
        <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
          {[relative, formatCoachTimeRange(event.startTime, event.endTime)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5 mt-0.5">
        <MaterialIcons name={meta.icon} size={13} color={meta.fg} />
        <Text className="t-meta flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
          {[meta.label, event.teamName, event.location].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The next seven days as columns, one dot per session in the type's accent —
 * answers "how loaded is my week" without reading a list.
 */
function WeekStrip({ events }: { events: CalendarEvent[] }) {
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today.getTime() + index * 86400000);
      const next = day.getTime() + 86400000;
      const dayEvents = events.filter((event) => {
        const time = getEventTimestamp(event);
        return time >= day.getTime() && time < next;
      });
      return {
        key: day.toISOString(),
        weekday: new Intl.DateTimeFormat('ro-RO', { weekday: 'short' }).format(day).replace('.', ''),
        date: day.getDate(),
        isToday: index === 0,
        events: dayEvents,
      };
    });
  }, [events]);

  const total = days.reduce((sum, day) => sum + day.events.length, 0);

  return (
    <GlassCard className="ui-rise gap-3.5">
      <View className="flex-row items-center justify-between gap-3">
        <View>
          <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Săptămâna ta</Text>
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
            {total === 0 ? 'Nicio sesiune în următoarele 7 zile' : `${total} ${total === 1 ? 'sesiune' : 'sesiuni'} în următoarele 7 zile`}
          </Text>
        </View>
        <View className="w-9 h-9 rounded-[10px] items-center justify-center" style={{ backgroundColor: 'var(--c-sky-bg)' }}>
          <MaterialIcons name="date-range" size={18} color="var(--c-sky-fg)" />
        </View>
      </View>

      <View className="grid grid-cols-7 gap-1.5 sm:gap-2 ui-stagger">
        {days.map((day) => (
          <View
            key={day.key}
            className="items-center rounded-[12px] border py-2 gap-1"
            style={{
              backgroundColor: day.isToday ? 'var(--c-brand-surface)' : day.events.length ? 'var(--c-surface-2)' : 'transparent',
              borderColor: day.isToday ? 'var(--c-brand-surface)' : 'var(--c-border-soft)',
            } as any}
            accessibilityLabel={`${day.weekday} ${day.date}: ${day.events.length} sesiuni`}
          >
            <Text className="text-[11px] font-semibold capitalize" style={{ color: day.isToday ? 'var(--c-on-brand)' : 'var(--c-muted)' }}>
              {day.weekday}
            </Text>
            <Text className="f-display t-num text-[16px] font-extrabold leading-none" style={{ color: day.isToday ? 'var(--c-on-brand)' : 'var(--c-ink)' }}>
              {day.date}
            </Text>
            <View className="flex-row gap-1 h-1.5 items-center">
              {day.events.slice(0, 3).map((event) => (
                <View
                  key={event.id}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: day.isToday ? 'var(--c-on-brand)' : eventTypeMeta(event.type).fg }}
                />
              ))}
            </View>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
        {(['training', 'match', 'camp'] as const).map((type) => {
          const meta = eventTypeMeta(type);
          return (
            <View key={type} className="flex-row items-center gap-1.5">
              <View className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.fg }} />
              <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>{meta.label}</Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

/** Squad attendance: average ring, traffic-light buckets, and who needs a look. */
function SquadHealth({ players, onManage }: { players: Player[]; onManage: () => void }) {
  const rated = players.filter((player) => player.attendanceRate != null);
  const average = rated.length
    ? Math.round(rated.reduce((sum, player) => sum + (player.attendanceRate ?? 0), 0) / rated.length)
    : null;
  const buckets = [
    { label: 'Peste 75%', color: 'var(--c-success)', count: rated.filter((p) => (p.attendanceRate ?? 0) >= 75).length },
    { label: '50–74%', color: 'var(--c-warning)', count: rated.filter((p) => (p.attendanceRate ?? 0) >= 50 && (p.attendanceRate ?? 0) < 75).length },
    { label: 'Sub 50%', color: 'var(--c-danger)', count: rated.filter((p) => (p.attendanceRate ?? 0) < 50).length },
  ];
  const focus = [...rated]
    .sort((a, b) => (a.attendanceRate ?? 100) - (b.attendanceRate ?? 100))
    .slice(0, FOCUS_LIMIT);

  return (
    <GlassCard className="ui-rise gap-3.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Sănătate lot</Text>
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>Prezența recentă a jucătorilor tăi</Text>
        </View>
        <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name="monitor-heart" size={18} color="var(--c-brand-fg)" />
        </View>
      </View>

      {rated.length ? (
        <>
          <View className="flex-row items-center gap-4 rounded-[12px] border p-3" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
            <ProgressRing value={average} size={68} stroke={7} color={attendanceRateColor(average)} label={`Prezență medie ${average}%`}>
              <Text className="f-display t-num text-[17px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>{average}%</Text>
            </ProgressRing>
            <View className="flex-1 min-w-0 gap-1.5">
              {buckets.map((bucket) => (
                <View key={bucket.label} className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bucket.color }} />
                  <Text className="text-[13px] font-medium flex-1" style={{ color: 'var(--c-ink-soft)' }}>{bucket.label}</Text>
                  <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{bucket.count}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Necesită atenție</Text>
            <View className="gap-2 ui-stagger">
              {focus.map((player) => (
                <CoachPlayerRow
                  key={player.id}
                  firstName={player.firstName}
                  lastName={player.lastName}
                  meta={player.teamName || player.teamNames?.[0] || player.position || 'Jucător'}
                  rate={player.attendanceRate ?? null}
                  trailing={<AttendanceRate rate={player.attendanceRate} />}
                />
              ))}
            </View>
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

      <Button variant="primary" icon="fact-check" label="Gestionează prezența" onPress={onManage} />
    </GlassCard>
  );
}

function HomeSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă panoul">
      <Skeleton className="h-[230px] w-full rounded-[16px]" />
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
      // Upcoming only (plus today): the panel never shows past sessions, and
      // this used to download the club's whole history.
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const [eventRows, teamRows, rosterRows] = await Promise.all([
        eventsApi.getEvents({ start: since.toISOString() }),
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

  // Refetches on mount AND when the app/tab resumes after a while in the
  // background, instead of leaving a stale or failed load on screen.
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const scopedEvents = useMemo(() => getCoachScopedEvents(events, session), [events, session]);
  const upcomingEvents = useMemo(
    () => scopedEvents.filter(isUpcoming).sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [scopedEvents],
  );
  const nextEvents = upcomingEvents.slice(0, SESSION_LIMIT);
  const nextEvent = upcomingEvents[0] ?? null;
  const thisWeekEvents = upcomingEvents.filter((event) => getEventTimestamp(event) - Date.now() <= WEEK_MS);
  const thisWeekMatches = thisWeekEvents.filter((event) => event.type === 'match').length;

  const teamIds = new Set(scopedEvents.map((event) => event.teamId).filter((id): id is number => id != null));
  const visibleTeamsCount = teamIds.size || teams.length;
  // Same scope as /coach/teams: the teams of the coach's sessions, else all.
  const teamIdKey = [...teamIds].sort((a, b) => a - b).join(',');
  const coachTeams = useMemo(() => {
    const ids = new Set(teamIdKey ? teamIdKey.split(',').map(Number) : []);
    return ids.size ? teams.filter((team) => ids.has(team.id)) : teams;
  }, [teams, teamIdKey]);

  const ratedPlayers = players.filter((player) => player.attendanceRate != null);
  const averageAttendance = ratedPlayers.length
    ? Math.round(ratedPlayers.reduce((sum, player) => sum + (player.attendanceRate ?? 0), 0) / ratedPlayers.length)
    : null;

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
            <PageHero
              className=""
              eyebrow={formatToday()}
              title={`${getGreeting()}, ${getFirstName(session?.name, session?.firstName)}`}
              // The scope ("assigned sessions" vs "the club's sessions") changes
              // what every number below counts, so it is stated up front.
              subtitle={`${getCoachScopeLabel(events, session)} · ${session?.clubName ?? 'Club'}`}
              actions={
                <>
                  <Button variant="primary" icon="fact-check" label="Marchează prezența" onPress={goToAttendance} />
                  {/* Schedule is already a bottom-nav tab on phones; hiding it there
                      keeps the hero actions on one line at 375px. */}
                  <Button icon="calendar-today" label="Program" onPress={goToSchedule} className="hidden sm:flex" />
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
              <View className="flex-row flex-wrap gap-1.5">
                <Chip icon="event" label={`${thisWeekEvents.length} ${thisWeekEvents.length === 1 ? 'sesiune' : 'sesiuni'} săptămâna asta`} />
                {thisWeekMatches ? <Chip icon="sports-basketball" label={`${thisWeekMatches} ${thisWeekMatches === 1 ? 'meci' : 'meciuri'}`} /> : null}
                <Chip icon="groups" label={`${visibleTeamsCount} ${visibleTeamsCount === 1 ? 'echipă' : 'echipe'}`} />
              </View>

              {/* Two columns at 375px rather than four: four tiles across a phone
                  left ~80px each and ellipsised every label. */}
              <View className="flex-col lg:flex-row gap-2.5">
                <NextSessionPanel event={nextEvent} onPress={goToAttendance} />
                <View className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-1 min-w-0 ui-stagger">
                  <GlassStat dot="var(--c-brand-fg)" label="Sesiuni" value={upcomingEvents.length} hint="programate" />
                  <GlassStat dot="var(--c-sky-fg)" label="7 zile" value={thisWeekEvents.length} hint="săptămâna asta" />
                  <GlassStat dot="var(--c-purple)" label="Jucători" value={players.length} hint={`în ${visibleTeamsCount} ${visibleTeamsCount === 1 ? 'echipă' : 'echipe'}`} />
                  <GlassStat
                    dot={averageAttendance == null ? 'var(--c-faint)' : averageAttendance >= 75 ? 'var(--c-success)' : averageAttendance >= 50 ? 'var(--c-warning)' : 'var(--c-danger)'}
                    label="Prezență"
                    value={averageAttendance ?? '—'}
                    suffix={averageAttendance == null ? undefined : '%'}
                    bar={averageAttendance ?? undefined}
                  />
                </View>
              </View>
            </PageHero>

            <View className="flex-col xl:flex-row gap-4">
              <View className="flex-1 min-w-0 gap-4">
                <WeekStrip events={upcomingEvents} />

                <View>
                  <SectionHeader
                    title="Sesiuni următoare"
                    subtitle="Antrenamente, meciuri și cantonamente care îți cer atenția."
                    actionLabel="Vezi programul"
                    onAction={goToSchedule}
                  />

                  {nextEvents.length ? (
                    <View className="gap-2.5 ui-stagger">
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
              </View>

              {/* Fixed rail from xl up, full width below — at 1280px a shared
                  row keeps both lists above the fold. */}
              <View className="w-full xl:w-[380px] shrink-0 gap-4">
                <SquadHealth players={players} onManage={goToAttendance} />
                <TeamStandingsCard teams={coachTeams} onOpenTeam={(id) => router.push(`/coach/team/${id}` as any)} />
              </View>
            </View>
          </View>
        )}
      </PageContainer>
    </ScrollView>
  );
}
