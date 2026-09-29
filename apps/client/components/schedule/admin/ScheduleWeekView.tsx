import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from '@/src/web/reactNative';
import { Plus } from 'lucide-react';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import {
  addDays, toDateKey, isSameDay, EVENT_TYPE_META, eventMatchesSearch,
  isCancelledEvent, sortByStartTime, formatTimeRange,
} from '../scheduleShared';
import { ScheduleFilters } from '../../../hooks/useAdminScheduleData';
import { Skeleton } from '../../ui/Skeleton';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
// Cap events per day column so a busy day doesn't stretch the whole week grid.
const WEEK_MAX_VISIBLE = 6;

function formatStart(iso: string) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Week view. The week itself (and its ‹ › / "azi" navigation) is owned by the
 * page toolbar, the same control that steps months in the month view — the
 * view used to carry its own 32px-radius header with a second set of arrows.
 *
 * Phones: seven day rows stacked vertically (a 7×220px horizontal scroller
 * showed two columns at a time and hid the rest of the week).
 * Desktop: a seven-column grid.
 */
export function ScheduleWeekView({
  weekStart,
  filters,
  searchQuery,
  showCancelled,
  onSelectEvent,
  onQuickAdd,
  onCountChange,
  isMobile,
}: {
  weekStart: Date;
  filters: ScheduleFilters;
  searchQuery: string;
  showCancelled: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onQuickAdd: (date: Date) => void;
  onCountChange?: (count: number) => void;
  isMobile: boolean;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const weekKey = toDateKey(weekStart);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const start = new Date(weekStart);
    const end = addDays(start, 7);
    eventsApi.getEvents({
      start: start.toISOString(),
      end: end.toISOString(),
      type: filters.type || undefined,
      coachId: filters.coachId || undefined,
      teamId: filters.teamId || undefined,
    })
      .then((data) => { if (!cancelled) setEvents(data); })
      .catch((err) => console.error('Fetch week events error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // weekKey stands in for weekStart (a new Date object every render upstream).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, filters.type, filters.coachId, filters.teamId]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekKey],
  );

  const eventsByDay = useMemo(() => {
    const visible = events
      .filter((event) => showCancelled || !isCancelledEvent(event))
      .filter((event) => eventMatchesSearch(event, searchQuery));
    const map = new Map<string, CalendarEvent[]>();
    weekDays.forEach((day) => {
      const key = toDateKey(day);
      map.set(key, sortByStartTime(visible.filter((event) => toDateKey(new Date(event.startTime)) === key)));
    });
    return map;
  }, [events, weekDays, showCancelled, searchQuery]);

  const total = useMemo(() => [...eventsByDay.values()].reduce((sum, list) => sum + list.length, 0), [eventsByDay]);
  useEffect(() => {
    if (!loading) onCountChange?.(total);
  }, [total, loading, onCountChange]);

  const today = new Date();
  const todayKey = toDateKey(today);

  const cardStyle = { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any;

  if (isMobile) {
    return (
      <View className="ui-rise rounded-[16px] border overflow-hidden" style={cardStyle}>
        {weekDays.map((day, index) => {
          const key = toDateKey(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          return (
            <View
              key={key}
              className={`flex-row gap-3 px-3.5 py-3 ${index > 0 ? 'border-t' : ''}`}
              style={{
                borderColor: 'var(--c-border-soft)',
                backgroundColor: isToday ? 'var(--c-surface-tint)' : undefined,
              } as any}
            >
              <View className="w-10 items-center shrink-0" style={{ opacity: isPast ? 0.55 : 1 }}>
                <Text className="t-eyebrow" style={{ color: isToday ? 'var(--c-brand-fg)' : 'var(--c-faint)' }}>
                  {WEEKDAY_LABELS[index]}
                </Text>
                <View
                  className="w-8 h-8 rounded-full items-center justify-center mt-1"
                  style={{ backgroundColor: isToday ? 'var(--c-brand-surface)' : 'transparent' }}
                >
                  <Text className="t-num text-[15px] font-bold" style={{ color: isToday ? 'var(--c-on-brand)' : 'var(--c-ink)' }}>
                    {day.getDate()}
                  </Text>
                </View>
              </View>

              <View className="flex-1 min-w-0 justify-center gap-1.5">
                {loading ? (
                  <Skeleton className="h-9 rounded-[10px]" />
                ) : dayEvents.length === 0 ? (
                  <View className="flex-row items-center justify-between min-h-[40px]">
                    <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>Liber</Text>
                    {!isPast ? (
                      <TouchableOpacity
                        onPress={() => onQuickAdd(day)}
                        accessibilityLabel={`Adaugă eveniment ${day.getDate()}`}
                        className="ui-press w-8 h-8 rounded-[9px] items-center justify-center border"
                        style={{ borderColor: 'var(--c-border)', borderStyle: 'dashed' } as any}
                      >
                        <Plus size={15} color="var(--c-faint)" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  dayEvents.map((event) => <WeekEventChip key={event.id} event={event} onPress={() => onSelectEvent(event)} />)
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View className="ui-rise rounded-[16px] border overflow-hidden" style={cardStyle}>
      <View className="flex-row">
        {weekDays.map((day, index) => {
          const key = toDateKey(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = isSameDay(day, today);
          return (
            <View
              key={key}
              className={`group flex-1 min-w-0 ${index < 6 ? 'border-r' : ''}`}
              style={{ borderColor: 'var(--c-border-soft)', backgroundColor: isToday ? 'var(--c-surface-tint)' : undefined } as any}
            >
              <View className="px-2 py-2.5 border-b flex-row items-center justify-center gap-2" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                <Text className="t-eyebrow" style={{ color: isToday ? 'var(--c-brand-fg)' : 'var(--c-faint)' }}>{WEEKDAY_LABELS[index]}</Text>
                <View
                  className="min-w-[26px] h-[26px] px-1 rounded-full items-center justify-center"
                  style={{ backgroundColor: isToday ? 'var(--c-brand-surface)' : 'transparent' }}
                >
                  <Text className="t-num text-[13.5px] font-bold" style={{ color: isToday ? 'var(--c-on-brand)' : 'var(--c-ink)' }}>
                    {day.getDate()}
                  </Text>
                </View>
              </View>

              <View className="p-1.5 gap-1.5" style={{ minHeight: 280 }}>
                {loading ? (
                  <>
                    <Skeleton className="h-12 rounded-[10px]" />
                    <Skeleton className="h-12 rounded-[10px]" />
                  </>
                ) : (
                  <>
                    {dayEvents.slice(0, WEEK_MAX_VISIBLE).map((event) => (
                      <WeekEventChip key={event.id} event={event} stacked onPress={() => onSelectEvent(event)} />
                    ))}
                    {dayEvents.length > WEEK_MAX_VISIBLE ? (
                      <Text className="text-[11px] font-semibold text-center py-1" style={{ color: 'var(--c-faint)' }}>
                        +{dayEvents.length - WEEK_MAX_VISIBLE} încă
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => onQuickAdd(day)}
                      accessibilityLabel={`Adaugă eveniment ${day.getDate()}`}
                      className="h-8 rounded-[9px] items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--c-surface-2)]"
                    >
                      <Plus size={15} color="var(--c-faint)" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function WeekEventChip({ event, stacked, onPress }: { event: CalendarEvent; stacked?: boolean; onPress: () => void }) {
  const meta = EVENT_TYPE_META[event.type] ?? EVENT_TYPE_META.admin;
  const cancelled = isCancelledEvent(event);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={event.title}
      className={`ui-press rounded-[10px] px-2.5 py-2 ${stacked ? '' : 'flex-row items-center gap-2'} ${cancelled ? 'opacity-50' : ''}`}
      style={{ backgroundColor: meta.soft }}
    >
      {stacked ? (
        <>
          <Text className="t-num text-[11px] font-semibold" style={{ color: meta.onSoft }}>
            {formatTimeRange(event.startTime, event.endTime)}
          </Text>
          <Text numberOfLines={2} className={`text-[12px] font-semibold leading-[15px] mt-0.5 ${cancelled ? 'line-through' : ''}`} style={{ color: 'var(--c-ink)' }}>
            {event.title}
          </Text>
        </>
      ) : (
        <>
          <Text className="t-num text-[12px] font-bold shrink-0" style={{ color: meta.onSoft }}>{formatStart(event.startTime)}</Text>
          <Text numberOfLines={1} className={`text-[13px] font-semibold flex-1 min-w-0 ${cancelled ? 'line-through' : ''}`} style={{ color: 'var(--c-ink)' }}>
            {event.title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}
