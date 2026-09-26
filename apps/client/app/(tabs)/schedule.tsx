import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Clock, MapPin, TrendingUp, Trophy } from 'lucide-react';
import { eventsApi, CalendarEvent } from '../../services/eventsApi';
import { AuthUser, normalizeRole } from '../../utils/authSession';
import { useSession } from '../../context/AuthContext';
import { getCoachScopedEvents } from '../../components/coach/coachUtils';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../components/HeaderContext';
import { PlayerEventDetailModal } from '../../components/schedule/player/PlayerEventDetailModal';
import { Skeleton } from '../../components/ui/Skeleton';
import PageContainer from '../../components/ui/PageContainer';
import { EmptyState } from '../../components/ui/ScreenState';
import { findNextUpcomingEvent } from '../../utils/scheduleLanding';
import { PlayerDayScheduleModal } from '../../components/schedule/player/PlayerDayScheduleModal';
import { PlayerScheduleWeekView } from '../../components/schedule/player/PlayerScheduleWeekView';
import { PlayerScheduleAgendaList } from '../../components/schedule/player/PlayerScheduleAgendaList';
import { PlayerScheduleToolbar } from '../../components/schedule/player/PlayerScheduleToolbar';
import { PlayerCalendarGrid } from '../../components/schedule/player/PlayerCalendarGrid';
import type { PlayerCalendarDay } from '../../components/schedule/player/PlayerCalendarGrid';
import {
  toDateKey,
  startOfMonth,
  addMonths,
  getEventDate,
  getEventTimestamp,
  isCancelledEvent,
  getMonthGridDays,
  getEventTypeMeta,
  eventMatchesSearch,
  buildICSCalendar,
  triggerFileDownload,
} from '../../components/schedule/scheduleShared';

type EventFilter = 'all' | 'training' | 'match' | 'camp';
type ScheduleView = 'month' | 'week' | 'agenda';

const RO_LOCALE = 'ro-RO';

function getSessionTeamIds(user: AuthUser | null) {
  return new Set(
    (user?.teamIds ?? [])
      .map((teamId) => Number(teamId))
      .filter((teamId) => Number.isFinite(teamId))
  );
}

function belongsToSessionTeam(event: CalendarEvent, teamIds: Set<number>) {
  if (teamIds.size === 0) {
    return true;
  }

  return event.teamId != null && teamIds.has(Number(event.teamId));
}

function isCancelled(event: CalendarEvent) {
  return isCancelledEvent(event);
}

// Note: this checks the event's *start* time (unlike the admin schedule,
// which treats an event as "upcoming" until it ends) — preserved as-is
// since coaches/players use this to mean "hasn't started yet".
function isUpcoming(event: CalendarEvent) {
  return !isCancelledEvent(event) && getEventTimestamp(event) >= Date.now();
}

function formatMonthName(value: Date) {
  return new Intl.DateTimeFormat(RO_LOCALE, { month: 'long' }).format(value);
}

function formatDayBlock(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return { month: 'DATA', day: '--' };
  }

  return {
    month: new Intl.DateTimeFormat(RO_LOCALE, { month: 'short' }).format(date).toUpperCase().replace('.', ''),
    day: String(date.getDate()),
  };
}

