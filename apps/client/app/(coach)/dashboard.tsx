import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { teamsApi, type Player, type Team } from '../../services/teamsApi';
import { useSession } from '../../context/AuthContext';
import GlassCard from '../../components/ui/GlassCard';
import PageContainer from '../../components/ui/PageContainer';
import SectionHeader from '../../components/ui/SectionHeader';
import StatCard from '../../components/ui/StatCard';
import ProgressRing from '../../components/ui/ProgressRing';
import HeroBanner, { formatToday, getGreeting, HeroButton, HeroChip } from '../../components/ui/HeroBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { AttendanceRate, CoachPlayerRow, SessionRow } from '../../components/coach/CoachPrimitives';
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

/** Glass card inside the hero: what's next and when. */
function NextSessionPanel({ event, onPress }: { event: CalendarEvent | null; onPress: () => void }) {
  if (!event) {
    return (
      <View
        className="rounded-[16px] border px-4 py-4"
        style={{ backgroundColor: 'var(--c-hero-chip)', borderColor: 'var(--c-hero-chip-border)' } as any}
      >
        <Text className="t-eyebrow" style={{ color: 'var(--c-hero-muted)' }}>Următoarea sesiune</Text>
        <Text className="text-[15px] font-semibold mt-2" style={{ color: 'var(--c-hero-fg)' }}>Nimic programat încă.</Text>
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
      className="ui-press rounded-[16px] border px-4 py-4 md:min-w-[280px] text-left"
      style={{ backgroundColor: 'var(--c-hero-chip)', borderColor: 'var(--c-hero-chip-border)', backdropFilter: 'blur(6px)' } as any}
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View className="ui-ping w-2 h-2 rounded-full" style={{ backgroundColor: '#4ADE80' }} />
          <Text className="t-eyebrow" style={{ color: 'var(--c-hero-muted)' }}>Următoarea sesiune</Text>
        </View>
        <Text className="text-[12px] font-bold" style={{ color: 'var(--c-hero-fg)' }}>{formatCountdown(event.startTime)}</Text>
      </View>
      <Text className="text-[17px] font-bold mt-2 leading-snug" style={{ color: 'var(--c-hero-fg)' }} numberOfLines={2}>
        {event.title}
      </Text>
      <View className="flex-row items-center gap-1.5 mt-1.5">
        <MaterialIcons name="schedule" size={14} color="var(--c-hero-muted)" />
        <Text className="text-[13px] font-medium" style={{ color: 'var(--c-hero-muted)' }} numberOfLines={1}>
          {[relative, formatCoachTimeRange(event.startTime, event.endTime)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5 mt-1">
        <MaterialIcons name={meta.icon} size={14} color="var(--c-hero-muted)" />
        <Text className="text-[13px] font-medium flex-1 min-w-0" style={{ color: 'var(--c-hero-muted)' }} numberOfLines={1}>
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
    <GlassCard className="ui-rise gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View>
          <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Săptămâna ta</Text>
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
            className="items-center rounded-[12px] border py-2.5 gap-1.5"
            style={{
              backgroundColor: day.isToday ? 'var(--c-brand-surface)' : day.events.length ? 'var(--c-surface-2)' : 'transparent',
              borderColor: day.isToday ? 'var(--c-brand-surface)' : 'var(--c-border-soft)',
            } as any}
            accessibilityLabel={`${day.weekday} ${day.date}: ${day.events.length} sesiuni`}
          >
            <Text className="text-[11px] font-semibold capitalize" style={{ color: day.isToday ? 'var(--c-on-brand)' : 'var(--c-muted)' }}>
              {day.weekday}
            </Text>
            <Text className="t-num text-[16px] font-bold leading-none" style={{ color: day.isToday ? 'var(--c-on-brand)' : 'var(--c-ink)' }}>
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
    <GlassCard className="ui-rise gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Sănătate lot</Text>
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>Prezența recentă a jucătorilor tăi</Text>
        </View>
        <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name="monitor-heart" size={18} color="var(--c-brand-fg)" />
        </View>
      </View>

      {rated.length ? (
        <>
          <View className="flex-row items-center gap-4 rounded-[14px] border p-3.5" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
            <ProgressRing value={average} size={76} stroke={8} color={attendanceRateColor(average)} label={`Prezență medie ${average}%`}>
              <Text className="t-num text-[18px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>{average}%</Text>
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

      <Pressable
        onPress={onManage}
        accessibilityRole="button"
        accessibilityLabel="Gestionează prezența"
        className="ui-press h-11 rounded-[12px] px-4 flex-row items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any}
      >
        <MaterialIcons name="fact-check" size={17} color="var(--c-on-brand)" />
        <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Gestionează prezența</Text>
      </Pressable>
    </GlassCard>
  );
}

function HomeSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă panoul">
      <Skeleton className="h-[176px] w-full rounded-[20px]" />
      <View className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[118px] w-full rounded-[16px]" />
        ))}
      </View>
      <View className="flex-col xl:flex-row gap-4">
        <View className="flex-1 gap-2.5">
          <Skeleton className="h-[170px] w-full rounded-[16px]" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[72px] w-full rounded-[14px]" />
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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
            <HeroBanner
              eyebrow={formatToday()}
              title={`${getGreeting()}, ${getFirstName(session?.name, session?.firstName)}`}
              // The scope ("assigned sessions" vs "the club's sessions") changes
              // what every number below counts, so it is stated up front.
              subtitle={`${getCoachScopeLabel(events, session)} · ${session?.clubName ?? 'Club'}`}
              chips={
                <>
                  <HeroChip icon="event" label={`${thisWeekEvents.length} ${thisWeekEvents.length === 1 ? 'sesiune' : 'sesiuni'} săptămâna asta`} />
                  {thisWeekMatches ? <HeroChip icon="sports-basketball" label={`${thisWeekMatches} ${thisWeekMatches === 1 ? 'meci' : 'meciuri'}`} /> : null}
                  <HeroChip icon="groups" label={`${visibleTeamsCount} ${visibleTeamsCount === 1 ? 'echipă' : 'echipe'}`} />
                </>
              }
              actions={
                <>
                  <HeroButton label="Marchează prezența" icon="fact-check" onPress={goToAttendance} />
                  {/* Schedule is already a bottom-nav tab on phones; hiding it there
                      keeps the hero actions on one line at 375px. */}
                  <HeroButton label="Program" icon="calendar-today" variant="ghost" onPress={goToSchedule} className="hidden sm:flex" />
                  <Pressable
                    onPress={() => loadData(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Reîmprospătează"
                    className="ui-press h-10 w-10 rounded-[11px] border items-center justify-center"
                    style={{ backgroundColor: 'var(--c-hero-chip)', borderColor: 'var(--c-hero-chip-border)' } as any}
                  >
                    {refreshing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="refresh" size={18} color="var(--c-hero-fg)" />}
                  </Pressable>
                </>
              }
              aside={<NextSessionPanel event={nextEvent} onPress={goToAttendance} />}
            />

            {/* Two columns at 375px rather than four: four tiles across a phone
                left ~80px each and ellipsised every label. */}
            <View className="grid grid-cols-2 lg:grid-cols-4 gap-3 ui-stagger">
              <StatCard icon="event-available" tone="brand" label="Sesiuni" value={upcomingEvents.length} hint="programate" />
              <StatCard icon="date-range" tone="sky" label="7 zile" value={thisWeekEvents.length} hint="săptămâna asta" />
              <StatCard icon="groups" tone="purple" label="Jucători" value={players.length} hint={`în ${visibleTeamsCount} ${visibleTeamsCount === 1 ? 'echipă' : 'echipe'}`} />
              <StatCard
                icon="insights"
                tone={averageAttendance == null ? 'neutral' : averageAttendance >= 75 ? 'success' : averageAttendance >= 50 ? 'warning' : 'danger'}
                label="Prezență"
                value={averageAttendance}
                suffix="%"
                hint="media lotului"
              />
            </View>

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
              <View className="w-full xl:w-[380px] shrink-0">
                <SquadHealth players={players} onManage={goToAttendance} />
              </View>
            </View>
          </View>
        )}
      </PageContainer>
    </ScrollView>
  );
}
