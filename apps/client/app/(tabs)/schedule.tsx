import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { eventsApi, CalendarEvent } from '../../services/eventsApi';
import { teamsApi, type Team } from '../../services/teamsApi';
import { AddEventModal } from '../../components/schedule/admin/AddEventModal';
import { coachManagedTeamIds } from '../../utils/coachEventScope';
import { AuthUser, normalizeRole } from '../../utils/authSession';
import { useSession } from '../../context/AuthContext';
import { getCoachScopedEvents } from '../../components/coach/coachUtils';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../components/HeaderContext';
import { PlayerEventDetailModal } from '../../components/schedule/player/PlayerEventDetailModal';
import { Skeleton } from '../../components/ui/Skeleton';
import PageContainer from '../../components/ui/PageContainer';
import PageHero, { GlassStat, StatStrip } from '../../components/admin/PageHero';
import { DenseList, DenseRow } from '../../components/ui/DenseList';
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
  startOfWeek,
  addMonths,
  getEventDate,
  getEventTimestamp,
  isCancelledEvent,
  getMonthGridDays,
  groupEventsByDay,
  getEventTypeMeta,
  eventMatchesSearch,
  buildICSCalendar,
  triggerFileDownload,
} from '../../components/schedule/scheduleShared';
import { plural } from '../../utils/plural';

import { tr, appLocale } from '../../i18n';
type EventFilter = 'all' | 'training' | 'match' | 'camp';
type ScheduleView = 'month' | 'week' | 'agenda';

const RO_LOCALE = appLocale();

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

/** How far back Program can go: a year, as before. */
function historyLimit() {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  return since;
}

/**
 * What Program loads first: this month (and this week, which can start in the
 * previous one) and everything ahead. Older weeks are fetched when the
 * calendar goes back, the agenda or week view opens, or the month is
 * exported — a whole year of a club's sessions was ~1 MB on every visit.
 */
function initialHistoryStart() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  return weekStart < monthStart ? weekStart : monthStart;
}

function mergeEvents(current: CalendarEvent[], extra: CalendarEvent[]) {
  const byId = new Map(current.map((event) => [event.id, event]));
  extra.forEach((event) => byId.set(event.id, event));
  return Array.from(byId.values()).sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));
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
    return tr('Acum');
  }

  // Readable, not "5z" / "40h".
  const hours = Math.ceil(diffMs / 3600000);
  if (hours < 24) {
    return tr('în {0}', { '0': plural(hours, 'oră', 'ore') });
  }

  const days = Math.ceil(hours / 24);
  return days === 1 ? tr('mâine') : tr('în {0}', { '0': plural(days, 'zi', 'zile') });
}


/**
 * One day of the month as a row of one list — the day on the
 * left, its sessions on the right. The day cards were a card per day, and a
 * second card list („Evenimente viitoare”) beside the calendar repeated the
 * same sessions.
 */
