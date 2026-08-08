import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from '@/src/web/reactNative';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import {
  startOfWeek, addDays, toDateKey, isSameDay, EVENT_TYPE_META,
  isCancelledEvent, sortByStartTime, formatTimeRange, RO_LOCALE,
} from '../scheduleShared';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
const WEEK_MAX_VISIBLE = 6;

/**
 * Read-only week view, mirroring admin's ScheduleWeekView layout/tokens but
 * built on already-loaded events (the player's own event set is small — no
 * need for a separate per-week fetch) and with no quick-add affordance.
 */
export function PlayerScheduleWeekView({
  events,
  onSelectEvent,
  isMobile,
}: {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  isMobile: boolean;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const eventsByDay = useMemo(() => {
    const visible = sortByStartTime(events);
    const map = new Map<string, CalendarEvent[]>();
    weekDays.forEach((day) => {
      const key = toDateKey(day);
      map.set(key, visible.filter((event) => toDateKey(new Date(event.startTime)) === key));
    });
    return map;
  }, [events, weekDays]);

  const rangeLabel = `${weekStart.toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <View className="rounded-[24px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
      <View className="px-5 py-4 flex-row items-center justify-between border-b" style={{ borderColor: 'var(--c-border)' }}>
        <View>
          <Text className="text-[17px] font-black" style={{ color: 'var(--c-ink-strong)' }}>{rangeLabel}</Text>
          <Text className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: 'var(--c-faint)' }}>Vedere săptămânală</Text>
        </View>
        {/* Same 36px control size as the toolbar's IconButton, so the week
            view's stepper reads as the same family as the month stepper. */}
        <View className="flex-row items-center gap-1.5">
          <TouchableOpacity
            onPress={() => setWeekStart((d) => addDays(d, -7))}
            accessibilityLabel="Săptămâna anterioară"
            className="w-9 h-9 rounded-[10px] items-center justify-center border border-[var(--c-border)] bg-[var(--c-surface)]"
          >
            <ChevronLeft color="var(--c-ink-soft)" size={16} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setWeekStart(startOfWeek(new Date()))}
            accessibilityLabel="Mergi la săptămâna curentă"
            className="h-9 px-3 items-center justify-center rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)]"
          >
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Azi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setWeekStart((d) => addDays(d, 7))}
            accessibilityLabel="Săptămâna următoare"
            className="w-9 h-9 rounded-[10px] items-center justify-center border border-[var(--c-border)] bg-[var(--c-surface)]"
          >
            <ChevronRight color="var(--c-ink-soft)" size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {isMobile ? (
        // Vertical day-by-day stack — a 7-column grid can't fit a 320px
        // screen without horizontal scrolling, which the mobile layout
        // avoids everywhere else.
        <View>
          {weekDays.map((day, index) => {
            const key = toDateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const today = isSameDay(day, new Date());

            return (
              <View
                key={key}
                className={index < 6 ? 'border-b' : ''}
                style={{ borderColor: 'var(--c-border)', backgroundColor: today ? 'var(--c-surface-tint)' : undefined }}
              >
                <View className="px-4 py-2.5 flex-row items-center gap-2.5">
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={today ? { backgroundColor: 'var(--c-brand-surface-deep)' } : undefined}
                  >
                    <Text className="font-black text-[13px]" style={{ color: today ? 'var(--c-surface)' : 'var(--c-ink-soft)' }}>{day.getDate()}</Text>
                  </View>
                  <Text className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--c-faint)' }}>
                    {day.toLocaleDateString(RO_LOCALE, { weekday: 'long' })}
                  </Text>
                </View>

                {dayEvents.length ? (
                  <View className="px-4 pb-3 gap-1.5">
                    {dayEvents.map((event) => {
                      const meta = EVENT_TYPE_META[event.type];
                      const cancelled = isCancelledEvent(event);
                      return (
                        <TouchableOpacity
                          key={event.id}
                          onPress={() => onSelectEvent(event)}
                          activeOpacity={0.8}
                          style={{ borderLeftWidth: 3, borderLeftColor: meta.border, backgroundColor: meta.soft, minHeight: 44 }}
                          className={`rounded-xl px-3 py-2 justify-center ${cancelled ? 'opacity-50' : ''}`}
                        >
                          <Text numberOfLines={1} className={`text-[12px] font-black ${cancelled ? 'line-through' : ''}`} style={{ color: meta.onSoft }}>
                            {event.title}
                          </Text>
                          <Text className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--c-muted)' }}>{formatTimeRange(event.startTime, event.endTime)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View className="flex-row flex-1">
          {weekDays.map((day, index) => {
            const key = toDateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const today = isSameDay(day, new Date());

            return (
              <View
                key={key}
                style={{ borderColor: 'var(--c-border)', ...(today ? { backgroundColor: 'var(--c-surface-tint)' } : {}) }}
                className={`flex-1 ${index < 6 ? 'border-r' : ''}`}
              >
                <View className="px-2 py-3 border-b items-center" style={{ borderColor: 'var(--c-border)' }}>
                  <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--c-faint)' }}>{WEEKDAY_LABELS[index]}</Text>
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center mt-1"
                    style={today ? { backgroundColor: 'var(--c-brand-surface-deep)' } : undefined}
                  >
                    <Text className="font-black text-[13px]" style={{ color: today ? 'var(--c-surface)' : 'var(--c-ink-soft)' }}>{day.getDate()}</Text>
                  </View>
                </View>

                <View className="p-2 gap-1.5" style={{ minHeight: 180 }}>
                  {dayEvents.slice(0, WEEK_MAX_VISIBLE).map((event) => {
                    const meta = EVENT_TYPE_META[event.type];
                    const cancelled = isCancelledEvent(event);
                    return (
                      <TouchableOpacity
                        key={event.id}
                        onPress={() => onSelectEvent(event)}
                        activeOpacity={0.8}
                        style={{ borderLeftWidth: 3, borderLeftColor: meta.border, backgroundColor: meta.soft, minHeight: 40 }}
                        className={`rounded-xl px-2.5 py-2 justify-center ${cancelled ? 'opacity-50' : ''}`}
                      >
                        <Text numberOfLines={1} className={`text-[10px] font-black ${cancelled ? 'line-through' : ''}`} style={{ color: meta.onSoft }}>
                          {event.title}
                        </Text>
                        <Text className="text-[9px] font-bold mt-0.5" style={{ color: 'var(--c-muted)' }}>{formatTimeRange(event.startTime, event.endTime)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {dayEvents.length > WEEK_MAX_VISIBLE ? (
                    <View className="items-center py-1">
                      <Text className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--c-faint)' }}>
                        +{dayEvents.length - WEEK_MAX_VISIBLE} încă
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
