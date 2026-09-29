import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from '@/src/web/reactNative';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, CalendarDayCell, getMonthGridDays, groupEventsByDay, isCancelledEvent } from '../scheduleShared';

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIE', 'JOI', 'VIN', 'SÂM', 'DUM'];

export const CalendarLegend = React.memo(() => (
  <View className="flex-row flex-wrap items-center gap-5 px-1">
    {(Object.keys(EVENT_TYPE_META) as (keyof typeof EVENT_TYPE_META)[]).map((type) => (
      <View key={type} className="flex-row items-center gap-2">
        <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: EVENT_TYPE_META[type].solid }} />
        <Text className="text-[10px] font-black uppercase tracking-widest text-slate-500">{EVENT_TYPE_META[type].label}</Text>
      </View>
    ))}
  </View>
));
CalendarLegend.displayName = 'CalendarLegend';

const WeekdayHeader = React.memo(() => (
  <View className="flex-row border-b" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
    {WEEKDAY_LABELS.map((day) => (
      <View key={day} className="flex-1 py-2.5 items-center">
        <Text className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--c-muted)' }}>{day}</Text>
      </View>
    ))}
  </View>
));
WeekdayHeader.displayName = 'WeekdayHeader';

/**
 * Phone cell: a ~50px column can't hold event titles (they rendered as "A…",
 * "Pr…"), so the day shows its number plus one dot per event type, and the
 * WHOLE cell is a single tap target that opens that day's list.
 */
const CompactCalendarCell = React.memo(({
  dayData,
  onSelectDay,
}: {
  dayData: CalendarDayCell;
  onSelectDay: () => void;
}) => {
  const activeEvents = dayData.events.filter((event) => !isCancelledEvent(event));
  const types = Array.from(new Set(activeEvents.map((e) => e.type))).slice(0, 3);
  const hasMatch = activeEvents.some((e) => e.type === 'match');

  return (
    <TouchableOpacity
      onPress={onSelectDay}
      disabled={!activeEvents.length}
      accessibilityLabel={`${dayData.dayNumber}: ${activeEvents.length} ${activeEvents.length === 1 ? 'eveniment' : 'evenimente'}`}
      className="ui-press items-center justify-start pt-2"
      style={{
        width: '14.28%',
        height: 58,
        borderWidth: 0.5,
        borderColor: 'var(--c-border-soft)',
        backgroundColor: hasMatch && !dayData.isToday ? 'var(--c-surface-2)' : 'transparent',
      } as any}
    >
      <View
        className="w-7 h-7 rounded-full items-center justify-center"
        style={dayData.isToday
          ? { backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any
          : undefined}
      >
        <Text
          className="text-[13px] font-semibold"
          style={{ color: dayData.isToday ? 'var(--c-on-brand)' : activeEvents.length ? 'var(--c-ink)' : 'var(--c-faint)' }}
        >
          {dayData.dayNumber}
        </Text>
      </View>
      <View className="flex-row gap-[3px] mt-1.5 h-[6px] items-center">
        {types.map((type) => (
          <View key={type} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: EVENT_TYPE_META[type].solid }} />
        ))}
      </View>
    </TouchableOpacity>
  );
});
CompactCalendarCell.displayName = 'CompactCalendarCell';