function formatEventTime(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(RO_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTimeRange(start: string, end: string) {
  const startTime = formatEventTime(start);
  const endDate = getEventDate(end);

  if (!endDate) {
    return startTime;
  }

  return `${startTime} - ${formatEventTime(end)}`;
}

function eventMatchesFilter(event: CalendarEvent, filter: EventFilter) {
  if (filter === 'all') {
    return true;
  }

  return event.type === filter;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getCalendarDays(viewDate: Date, eventsByDay: Map<string, CalendarEvent[]>, selectedDayKey: string | null): PlayerCalendarDay[] {
  // Delegates the actual month-grid math to the shared helper (used by the
  // admin schedule too) and only adds the tabs-specific "isSelected" flag.
  const minimumSlots = 35;
  return getMonthGridDays(viewDate, eventsByDay, minimumSlots).map((day) => ({
    key: day.key,
    dayNumber: day.dayNumber,
    dateKey: day.dateKey,
    isToday: day.isToday,
    isSelected: day.dateKey !== null && day.dateKey === selectedDayKey,
    events: day.events,
  }));
}

function getNextMatchLabel(match: CalendarEvent | null) {
  if (!match) {
    return '--';
  }

  const diffMs = getEventTimestamp(match) - Date.now();
  if (diffMs <= 0) {
    return 'Acum';
  }

  const hours = Math.ceil(diffMs / 3600000);
  if (hours < 72) {
    return `${hours}h`;
  }

  return `${Math.ceil(hours / 24)}z`;
}


/**
 * Right-rail event card — mirrors the admin ScheduleEventCard in its `compact`
 * (stacked) form: 48px date block, radius 20, 3px type-coloured left edge.
 * Read-only: pressing the card opens the detail sheet, nothing else.
 */
function UpcomingEventCard({ event, onDetails }: { event: CalendarEvent; onDetails: () => void }) {
  const meta = getEventTypeMeta(event.type);
  const dateBlock = formatDayBlock(event.startTime);

  return (
    <Pressable
      onPress={onDetails}
      accessibilityRole="button"
      className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-[20px] px-4 py-4 gap-3 hover:opacity-90"
      style={{ borderLeftWidth: 3, borderLeftColor: meta.solid }}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="w-12 h-12 rounded-[14px] items-center justify-center border"
          style={{ backgroundColor: meta.soft, borderColor: meta.soft }}
        >
          <Text className="text-[9px] font-black uppercase tracking-wider" style={{ color: meta.onSoft }}>
            {dateBlock.month}
          </Text>
          <Text className="text-[17px] font-black leading-tight" style={{ color: 'var(--c-ink-strong)' }}>
            {dateBlock.day}
          </Text>
        </View>

        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              className="text-[15px] font-black flex-1"
              style={{ color: 'var(--c-ink-strong)' }}
            >
              {event.title}
            </Text>
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: meta.soft }}>
              <Text className="text-[9px] font-black uppercase tracking-widest" style={{ color: meta.onSoft }}>
                {meta.label}
              </Text>
            </View>
          </View>

          <View className="gap-1.5 mt-1.5">
            <View className="flex-row items-center gap-1.5">
              <Clock size={13} color="var(--c-faint)" />
              <Text className="text-[12px] font-bold" style={{ color: 'var(--c-muted)' }}>
                {formatTimeRange(event.startTime, event.endTime)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
              <MapPin size={13} color="var(--c-faint)" />
              <Text numberOfLines={1} className="text-[12px] font-semibold flex-1" style={{ color: 'var(--c-muted)' }}>
                {event.location || event.teamName || 'Teren club'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Flat stat tile. These were two saturated gradients (indigo + a hardcoded
 * off-brand teal) with 32px white numerals — the loudest thing on a page whose
 * subject is the calendar. Same surface/border/type as every other card now.
 */
function MiniMetric({ label, value, icon: Icon }: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
}) {
  return (
    <View
      className="flex-1 rounded-[14px] border p-4 justify-between"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', minHeight: 88, boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-2">
        <Icon size={14} color="var(--c-faint)" />
        <Text className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--c-faint)' }}>{label}</Text>
      </View>
      <Text className="text-[24px] font-bold tracking-tight mt-2" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

/** One event line inside a day card: type bar, title, time, place. */
function DayEventLine({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const meta = getEventTypeMeta(event.type);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}: ${event.title}`}
      className="flex-row items-center gap-2.5 rounded-[10px] px-2.5 py-2 hover:opacity-90"
      style={{ backgroundColor: 'var(--c-surface-2)' }}
    >
      <View style={{ width: 3, alignSelf: 'stretch', minHeight: 26, borderRadius: 2, backgroundColor: meta.solid }} />
      <View className="flex-1 min-w-0">
        <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{event.title}</Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <Clock size={11} color="var(--c-faint)" />
          <Text className="text-[11px] font-medium" style={{ color: 'var(--c-muted)' }}>{formatTimeRange(event.startTime, event.endTime)}</Text>
          <MapPin size={11} color="var(--c-faint)" />
          <Text className="text-[11px] font-medium flex-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
            {event.location || 'Teren club'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** A single day's events, as one card in the month grid. */
function DayCard({
  dateKey,
  events,
  isToday,
  onSelectEvent,
}: {
  dateKey: string;
  events: CalendarEvent[];
  isToday: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const date = parseDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat(RO_LOCALE, { weekday: 'short' }).format(date).replace('.', '');

  return (
    <View
      className="rounded-[14px] border p-3"
      style={{
        backgroundColor: 'var(--c-surface)',
        borderColor: isToday ? 'var(--c-brand-border)' : 'var(--c-border)',
        boxShadow: 'var(--e-sm)',
      } as any}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <Text className="text-[16px] font-bold leading-none" style={{ color: isToday ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>
          {date.getDate()}
        </Text>
        <Text className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--c-faint)' }}>{weekday}</Text>
        {isToday ? (
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
            <Text className="text-[10px] font-bold uppercase" style={{ color: 'var(--c-brand-fg)' }}>Azi</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-1.5">
        {events.map((event) => (
          <DayEventLine key={event.id} event={event} onPress={() => onSelectEvent(event)} />
        ))}
      </View>
    </View>
  );
}

export default function ScheduleScreen() {
  const { session } = useSession();
  const { setSearchPlaceholder, searchValue, setSearchValue } = useHeader();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<EventFilter>('all');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('month');
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => toDateKey(new Date()));
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const { width } = useWindowDimensions();

  const isMobile = width < 1024;
  const isCoach = normalizeRole(session?.role) === 'coach';

  // Global header search box drives the schedule search, same as admin.
  useEffect(() => {
    setSearchPlaceholder('Caută evenimente...');
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setSearchValue('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const allEvents = await eventsApi.getEvents();
      const teamIds = getSessionTeamIds(session);
      const roleEvents = isCoach ? getCoachScopedEvents(allEvents, session) : allEvents;
      const visibleEvents = [...roleEvents]
        .filter((event) => !isCancelled(event))
        .filter((event) => isCoach || belongsToSessionTeam(event, teamIds))
        .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));

      const landingEvent = findNextUpcomingEvent(visibleEvents);
      const landingDate = landingEvent ? getEventDate(landingEvent.startTime) : null;

      setEvents(visibleEvents);
      // Only ever jump forward. The old `?? visibleEvents[0]` fallback ran against an
      // ascending list, so a club with nothing upcoming opened on the OLDEST event it
      // had ever recorded — the calendar landed in 2023. With nothing ahead we stay on
      // the current month and keep today selected.
      if (landingDate) {
        setViewDate(startOfMonth(landingDate));
        setSelectedDayKey(toDateKey(landingDate));
      }
    } catch (err) {
      // Never surface the raw message: transport-level failures produce strings
      // like "signal is aborted without reason", which rendered verbatim in the
      // error banner. Log the real error, show the user a stable one.
      console.error('[schedule] Failed to load events:', err);
      setError('Programul nu a putut fi încărcat. Verifică conexiunea și încearcă din nou.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isCoach, session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEvents = useMemo(
    () => events
      .filter((event) => eventMatchesFilter(event, activeFilter))
      .filter((event) => eventMatchesSearch(event, searchValue)),
    [activeFilter, events, searchValue]
  );

  const eventsByDay = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>();

    filteredEvents.forEach((event) => {
      const eventDate = getEventDate(event.startTime);
      if (!eventDate) {
        return;
      }

      const dayKey = toDateKey(eventDate);
      byDay.set(dayKey, [...(byDay.get(dayKey) ?? []), event]);
    });

    return byDay;
  }, [filteredEvents]);

  const calendarDays = useMemo(
    () => getCalendarDays(viewDate, eventsByDay, selectedDayKey),
    [eventsByDay, selectedDayKey, viewDate]
  );

  // The month grid already holds exactly the right days, in order, filtered —
  // the day list below is just its non-empty cells, so the two can never
  // disagree about what the month contains.
  const monthDayGroups = useMemo(
    () => calendarDays.filter((day) => day.dateKey !== null && day.events.length > 0),
    [calendarDays]
  );

  const upcomingEvents = useMemo(
    () => filteredEvents.filter(isUpcoming).sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [filteredEvents]
  );

  const nextMatch = useMemo(
    () => upcomingEvents.find((event) => event.type === 'match') ?? null,
    [upcomingEvents]
  );

  // Per-type counts feed the toolbar chips (which double as the calendar's
  // legend). Scoped to the month on screen — the admin toolbar's counts are
  // month-scoped because admin fetches a month at a time, and an unscoped count
  // here read as "677 antrenamente" next to an empty August. Computed IGNORING
  // the active type filter, so each chip always shows its own total rather than
  // 0 once another type is selected. Presentation only.
  const typeCounts = useMemo(() => {
    const monthKey = toDateKey(viewDate).slice(0, 7);
    return events
      .filter((event) => eventMatchesSearch(event, searchValue))
      .filter((event) => {
        const date = getEventDate(event.startTime);
        return date != null && toDateKey(date).slice(0, 7) === monthKey;
      })
      .reduce<Record<string, number>>((acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      }, {});
  }, [events, searchValue, viewDate]);

  const monthEventCount = calendarDays.reduce((total, day) => total + day.events.length, 0);
  const visibleUpcomingCards = upcomingEvents.slice(0, 3);

  const handleSelectDay = (dateKey: string) => {
    setSelectedDayKey(dateKey);
    setSelectedDay({ date: parseDateKey(dateKey), events: eventsByDay.get(dateKey) ?? [] });
  };

  const resetKey = `${toDateKey(viewDate).slice(0, 7)}|${activeFilter}|${searchValue}`;

  const handleExport = () => {
    const filename = `program-${toDateKey(viewDate).slice(0, 7)}.ics`;
    const ok = triggerFileDownload(filename, buildICSCalendar(filteredEvents), 'text/calendar;charset=utf-8;');
    if (!ok) {
      setError('Exportul calendarului este disponibil momentan doar pe web.');
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-[var(--c-bg)]"
      contentContainerClassName="pb-32"
    >
      <PageContainer>
        <View className="mb-4">
          <PlayerScheduleToolbar
            monthLabel={formatMonthName(viewDate)}
            year={viewDate.getFullYear()}
            eventCount={monthEventCount}
            onNavigateMonth={(delta) => setViewDate((current) => addMonths(current, delta))}
            onToday={() => setViewDate(startOfMonth(new Date()))}
            view={scheduleView}
            onViewChange={setScheduleView}
            filter={activeFilter}
            onFilterChange={setActiveFilter}
            typeCounts={typeCounts}
            onExport={handleExport}
            onRefresh={() => loadData(true)}
            refreshing={refreshing}
            isMobile={isMobile}
            searchValue={searchValue}
            onClearSearch={() => setSearchValue('')}
          />
        </View>

        {error ? (
          <View className="mb-4 rounded-[12px] border border-[var(--c-danger-border)] bg-[var(--c-danger-bg)] px-4 py-3 flex-row items-center gap-2">
            <MaterialIcons name="error-outline" size={18} color="var(--c-danger)" />
            <Text className="flex-1 text-[12px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
          </View>
        ) : null}

        {scheduleView === 'week' ? (
          <PlayerScheduleWeekView events={filteredEvents} onSelectEvent={setSelectedEvent} isMobile={isMobile} />
        ) : scheduleView === 'agenda' ? (
          <PlayerScheduleAgendaList events={filteredEvents} resetKey={resetKey} isMobile={isMobile} onSelectEvent={setSelectedEvent} />
        ) : (
          <View className="gap-5 w-full">
            <View className={`${isMobile ? 'gap-4' : 'flex-row gap-5 items-start w-full'}`}>
              <View className="flex-1 min-w-0">
                {/* Month header removed — the toolbar above already owns the month
                    label, count and stepper. The grid card is now just the grid. */}
                <PlayerCalendarGrid days={calendarDays} loading={loading} onSelectDay={handleSelectDay} />
              </View>

              <View className={`${isMobile ? 'w-full' : 'shrink-0'} gap-4`} style={isMobile ? undefined : { width: width >= 1440 ? 380 : 340 }}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Evenimente viitoare</Text>
                  <Pressable onPress={() => setScheduleView('agenda')}>
                    <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Vezi tot</Text>
                  </Pressable>
                </View>

                {loading ? (
                  <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă evenimentele viitoare">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <Skeleton key={index} className="h-[108px] w-full rounded-[20px]" />
                    ))}
                  </View>
                ) : visibleUpcomingCards.length ? (
                  visibleUpcomingCards.map((event) => (
                    <UpcomingEventCard key={event.id} event={event} onDetails={() => setSelectedEvent(event)} />
                  ))
                ) : (
                  <EmptyState icon="event-busy" compact title="Niciun eveniment viitor" message="Evenimentele programate apar aici." />
                )}

                <View className="flex-row gap-3">
                  <MiniMetric label="Viitoare" value={String(upcomingEvents.length)} icon={TrendingUp} />
                  <MiniMetric label="Următorul meci" value={getNextMatchLabel(nextMatch)} icon={Trophy} />
                </View>
              </View>
            </View>

            {/* Full width, month-scoped, grouped by day.
                It used to be a 16-row flat list stacked in the ~800px left
                column, listing EVERY event ever ("21 evenimente") right under a
                calendar whose toolbar said "12 evenimente" — two different
                answers to the same question, in one narrow strip, while the
                right rail sat empty for 1400px. Now it answers the same
                question as the calendar above it, and spends the whole page
                width doing it. */}
            <View>
              <View className="mb-3 flex-row flex-wrap items-end justify-between gap-3">
                <View>
                  <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>
                    Evenimentele lunii
                  </Text>
                  <Text className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>
                    {monthEventCount} {monthEventCount === 1 ? 'eveniment' : 'evenimente'} în {formatMonthName(viewDate)} {viewDate.getFullYear()}
                  </Text>
                </View>
                <Pressable onPress={() => setScheduleView('agenda')} accessibilityRole="button">
                  <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Vezi toate lunile</Text>
                </Pressable>
              </View>

              {loading ? (
                <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start" accessibilityRole="progressbar" accessibilityLabel="Se încarcă evenimentele">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-[120px] w-full rounded-[14px]" />
                  ))}
                </View>
              ) : monthDayGroups.length ? (
                <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
                  {monthDayGroups.map((day) => (
                    <DayCard
                      key={day.dateKey}
                      dateKey={day.dateKey as string}
                      events={day.events}
                      isToday={day.isToday}
                      onSelectEvent={setSelectedEvent}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon="event-busy"
                  compact
                  title="Nicio zi cu evenimente în această lună"
                  message="Schimbă luna din bara de sus sau încearcă alt filtru."
                />
              )}
            </View>
          </View>
        )}
      </PageContainer>

      <PlayerDayScheduleModal
        day={selectedDay}
        isMobile={isMobile}
        onClose={() => setSelectedDay(null)}
        onSelectEvent={(event) => { setSelectedDay(null); setSelectedEvent(event); }}
      />

      <PlayerEventDetailModal
        event={selectedEvent}
        isMobile={isMobile}
        onClose={() => setSelectedEvent(null)}
      />
    </ScrollView>
  );
}
