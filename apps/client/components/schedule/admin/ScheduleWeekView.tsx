import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from '@/src/web/reactNative';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import {
  startOfWeek, addDays, toDateKey, isSameDay, EVENT_TYPE_META, eventMatchesSearch,
  isCancelledEvent, sortByStartTime, formatTimeRange, RO_LOCALE,
} from '../scheduleShared';
import { ScheduleFilters } from '../../../hooks/useAdminScheduleData';
import { Skeleton } from '../../ui/Skeleton';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
// Cap events per day column so a busy day doesn't stretch the whole week grid.
const WEEK_MAX_VISIBLE = 8;

export function ScheduleWeekView({
  filters,
  searchQuery,
  showCancelled,
  onSelectEvent,
  onQuickAdd,
  isMobile,
}: {
  filters: ScheduleFilters;
  searchQuery: string;
  showCancelled: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onQuickAdd: (date: Date) => void;
  isMobile: boolean;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const end = addDays(weekStart, 7);
    eventsApi.getEvents({
      start: weekStart.toISOString(),
      end: end.toISOString(),
      type: filters.type || undefined,
      coachId: filters.coachId || undefined,
      teamId: filters.teamId || undefined,
    })
      .then((data) => { if (!cancelled) setEvents(data); })
      .catch((err) => console.error('Fetch week events error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart, filters.type, filters.coachId, filters.teamId]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

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

  const rangeLabel = `${weekStart.toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString(RO_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <View className="bg-white rounded-[32px] border border-[#DDE7F5] shadow-lg overflow-hidden">
      <View className="px-6 py-5 flex-row items-center justify-between border-b border-[#DDE7F5]">
        <View>
          <Text className="text-[22px] font-black text-[#0E2041]">{rangeLabel}</Text>
          <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Vedere săptămânală</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity onPress={() => setWeekStart((d) => addDays(d, -7))} className="w-10 h-10 items-center justify-center rounded-xl bg-[#F4F8FD]">
            <ChevronLeft color="var(--c-ink)" size={18} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekStart(startOfWeek(new Date()))} className="px-3 h-10 items-center justify-center rounded-xl bg-[#F4F8FD]">
            <Text className="text-[#1D3E90] text-[11px] font-black uppercase tracking-widest">Azi</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekStart((d) => addDays(d, 7))} className="w-10 h-10 items-center justify-center rounded-xl bg-[#F4F8FD]">
            <ChevronRight color="var(--c-ink)" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="flex-row">
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={label} className={`flex-1 ${i < 6 ? 'border-r border-[#E6EEF8]' : ''}`}>
              <View className="px-3 py-3 border-b border-[#E6EEF8] items-center gap-1.5">
                <Skeleton className="h-2.5 w-8" />
                <Skeleton className="w-7 h-7 rounded-full" />
              </View>
              <View className="p-2 gap-1.5" style={{ minHeight: 220 }}>
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 rounded-xl" />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={false}>
          <View className={isMobile ? 'flex-row' : 'flex-row flex-1'}>
            {weekDays.map((day, index) => {
              const key = toDateKey(day);
              const dayEvents = eventsByDay.get(key) ?? [];
              const today = isSameDay(day, new Date());

              return (
                <View
                  key={key}
                  style={isMobile ? { width: 220 } : undefined}
                  className={`flex-1 ${index < 6 ? 'border-r border-[#E6EEF8]' : ''} ${today ? 'bg-[#EAF2FF]' : ''}`}
                >
                  <View className="px-3 py-3 border-b border-[#E6EEF8] items-center">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">{WEEKDAY_LABELS[index]}</Text>
                    <View className={`w-7 h-7 rounded-full items-center justify-center mt-1 ${today ? 'bg-[#1D3E90]' : ''}`}>
                      <Text className={`font-black text-[13px] ${today ? 'text-white' : 'text-slate-700'}`}>{day.getDate()}</Text>
                    </View>
                  </View>

                  <View className="p-2 gap-1.5" style={{ minHeight: 220 }}>
                    {dayEvents.length === 0 ? (
                      <TouchableOpacity
                        onPress={() => onQuickAdd(day)}
                        className="items-center justify-center py-6 opacity-0 hover:opacity-100"
                      >
                        <Plus size={16} color="var(--c-faint)" />
                      </TouchableOpacity>
                    ) : (
                      <>
                        {dayEvents.slice(0, WEEK_MAX_VISIBLE).map((event) => {
                          const meta = EVENT_TYPE_META[event.type];
                          const cancelled = isCancelledEvent(event);
                          return (
                            <TouchableOpacity
                              key={event.id}
                              onPress={() => onSelectEvent(event)}
                              activeOpacity={0.8}
                              style={{ borderLeftWidth: 3, borderLeftColor: meta.border, backgroundColor: meta.soft }}
                              className={`rounded-xl px-2.5 py-2 ${cancelled ? 'opacity-50' : ''}`}
                            >
                              <Text numberOfLines={1} className={`text-[10px] font-black ${cancelled ? 'line-through' : ''}`} style={{ color: meta.onSoft }}>
                                {event.title}
                              </Text>
                              <Text className="text-[9px] font-bold text-slate-500 mt-0.5">{formatTimeRange(event.startTime, event.endTime)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        {dayEvents.length > WEEK_MAX_VISIBLE && (
                          <View className="items-center py-1">
                            <Text className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              +{dayEvents.length - WEEK_MAX_VISIBLE} încă
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

