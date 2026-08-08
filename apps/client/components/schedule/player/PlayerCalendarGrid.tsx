import React from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from '@/src/web/reactNative';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, isCancelledEvent } from '../scheduleShared';
import { Skeleton } from '../../ui/Skeleton';

/*
 * The player month grid.
 *
 * A COPY of the admin MonthlyCalendarGrid's geometry (components/schedule/
 * admin/ScheduleCalendarGrid.tsx) — same 0.5px cell borders, same 118/92 row
 * rhythm, same 24px day badge, same radius-7 event chips. Duplicated rather
 * than shared so the admin file stays byte-identical.
 *
 * Two deliberate differences from admin:
 *   • it renders the player's SELECTED-day state, which the admin grid has no
 *     concept of;
 *   • pressing a day opens the read-only day sheet. There is no
 *     click-empty-day-to-create affordance anywhere in this file.
 */

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIE', 'JOI', 'VIN', 'SÂM', 'DUM'];

export type PlayerCalendarDay = {
  key: string;
  dayNumber: number | null;
  dateKey: string | null;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
};

const WeekdayHeader = React.memo(() => (
  <View className="flex-row border-b border-[#E6EEF8] bg-[#F8FBFF]">
    {WEEKDAY_LABELS.map((day, i) => (
      <View key={day} className={`flex-1 py-3 items-center ${i >= 5 ? 'bg-[#F4F8FD]' : ''}`}>
        <Text className="text-[10.5px] font-black text-[#7C90B0] uppercase tracking-[0.18em]">{day}</Text>
      </View>
    ))}
  </View>
));
WeekdayHeader.displayName = 'WeekdayHeader';

const CalendarCell = React.memo(({
  day,
  cellHeight,
  onSelectDay,
}: {
  day: PlayerCalendarDay;
  cellHeight: number;
  onSelectDay: (dateKey: string) => void;
}) => {
  if (day.dayNumber === null) {
    return (
      <View
        style={{ width: '14.28%', height: cellHeight }}
        className="border-[0.5px] border-[#EDF2F9] bg-[#FBFDFF]"
      />
    );
  }

  const activeEvents = day.events.filter((event) => !isCancelledEvent(event));
  const maxVisible = cellHeight >= 100 ? 3 : 2;
  const visibleEvents = activeEvents.slice(0, maxVisible);
  const overflow = activeEvents.length - maxVisible;
  const isBusy = activeEvents.length >= 4;
  const open = () => day.dateKey && onSelectDay(day.dateKey);

  return (
    // NOTE: plain View, not a Pressable — the day badge and the event pills are
    // each individually pressable. Wrapping the cell in one more button would
    // nest interactive elements, which is invalid HTML and breaks hydration.
    <View
      style={{ width: '14.28%', height: cellHeight }}
      className={`border-[0.5px] border-[#EDF2F9] px-1.5 py-1.5 relative overflow-hidden transition-colors ${
        day.isToday ? 'bg-[#EAF2FF]' : day.isSelected ? 'bg-[#F4F8FD]' : isBusy ? 'bg-[#FAFCFF]' : 'bg-white'
      } hover:bg-[#F4F8FD]`}
    >
      {day.isToday && <View className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1D3E90]" />}

      {/* Day number badge — also opens the day sheet */}
      <TouchableOpacity onPress={open} activeOpacity={0.7} className="flex-row items-center justify-between mb-1">
        <View
          className={`w-6 h-6 rounded-full items-center justify-center ${
            day.isToday ? 'bg-[#1D3E90]' : day.isSelected ? 'border border-[#1D3E90]' : ''
          }`}
          style={day.isToday ? { boxShadow: '0 2px 6px rgba(29,62,144,0.35)' } as any : undefined}
        >
          <Text
            className={`font-black text-[11px] ${
              day.isToday ? 'text-white' : day.isSelected ? 'text-[#1D3E90]' : 'text-slate-500'
            }`}
          >
            {day.dayNumber}
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
              onPress={open}
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
                style={{ fontSize: 10, fontWeight: '800', color: isMatch ? meta.onSolid : meta.onSoft }}
              >
                {event.title}
              </Text>
            </TouchableOpacity>
          );
        })}
        {overflow > 0 && (
          <TouchableOpacity onPress={open} activeOpacity={0.7} className="self-start mt-[1px]">
            <View className="bg-slate-100 rounded-full px-2 py-[2px]">
              <Text style={{ fontSize: 9, fontWeight: '800', color: 'var(--c-muted)' }}>+{overflow} încă</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});
CalendarCell.displayName = 'CalendarCell';

/**
 * Renders the month grid. Cell height is derived from the viewport so the grid
 * stays compact and never stretches past the visible area — same 118/92 as
 * admin.
 */
export const PlayerCalendarGrid = React.memo(({
  days,
  loading,
  onSelectDay,
}: {
  days: PlayerCalendarDay[];
  loading: boolean;
  onSelectDay: (dateKey: string) => void;
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  // On phones a 7-column grid gives a raw cell width well under 60px — sizing
  // the height to match would clip the badge plus pills under overflow-hidden.
  const cellHeight = isDesktop ? 118 : 92;

  return (
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
      {loading ? (
        // Same 7-column rhythm the calendar settles into, so the month view
        // keeps its height instead of collapsing to a spinner.
        <View className="flex-row flex-wrap" accessibilityRole="progressbar" accessibilityLabel="Se încarcă programul">
          {Array.from({ length: 35 }).map((_, index) => (
            <View
              key={index}
              style={{ width: '14.28%', height: cellHeight }}
              className="border-[0.5px] border-[#EDF2F9] px-1.5 py-1.5"
            >
              <Skeleton className="w-6 h-6 rounded-full" />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
          {days.map((day) => (
            <CalendarCell key={day.key} day={day} cellHeight={cellHeight} onSelectDay={onSelectDay} />
          ))}
        </View>
      )}
    </View>
  );
});
PlayerCalendarGrid.displayName = 'PlayerCalendarGrid';