const CalendarCell = React.memo(({
  dayData,
  cellHeight,
  onSelectEvent,
  onSelectDay,
  compact = false,
}: {
  dayData: CalendarDayCell;
  cellHeight: number;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: () => void;
  compact?: boolean;
}) => {
  if (dayData.dayNumber === null) {
    return (
      <View
        style={{ width: '14.28%', height: compact ? 58 : cellHeight, borderWidth: 0.5, borderColor: 'var(--c-border-soft)', backgroundColor: 'var(--c-surface-2)' } as any}
      />
    );
  }

  if (compact) {
    return <CompactCalendarCell dayData={dayData} onSelectDay={onSelectDay} />;
  }

  const activeEvents = dayData.events.filter((event) => !isCancelledEvent(event));
  const maxVisible = cellHeight >= 100 ? 3 : 2;
  const visibleEvents = activeEvents.slice(0, maxVisible);
  const overflow = activeEvents.length - maxVisible;
  const isBusy = activeEvents.length >= 4;

  return (
    // NOTE: this is a plain View (not a Pressable/TouchableOpacity) — the day
    // number badge and event pills below are each individually pressable.
    // Wrapping the whole cell in one more button would nest interactive
    // elements inside each other, which is invalid HTML and breaks web
    // hydration (buttons can't contain buttons).
    <View
      style={{ width: '14.28%', height: cellHeight }}
      className={`border-[0.5px] border-[#EDF2F9] px-1.5 py-1.5 relative overflow-hidden transition-colors ${
        dayData.isToday ? 'bg-[#EAF2FF]' : isBusy ? 'bg-[#FAFCFF]' : 'bg-white'
      } hover:bg-[#F4F8FD]`}
    >
      {dayData.isToday && (
        <View className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1D3E90]" />
      )}

      {/* Day number badge — also opens the day schedule */}
      <TouchableOpacity onPress={onSelectDay} activeOpacity={0.7} className="flex-row items-center justify-between mb-1">
        <View
          className={`w-6 h-6 rounded-full items-center justify-center ${dayData.isToday ? 'bg-[#1D3E90]' : ''}`}
          style={dayData.isToday ? { boxShadow: '0 2px 6px rgba(29,62,144,0.35)' } as any : undefined}
        >
          <Text className={`font-black text-[11px] ${dayData.isToday ? 'text-white' : 'text-slate-500'}`}>
            {dayData.dayNumber}
          </Text>
        </View>
        {activeEvents.length > 0 && (
          <View className="flex-row gap-[3px]">
            {Array.from(new Set(activeEvents.map((e) => e.type))).slice(0, 3).map((type) => (
              <View
                key={type}
                style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: EVENT_TYPE_META[type].solid }}
              />
            ))}
          </View>
        )}
      </TouchableOpacity>

      {/* Events list */}
      <View className="gap-[3px]">
        {visibleEvents.map((event) => {
          const meta = EVENT_TYPE_META[event.type];
          const isMatch = event.type === 'match';
          return (
            <TouchableOpacity
              key={event.id}
              onPress={() => onSelectEvent(event)}
              activeOpacity={0.75}
              className="hover:opacity-80"
              style={{
                borderRadius: 7,
                paddingHorizontal: 6,
                paddingVertical: 3,
                backgroundColor: isMatch ? meta.solid : meta.soft,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  color: isMatch ? meta.onSolid : meta.onSoft,
                }}
              >
                {event.title}
              </Text>
            </TouchableOpacity>
          );
        })}
        {overflow > 0 && (
          <TouchableOpacity onPress={onSelectDay} activeOpacity={0.7} className="self-start mt-[1px]">
            <View className="bg-slate-100 rounded-full px-2 py-[2px]">
              <Text style={{ fontSize: 9, fontWeight: '800', color: 'var(--c-muted)' }}>
                +{overflow} încă
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});
CalendarCell.displayName = 'CalendarCell';

/**
 * Renders the month grid. Cell height is derived from the viewport so the
 * grid is always compact and never stretches past the visible area.
 */
export const MonthlyCalendarGrid = React.memo(({
  currentDate,
  events,
  onSelectEvent,
  onSelectDay,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (dayData: { date: Date; events: CalendarEvent[] }) => void;
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  // On phones a 7-column grid gives a raw cell width well under 60px — sizing
  // the cell height to match that (as if the cell were square) leaves no room
  // for the day badge plus event pills, which then get clipped by
  // overflow-hidden. Floor the height so day cells stay legible and scroll
  // vertically with the rest of the page instead.
  const cellHeight = isDesktop ? 118 : 92;

  const calendarDays = useMemo(() => {
    const eventsByDay = groupEventsByDay(events);
    return getMonthGridDays(currentDate, eventsByDay);
  }, [currentDate, events]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          backgroundColor: 'var(--c-surface)',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'var(--c-border)',
          overflow: 'hidden',
          boxShadow: 'var(--e-sm)',
        } as any}
      >
        <WeekdayHeader />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
          {calendarDays.map((dayData) => (
            <CalendarCell
              key={dayData.key}
              dayData={dayData}
              cellHeight={cellHeight}
              compact={!isDesktop}
              onSelectEvent={onSelectEvent}
              onSelectDay={() => dayData.date && onSelectDay({
                date: dayData.date,
                events: [...dayData.events].sort(
                  (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                ),
              })}
            />
          ))}
        </View>
      </View>
    </View>
  );
});
MonthlyCalendarGrid.displayName = 'MonthlyCalendarGrid';
