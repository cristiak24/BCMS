import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { eventsApi, CalendarEvent } from '../../services/eventsApi';
import { AuthUser, normalizeRole } from '../../utils/authSession';
import { useFirebaseAuth } from '../../context/AuthContext';
import { getCoachScopedEvents } from '../../components/coach/coachUtils';
import {
  toDateKey,
  startOfMonth,
  addMonths,
  getEventDate,
  getEventTimestamp,
  isCancelledEvent,
  getMonthGridDays,
} from '../../components/schedule/scheduleShared';

type EventFilter = 'all' | 'training' | 'match' | 'camp';

type EventTone = {
  label: string;
  color: string;
  pillBg: string;
  chipBg: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

type CalendarDay = {
  key: string;
  dayNumber: number | null;
  dateKey: string | null;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
};

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'All Events' },
  { key: 'training', label: 'Training' },
  { key: 'match', label: 'Matches' },
  { key: 'camp', label: 'Camps' },
];

const EVENTS_PAGE_SIZE = 16;

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

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function formatMonthRange(value: Date) {
  return `${formatMonth(value)} - ${formatMonth(addMonths(value, 1))}`;
}

function formatEventDate(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date).toUpperCase();
}

function formatShortDate(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDayBlock(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return { month: 'DATE', day: '--' };
  }

  return {
    month: new Intl.DateTimeFormat('en', { month: 'short' }).format(date).toUpperCase(),
    day: String(date.getDate()),
  };
}

function formatEventTime(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
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

function toneForEvent(type: CalendarEvent['type']): EventTone {
  if (type === 'match') {
    return {
      label: 'MATCH',
      color: 'var(--c-brand-fg)',
      pillBg: 'var(--c-surface-tint)',
      chipBg: 'var(--c-surface-tint)',
      icon: 'sports-basketball',
    };
  }

  if (type === 'camp') {
    return {
      label: 'CAMP',
      color: '#007A99',
      pillBg: 'var(--c-surface-tint)',
      chipBg: 'var(--c-surface-tint)',
      icon: 'terrain',
    };
  }

  if (type === 'admin') {
    return {
      label: 'INFO',
      color: 'var(--c-muted)',
      pillBg: 'var(--c-surface-2)',
      chipBg: 'var(--c-surface-2)',
      icon: 'badge',
    };
  }

  return {
    label: 'TRAINING',
    color: 'var(--c-brand-fg)',
    pillBg: 'var(--c-surface-tint)',
    chipBg: 'var(--c-surface-tint)',
    icon: 'fitness-center',
  };
}

function getCalendarDays(viewDate: Date, eventsByDay: Map<string, CalendarEvent[]>, selectedDayKey: string | null): CalendarDay[] {
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
    return 'Now';
  }

  const hours = Math.ceil(diffMs / 3600000);
  if (hours < 72) {
    return `${hours}h`;
  }

  return `${Math.ceil(hours / 24)}d`;
}

function EmptyState({ message }: { message: string }) {
  return (
    <View className="items-center justify-center rounded-[28px] border border-[#E3ECF6] bg-white px-6 py-10">
      <MaterialIcons name="event-busy" size={30} color="var(--c-faint)" />
      <Text className="mt-3 text-center text-[#64748B] font-bold">{message}</Text>
    </View>
  );
}

function FilterChip({
  filter,
  active,
  onPress,
}: {
  filter: { key: EventFilter; label: string };
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active ? styles.filterChipActive : styles.filterChipIdle]}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : styles.filterChipTextIdle]}>
        {filter.label}
      </Text>
    </Pressable>
  );
}

function PaginationButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.paginationButton, disabled ? styles.paginationButtonDisabled : null]}
    >
      <MaterialIcons name={icon} size={24} color={disabled ? '#A7B4C6' : 'var(--c-brand-fg)'} />
    </Pressable>
  );
}

function CalendarEventPill({ event }: { event: CalendarEvent }) {
  const tone = toneForEvent(event.type);

  return (
    <View style={[styles.calendarEventPill, { backgroundColor: tone.chipBg, borderLeftColor: tone.color }]}>
      <Text numberOfLines={2} style={[styles.calendarEventText, { color: tone.color }]}>
        {tone.label}: {event.title}
      </Text>
    </View>
  );
}