function MonthDayRow({
  dateKey,
  events,
  isToday,
  selected,
  onSelectEvent,
}: {
  dateKey: string;
  events: CalendarEvent[];
  isToday: boolean;
  selected: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const date = parseDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat(RO_LOCALE, { weekday: 'short' }).format(date).replace('.', '');

  return (
    <DenseRow selected={selected} className="items-start">
      <View className="w-11 shrink-0 items-center pt-1">
        <Text className="t-num text-[18px] font-bold leading-none" style={{ color: isToday ? 'var(--c-brand-fg)' : 'var(--c-ink-strong)' }}>{date.getDate()}</Text>
        <Text className="t-label mt-1" style={{ color: isToday ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>{isToday ? tr('Azi') : weekday.charAt(0).toUpperCase() + weekday.slice(1)}</Text>
      </View>
      <View className="flex-1 min-w-0 gap-0.5">
        {events.map((event) => {
          const meta = getEventTypeMeta(event.type);
          return (
            <Pressable
              key={event.id}
              onPress={() => onSelectEvent(event)}
              accessibilityRole="button"
              accessibilityLabel={`${meta.label}: ${event.title}, ${formatTimeRange(event.startTime, event.endTime)}`}
              className="ui-press flex-row items-center gap-2.5 rounded-[10px] px-2 py-2 min-h-[44px] text-left hover:bg-[var(--c-surface-2)]"
            >
              <View className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.solid }} />
              <View className="flex-1 min-w-0">
                <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{event.title}</Text>
                <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                  {[meta.label, formatTimeRange(event.startTime, event.endTime), event.location || tr('Teren club')].join(' · ')}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" />
            </Pressable>
          );
        })}
      </View>
    </DenseRow>
  );
}

export default function ScheduleScreen() {
  const { session } = useSession();
  const { setSearchPlaceholder, searchValue, setSearchValue } = useHeader();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const eventsRef = useRef<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<EventFilter>('all');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('month');
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => toDateKey(new Date()));
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [clubTeams, setClubTeams] = useState<Team[]>([]);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const { width } = useWindowDimensions();

  const isMobile = width < 1024;
  const isCoach = normalizeRole(session?.role) === 'coach';

  // Global header search box drives the schedule search, same as admin.
  useEffect(() => {
    setSearchPlaceholder(tr('Caută evenimente...'));
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setSearchValue('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Earliest start loaded so far (null until the first load answers).
  const loadedFromRef = useRef<Date | null>(null);
  const clubTeamsRef = useRef<Team[]>([]);
  const historyRequestRef = useRef<Promise<CalendarEvent[]> | null>(null);

  const toVisibleEvents = useCallback((rows: CalendarEvent[], teamRows: Team[]) => {
    const teamIds = getSessionTeamIds(session);
    // A coach's view is scoped by the teams they coach (team.coachId).
    const roleEvents = isCoach ? getCoachScopedEvents(rows, session, teamRows) : rows;
    return [...roleEvents]
      .filter((event) => !isCancelled(event))
      .filter((event) => isCoach || belongsToSessionTeam(event, teamIds))
      .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));
  }, [isCoach, session]);

  /**
   * Make sure everything from `from` (never more than a year back) is loaded;
   * resolves with the full list. Concurrent calls share one request.
   */
  const ensureHistory = useCallback(async (from: Date): Promise<CalendarEvent[]> => {
    const limit = historyLimit();
    const target = from < limit ? limit : from;
    const loadedFrom = loadedFromRef.current;
    if (!loadedFrom || target >= loadedFrom) return historyRequestRef.current ?? eventsRef.current;
    if (historyRequestRef.current) {
      await historyRequestRef.current;
      return ensureHistory(from);
    }
    const request = eventsApi.getEvents({ start: target.toISOString(), end: loadedFrom.toISOString() })
      .then((rows) => {
        loadedFromRef.current = target;
        const merged = mergeEvents(eventsRef.current, toVisibleEvents(rows, clubTeamsRef.current));
        eventsRef.current = merged;
        setEvents(merged);
        return merged;
      })
      .finally(() => { historyRequestRef.current = null; });
    historyRequestRef.current = request;
    return request;
  }, [toVisibleEvents]);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      // A refresh keeps the history already on screen; the first load starts
      // with this month and what is ahead.
      const start = loadedFromRef.current ?? initialHistoryStart();
      const [allEvents, teamRows] = await Promise.all([
        eventsApi.getEvents({ start: start.toISOString() }),
        isCoach ? teamsApi.getTeams() : Promise.resolve([]),
      ]);
      setClubTeams(teamRows);
      clubTeamsRef.current = teamRows;
      const visibleEvents = toVisibleEvents(allEvents, teamRows);
      loadedFromRef.current = start;
      eventsRef.current = visibleEvents;

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
      setError(tr('Programul nu a putut fi încărcat. Verifică conexiunea și încearcă din nou.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isCoach, toVisibleEvents]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Older weeks, when the screen needs them: a month before what is loaded,
  // and the whole year for the agenda (it lists past sessions) and the week
  // view (it can step back freely).
  useEffect(() => {
    if (loading) return;
    const from = scheduleView === 'month' ? viewDate : historyLimit();
    if (loadedFromRef.current && from < loadedFromRef.current) {
      ensureHistory(from).catch((err) => {
        console.error('[schedule] Failed to load older events:', err);
        setError(tr('Programul nu a putut fi încărcat. Verifică conexiunea și încearcă din nou.'));
      });
    }
  }, [ensureHistory, loading, scheduleView, viewDate]);

  const filteredEvents = useMemo(
    () => events
      .filter((event) => eventMatchesFilter(event, activeFilter))
      .filter((event) => eventMatchesSearch(event, searchValue)),
    [activeFilter, events, searchValue]
  );

  // A camp sits on every day it covers, not only its first.
  const eventsByDay = useMemo(() => groupEventsByDay(filteredEvents), [filteredEvents]);

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

  const handleSelectDay = (dateKey: string) => {
    setSelectedDayKey(dateKey);
    setSelectedDay({ date: parseDateKey(dateKey), events: eventsByDay.get(dateKey) ?? [] });
  };

  const resetKey = `${toDateKey(viewDate).slice(0, 7)}|${activeFilter}|${searchValue}`;

  const handleExport = async () => {
    const filename = `program-${toDateKey(viewDate).slice(0, 7)}.ics`;
    let all: CalendarEvent[];
    try {
      // The file holds the whole year on record, as it always did.
      all = await ensureHistory(historyLimit());
    } catch (err) {
      console.error('[schedule] Failed to load events for export:', err);
      setError(tr('Programul nu a putut fi încărcat. Verifică conexiunea și încearcă din nou.'));
      return;
    }
    const exported = all
      .filter((event) => eventMatchesFilter(event, activeFilter))
      .filter((event) => eventMatchesSearch(event, searchValue));
    const ok = triggerFileDownload(filename, buildICSCalendar(exported), 'text/calendar;charset=utf-8;');
    if (!ok) {
      setError(tr('Exportul calendarului este disponibil momentan doar pe web.'));
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-[var(--c-bg)]"
      contentContainerClassName="pb-32"
    >
      <PageContainer>
        {/* The title on phones too (it was the one screen without an h1
            there); the figures stay a desktop summary. */}
        {(
          <PageHero
            eyebrow={tr('Program')}
            title={isCoach ? tr('Programul echipelor') : normalizeRole(session?.role) === 'parent' ? tr('Programul copilului') : tr('Programul meu')}
            subtitle={isMobile ? undefined : tr('Antrenamente, meciuri și cantonamente, într-un singur loc.')}
            className={isMobile ? 'mb-3' : undefined}
          >
            {isMobile ? null : (
              <StatStrip className="grid-cols-3">
                <GlassStat value={monthEventCount} label={tr('Evenimente în {0}', { '0': formatMonthName(viewDate) })} dot="var(--c-brand-surface)" />
                <GlassStat value={upcomingEvents.length} label={tr('Evenimente viitoare')} dot="var(--c-success)" />
                <GlassStat value={getNextMatchLabel(nextMatch)} label={tr('Următorul meci')} dot="var(--c-purple)" />
              </StatStrip>
            )}
          </PageHero>
        )}
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
            onExport={() => { void handleExport(); }}
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
                  <Text className="f-display text-[17px] font-bold" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.02em' } as any}>{tr('Evenimentele lunii')}</Text>
                  <Text className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>
                    {tr('{0} în {1} {2}', { '0': plural(monthEventCount, tr('eveniment'), tr('evenimente')), '1': formatMonthName(viewDate), '2': viewDate.getFullYear() })}</Text>
                </View>
                <Pressable onPress={() => setScheduleView('agenda')} accessibilityRole="button" className="h-10 lg:h-8 justify-center px-1">
                  <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{tr('Vezi toate lunile')}</Text>
                </Pressable>
              </View>

              {loading ? (
                <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start" accessibilityRole="progressbar" accessibilityLabel={tr('Se încarcă evenimentele')}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-[120px] w-full rounded-[14px]" />
                  ))}
                </View>
              ) : monthDayGroups.length ? (
                <DenseList label={tr('Evenimentele lunii')}>
                  {monthDayGroups.map((day) => (
                    <MonthDayRow
                      key={day.dateKey}
                      dateKey={day.dateKey as string}
                      events={day.events}
                      isToday={day.isToday}
                      selected={day.dateKey === selectedDayKey && !day.isToday}
                      onSelectEvent={setSelectedEvent}
                    />
                  ))}
                </DenseList>
              ) : (
                <EmptyState
                  icon="event-busy"
                  compact
                  title={tr('Nicio zi cu evenimente în această lună')}
                  message={tr('Schimbă luna din bara de sus sau încearcă alt filtru.')}
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
        // A coach's list holds only sessions they manage (coachEventScope),
        // the same rule the server applies to the edit.
        onEdit={isCoach ? (event) => { setSelectedEvent(null); setEditingEvent(event); } : undefined}
      />
      {isCoach ? (
        <AddEventModal
          visible={editingEvent !== null}
          onClose={() => setEditingEvent(null)}
          editEvent={editingEvent}
          onSaved={() => { loadData(true); }}
          // Their own teams (plus the event's, when it is assigned to them on
          // another team); the fee stays with the admin.
          teams={clubTeams.filter((team) => coachManagedTeamIds(clubTeams, session?.id).has(team.id) || team.id === editingEvent?.teamId)}
          canEditFee={false}
          isMobile={isMobile}
        />
      ) : null}
    </ScrollView>
  );
}
