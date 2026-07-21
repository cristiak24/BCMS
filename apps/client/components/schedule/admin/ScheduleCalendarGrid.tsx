import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from '@/src/web/reactNative';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, CalendarDayCell, getMonthGridDays, groupEventsByDay, isCancelledEvent } from '../scheduleShared';

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

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
  <View className="flex-row border-b border-[#E6EEF8] bg-[#F8FBFF]">
    {WEEKDAY_LABELS.map((day, i) => (
      <View
        key={day}
        className={`flex-1 py-3 items-center ${i >= 5 ? 'bg-[#F4F8FD]' : ''}`}
      >
        <Text className="text-[10.5px] font-black text-[#7C90B0] uppercase tracking-[0.18em]">{day}</Text>
      </View>
    ))}
  </View>
));
WeekdayHeader.displayName = 'WeekdayHeader';

const CalendarCell = React.memo(({
  dayData,
  cellHeight,
  onSelectEvent,
  onSelectDay,
}: {
  dayData: CalendarDayCell;
  cellHeight: number;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: () => void;
}) => {
  if (dayData.dayNumber === null) {
    return (
      <View
        style={{ width: '14.28%', height: cellHeight }}
        className="border-[0.5px] border-[#EDF2F9] bg-[#FBFDFF]"
      />
    );
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
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#64748B' }}>
                +{overflow} more
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
    <View style={{ paddingVertical: 16, flex: 1 }}>
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 32,
          borderWidth: 1,
          borderColor: '#DDE7F5',
          overflow: 'hidden',
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
          elevation: 5,
        }}
      >
        <WeekdayHeader />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
          {calendarDays.map((dayData) => (
            <CalendarCell
              key={dayData.key}
              dayData={dayData}
              cellHeight={cellHeight}
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