function CalendarCell({
  day,
  index,
  isLastRow,
  cellHeight,
  onSelect,
}: {
  day: CalendarDay;
  index: number;
  isLastRow: boolean;
  cellHeight: number;
  onSelect: (dateKey: string) => void;
}) {
  const showOverflow = day.events.length > 2;

  return (
    <Pressable
      disabled={!day.dateKey}
      onPress={() => day.dateKey && onSelect(day.dateKey)}
      style={[
        styles.calendarCell,
        {
          minHeight: cellHeight,
          borderRightWidth: index % 7 === 6 ? 0 : 1,
          borderBottomWidth: isLastRow ? 0 : 1,
        },
        day.isSelected ? styles.calendarCellSelected : null,
      ]}
    >
      {day.dayNumber ? (
        <>
          <View className="flex-row items-center justify-between">
            <View style={[styles.dayNumber, day.isToday || day.isSelected ? styles.dayNumberActive : null]}>
              <Text style={[styles.dayNumberText, day.isToday || day.isSelected ? styles.dayNumberTextActive : null]}>
                {day.dayNumber}
              </Text>
            </View>
            {day.events.length ? (
              <Text className="text-[10px] font-black text-[#8EA1B8]">{day.events.length}</Text>
            ) : null}
          </View>

          <View className="mt-2 gap-1">
            {day.events.slice(0, 2).map((event) => (
              <CalendarEventPill key={event.id} event={event} />
            ))}
            {showOverflow ? (
              <Text className="text-[10px] font-black text-[#64748B]">+{day.events.length - 2} more</Text>
            ) : null}
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

function UpcomingEventCard({ event, primary }: { event: CalendarEvent; primary?: boolean }) {
  const router = useRouter();
  const tone = toneForEvent(event.type);
  const actionLabel = event.type === 'camp' ? 'Register' : event.type === 'training' ? 'Attending' : 'Check In';
  const handleAction = () => {
    if (event.type === 'match') {
      router.replace('/attendance' as any);
    }
  };

  return (
    <View className="rounded-[30px] border border-[#E4EEF7] bg-white p-6 shadow-sm">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[#111827] text-[12px] font-black uppercase tracking-widest">
            {formatEventDate(event.startTime)} - {formatEventTime(event.startTime)}
          </Text>
          <Text className="mt-3 text-[#050817] text-2xl font-black leading-7" numberOfLines={3}>
            {event.title}
          </Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: tone.pillBg }]}>
          <Text style={[styles.typeBadgeText, { color: tone.color }]}>{tone.label}</Text>
        </View>
      </View>

      <View className="mt-7 flex-row items-center gap-3">
        <MaterialIcons name="place" size={20} color="var(--c-muted)" />
        <Text className="flex-1 text-[#6B7280] text-base font-semibold" numberOfLines={1}>
          {event.location || event.teamName || 'Club court'}
        </Text>
      </View>

      <View className="mt-8 h-px bg-[#E5EAF1]" />

      <View className="mt-5 flex-row items-center justify-between gap-4">
        <View className="flex-row items-center gap-2">
          {event.type === 'training' ? (
            <MaterialIcons name="check-circle-outline" size={24} color="var(--c-brand-fg)" />
          ) : (
            <>
              <View className="h-9 w-9 rounded-full bg-[#0A2C93] items-center justify-center border-2 border-white">
                <Text className="text-white text-[11px] font-black">VS</Text>
              </View>
              <View className="-ml-3 h-9 w-9 rounded-full bg-[#007A99] items-center justify-center border-2 border-white">
                <MaterialIcons name={tone.icon} size={17} color="#FFFFFF" />
              </View>
            </>
          )}
          {event.type === 'training' ? (
            <Text className="text-[#006092] font-black">Attending</Text>
          ) : (
            <Text className="text-[#64748B] text-xs font-black">+8</Text>
          )}
        </View>

        {event.type === 'training' ? (
          <MaterialIcons name="more-horiz" size={24} color="var(--c-muted)" />
        ) : (
          <Pressable
            onPress={handleAction}
            style={[styles.cardAction, primary ? styles.cardActionPrimary : styles.cardActionSecondary]}
          >
            <Text style={[styles.cardActionText, primary ? styles.cardActionTextPrimary : styles.cardActionTextSecondary]}>
              {actionLabel}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.metricCard, { backgroundColor: color }]}>
      <Text className="text-[#AFC4FF] text-[11px] font-black uppercase tracking-widest">{label}</Text>
      <Text className="mt-4 text-white text-3xl font-black">{value}</Text>
    </View>
  );
}

function AllEventRow({ event }: { event: CalendarEvent }) {
  const tone = toneForEvent(event.type);
  const dateBlock = formatDayBlock(event.startTime);

  return (
    <View className="rounded-[24px] border border-[#E4EEF7] bg-white px-4 py-4 md:px-5 flex-col md:flex-row md:items-center gap-4">
      <View className="w-[74px] h-[74px] rounded-[22px] bg-[#F0F6FC] items-center justify-center">
        <Text className="text-[#64748B] text-[11px] font-black uppercase tracking-widest">{dateBlock.month}</Text>
        <Text className="text-[#0A2C93] text-3xl font-black leading-9">{dateBlock.day}</Text>
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-[#050817] text-lg font-black" numberOfLines={1}>{event.title}</Text>
          <View style={[styles.typeBadgeSmall, { backgroundColor: tone.pillBg }]}>
            <Text style={[styles.typeBadgeTextSmall, { color: tone.color }]}>{tone.label}</Text>
          </View>
        </View>
        <View className="mt-3 flex-row flex-wrap gap-x-5 gap-y-2">
          <View className="flex-row items-center gap-2">
            <MaterialIcons name="schedule" size={17} color="var(--c-muted)" />
            <Text className="text-[#6B7280] font-semibold">{formatTimeRange(event.startTime, event.endTime)}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <MaterialIcons name="place" size={17} color="var(--c-muted)" />
            <Text className="text-[#6B7280] font-semibold" numberOfLines={1}>
              {event.location || event.teamName || 'Club court'}
            </Text>
          </View>
        </View>
      </View>

      <View className="md:items-end">
        <Text className="text-[#8EA1B8] text-[11px] font-black uppercase tracking-widest">{formatShortDate(event.startTime)}</Text>
        <Text className="mt-1 text-[#0E2041] font-black">{event.teamName || 'Team event'}</Text>
      </View>
    </View>
  );
}

export default function ScheduleScreen() {
  const { session } = useFirebaseAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<EventFilter>('all');
  const [eventsPage, setEventsPage] = useState(1);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => toDateKey(new Date()));
  const { width } = useWindowDimensions();

  const calendarCellHeight = width >= 1280 ? 150 : width >= 768 ? 128 : 96;
  const isCoach = normalizeRole(session?.role) === 'coach';

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

      const firstUpcoming = visibleEvents.find(isUpcoming) ?? visibleEvents[0] ?? null;
      const firstUpcomingDate = firstUpcoming ? getEventDate(firstUpcoming.startTime) : null;

      setEvents(visibleEvents);
      if (firstUpcomingDate) {
        setViewDate(startOfMonth(firstUpcomingDate));
        setSelectedDayKey(toDateKey(firstUpcomingDate));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load schedule.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isCoach, session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEvents = useMemo(
    () => events.filter((event) => eventMatchesFilter(event, activeFilter)),
    [activeFilter, events]
  );

  const eventsPageCount = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PAGE_SIZE));
  const safeEventsPage = Math.min(eventsPage, eventsPageCount);
  const eventsPageStart = (safeEventsPage - 1) * EVENTS_PAGE_SIZE;
  const paginatedEvents = filteredEvents.slice(eventsPageStart, eventsPageStart + EVENTS_PAGE_SIZE);
  const visibleEventsStart = filteredEvents.length ? eventsPageStart + 1 : 0;
  const visibleEventsEnd = Math.min(eventsPageStart + EVENTS_PAGE_SIZE, filteredEvents.length);

  useEffect(() => {
    setEventsPage(1);
  }, [activeFilter]);

  useEffect(() => {
    setEventsPage((currentPage) => Math.min(currentPage, eventsPageCount));
  }, [eventsPageCount]);

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

  const upcomingEvents = useMemo(
    () => filteredEvents.filter(isUpcoming).sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b)),
    [filteredEvents]
  );

  const nextMatch = useMemo(
    () => upcomingEvents.find((event) => event.type === 'match') ?? null,
    [upcomingEvents]
  );

  const monthEventCount = calendarDays.reduce((total, day) => total + day.events.length, 0);
  const visibleUpcomingCards = upcomingEvents.slice(0, 3);
  const pageTitle = isCoach ? 'Coach Schedule' : 'My Schedule';
  const pageSubtitle = isCoach ? (session?.clubName || 'Coach calendar') : (session?.teamName || session?.clubName || 'Team calendar');

  return (
    <ScrollView className="flex-1 bg-[#EEF7FF]" contentContainerClassName="px-4 md:px-10 py-7 md:py-10 pb-20">
      <View className="w-full max-w-7xl mx-auto">
        <View className="flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <View className="flex-1">
            <Text className="text-[#0A2C93] text-4xl md:text-5xl font-black tracking-tight">{pageTitle}</Text>
            <View className="mt-5 flex-row flex-wrap items-center gap-3">
              <View className="h-10 w-10 rounded-xl bg-white items-center justify-center border border-[#DDE8F5]">
                <MaterialIcons name="calendar-today" size={22} color="#1E2C43" />
              </View>
              <Text className="text-[#1E293B] text-lg md:text-xl font-semibold">{formatMonthRange(viewDate)}</Text>
              <Text className="text-[#8EA1B8] text-sm font-black uppercase tracking-widest">{pageSubtitle}</Text>
            </View>
          </View>

          <View className="flex-row flex-wrap items-center gap-3">
            {FILTERS.map((filter) => (
              <FilterChip
                key={filter.key}
                filter={filter}
                active={activeFilter === filter.key}
                onPress={() => setActiveFilter(filter.key)}
              />
            ))}
            <Pressable onPress={() => loadData(true)} className="h-[52px] w-[52px] rounded-full bg-white border border-[#BED0E5] items-center justify-center">
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={23} color="var(--c-brand-fg)" />}
            </Pressable>
          </View>
        </View>

        {error ? (
          <View className="mb-6 rounded-[24px] border border-red-100 bg-white px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="error-outline" size={22} color="var(--c-danger)" />
            <Text className="flex-1 text-red-600 font-bold">{error}</Text>
          </View>
        ) : null}

        <View className="flex-col xl:flex-row gap-8">
          <View className="flex-1 min-w-0 gap-8">
            <View className="overflow-hidden rounded-[34px] border border-[#DDE8F5] bg-white shadow-sm">
              <View className="px-5 md:px-8 py-6 flex-row items-center justify-between">
                <View>
                  <Text className="text-[#050817] text-2xl md:text-3xl font-black">{formatMonth(viewDate)}</Text>
                  <Text className="mt-1 text-[#8EA1B8] text-[11px] font-black uppercase tracking-widest">
                    {monthEventCount} events this month
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => setViewDate((current) => addMonths(current, -1))}
                    className="h-11 w-11 rounded-full items-center justify-center"
                  >
                    <MaterialIcons name="chevron-left" size={30} color="var(--c-ink-strong)" />
                  </Pressable>
                  <Pressable
                    onPress={() => setViewDate((current) => addMonths(current, 1))}
                    className="h-11 w-11 rounded-full items-center justify-center"
                  >
                    <MaterialIcons name="chevron-right" size={30} color="var(--c-ink-strong)" />
                  </Pressable>
                </View>
              </View>

              <View className="h-px bg-[#E5EAF1]" />

              <View className="flex-row bg-white">
                {WEEKDAYS.map((day) => (
                  <View key={day} style={styles.weekdayCell}>
                    <Text className="text-[#6B7280] text-[12px] font-black uppercase tracking-widest">{day}</Text>
                  </View>
                ))}
              </View>

              {loading ? (
                <View className="min-h-[390px] items-center justify-center">
                  <ActivityIndicator size="large" color="var(--c-brand-fg)" />
                </View>
              ) : (
                <View className="flex-row flex-wrap">
                  {calendarDays.map((day, index) => (
                    <CalendarCell
                      key={day.key}
                      day={day}
                      index={index}
                      isLastRow={index >= calendarDays.length - 7}
                      cellHeight={calendarCellHeight}
                      onSelect={setSelectedDayKey}
                    />
                  ))}
                </View>
              )}
            </View>

            <View className="rounded-[30px] border border-[#DDE8F5] bg-white p-5 md:p-6">
              <View className="mb-5 flex-row flex-wrap items-center justify-between gap-4">
                <View>
                  <Text className="text-[#050817] text-2xl md:text-3xl font-black">All events</Text>
                  <Text className="mt-1 text-[#8EA1B8] text-[11px] font-black uppercase tracking-widest">
                    {filteredEvents.length} total
                  </Text>
                </View>
                <View className="flex-row flex-wrap items-center justify-end gap-3">
                  <View className="h-11 rounded-full bg-[#F0F6FC] px-5 items-center justify-center">
                    <Text className="text-[#0A2C93] font-black">{FILTERS.find((filter) => filter.key === activeFilter)?.label}</Text>
                  </View>
                  {filteredEvents.length > EVENTS_PAGE_SIZE ? (
                    <View className="flex-row items-center gap-2">
                      <PaginationButton
                        icon="chevron-left"
                        label="Previous events page"
                        disabled={safeEventsPage <= 1}
                        onPress={() => setEventsPage((page) => Math.max(1, page - 1))}
                      />
                      <View className="h-11 min-w-[92px] rounded-full bg-white border border-[#DDE8F5] px-4 items-center justify-center">
                        <Text className="text-[#0E2041] font-black">{safeEventsPage} / {eventsPageCount}</Text>
                      </View>
                      <PaginationButton
                        icon="chevron-right"
                        label="Next events page"
                        disabled={safeEventsPage >= eventsPageCount}
                        onPress={() => setEventsPage((page) => Math.min(eventsPageCount, page + 1))}
                      />
                    </View>
                  ) : null}
                </View>
              </View>

              {loading ? (
                <View className="py-12 items-center justify-center">
                  <ActivityIndicator size="large" color="var(--c-brand-fg)" />
                </View>
              ) : filteredEvents.length ? (
                <View className="gap-4">
                  <Text className="text-[#64748B] text-sm font-bold">
                    Showing {visibleEventsStart}-{visibleEventsEnd} of {filteredEvents.length}
                  </Text>
                  <View className="gap-3">
                    {paginatedEvents.map((event) => (
                      <AllEventRow key={event.id} event={event} />
                    ))}
                  </View>
                </View>
              ) : (
                <EmptyState message="No events found for this filter." />
              )}
            </View>
          </View>

          <View className="w-full xl:w-[380px] gap-7">
            <View className="flex-row items-center justify-between">
              <Text className="text-[#050817] text-2xl font-black">Upcoming Events</Text>
              <Pressable onPress={() => setActiveFilter('all')}>
                <Text className="text-[#0A2C93] font-black">View All</Text>
              </Pressable>
            </View>

            {loading ? (
              <View className="rounded-[30px] bg-white border border-[#DDE8F5] min-h-[220px] items-center justify-center">
                <ActivityIndicator size="large" color="var(--c-brand-fg)" />
              </View>
            ) : visibleUpcomingCards.length ? (
              visibleUpcomingCards.map((event, index) => (
                <UpcomingEventCard key={event.id} event={event} primary={index === 0} />
              ))
            ) : (
              <EmptyState message="No upcoming events found." />
            )}

            <View className="flex-row gap-4">
              <MiniMetric label="Upcoming" value={String(upcomingEvents.length)} color="#2949B9" />
              <MiniMetric label="Next match" value={getNextMatchLabel(nextMatch)} color="#007A99" />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterChip: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#2BB6F6',
    borderColor: '#2BB6F6',
    shadowColor: 'var(--c-brand-fg)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  filterChipIdle: {
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderColor: '#BED0E5',
  },
  filterChipText: {
    fontSize: 16,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: '#06385F',
  },
  filterChipTextIdle: {
    color: 'var(--c-ink-strong)',
  },
  weekdayCell: {
    width: `${100 / 7}%`,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'var(--c-border)',
  },
  calendarCell: {
    width: `${100 / 7}%`,
    padding: 12,
    borderColor: 'var(--c-border)',
    backgroundColor: 'var(--c-surface)',
  },
  calendarCellSelected: {
    borderColor: 'var(--c-brand-fg)',
    borderWidth: 2,
  },
  dayNumber: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberActive: {
    backgroundColor: 'var(--c-brand-surface-deep)',
  },
  dayNumberText: {
    color: 'var(--c-ink-strong)',
    fontSize: 16,
    fontWeight: '800',
  },
  dayNumberTextActive: {
    color: '#FFFFFF',
  },
  calendarEventPill: {
    borderLeftWidth: 4,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  calendarEventText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  typeBadge: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  typeBadgeSmall: {
    minHeight: 25,
    borderRadius: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeTextSmall: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cardAction: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cardActionPrimary: {
    backgroundColor: 'var(--c-brand-surface-deep)',
    borderColor: 'var(--c-brand-fg)',
  },
  cardActionSecondary: {
    backgroundColor: 'var(--c-surface)',
    borderColor: 'var(--c-brand-fg)',
  },
  cardActionText: {
    fontSize: 15,
    fontWeight: '900',
  },
  cardActionTextPrimary: {
    color: '#FFFFFF',
  },
  cardActionTextSecondary: {
    color: 'var(--c-brand-fg)',
  },
  metricCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 28,
    padding: 20,
    justifyContent: 'center',
  },
  paginationButton: {
    height: 44,
    width: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#BED0E5',
    backgroundColor: 'var(--c-surface)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationButtonDisabled: {
    backgroundColor: 'var(--c-surface-2)',
    borderColor: 'var(--c-border)',
  },
});
