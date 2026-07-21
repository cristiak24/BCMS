import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from '@/src/web/reactNative';
import { Calendar as CalendarIcon, Clock, Activity } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { sortByStartTime, isUpcomingEvent, EVENT_TYPE_META, isCancelledEvent } from '../scheduleShared';
import { ScheduleEventCard } from './ScheduleEventCard';

const PAGE_SIZE = 12;

function usePaginated(items: CalendarEvent[], resetKey: string) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  return { page: safePage, setPage, totalPages, paginated };
}

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (updater: (p: number) => number) => void }) {
  return (
    <View className="flex-row items-center justify-between bg-white rounded-[24px] border border-[#DDE7F5] p-4 mb-6">
      <Text className="text-slate-500 font-black text-[12px] uppercase tracking-widest">Page {page + 1} of {totalPages}</Text>
      <View className="flex-row gap-2">
        <TouchableOpacity
          disabled={page === 0}
          onPress={() => setPage((p) => Math.max(p - 1, 0))}
          className={`px-4 py-2 rounded-full border ${page === 0 ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-white border-[#CFE0EF]'}`}
        >
          <Text className="text-[#1D3E90] text-[11px] font-black uppercase tracking-widest">Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={page >= totalPages - 1}
          onPress={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
          className={`px-4 py-2 rounded-full border ${page >= totalPages - 1 ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-[#1D3E90] border-[#1D3E90]'}`}
        >
          <Text className={`${page >= totalPages - 1 ? 'text-[#1D3E90]' : 'text-white'} text-[11px] font-black uppercase tracking-widest`}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ScheduleAgendaList({
  events,
  isMobile,
  isSmallPhone,
  resetKey,
  syncing,
  onSyncFRB,
  onSelectEvent,
  onAttendance,
  onDuplicate,
  onToggleCancelled,
  onGrade,
}: {
  events: CalendarEvent[];
  isMobile: boolean;
  isSmallPhone: boolean;
  resetKey: string;
  syncing: boolean;
  onSyncFRB: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onAttendance: (event: CalendarEvent) => void;
  onDuplicate: (event: CalendarEvent) => void;
  onToggleCancelled: (event: CalendarEvent) => void;
  onGrade: (event: CalendarEvent) => void;
}) {
  const now = Date.now();
  const sortedEvents = useMemo(() => sortByStartTime(events), [events]);
  const upcomingEvents = useMemo(() => sortedEvents.filter((event) => isUpcomingEvent(event, now)), [sortedEvents, now]);
  const pastEvents = useMemo(() => sortedEvents.filter((event) => !isUpcomingEvent(event, now)).reverse(), [sortedEvents, now]);

  const upcomingPagination = usePaginated(upcomingEvents, resetKey);
  const pastPagination = usePaginated(pastEvents, resetKey);

  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-xl font-black text-[#1E293B]">All Events</Text>
          <Text className="text-slate-400 text-sm font-bold mt-1">
            {upcomingEvents.length} upcoming • showing {upcomingPagination.paginated.length ? upcomingPagination.page * PAGE_SIZE + 1 : 0}-{Math.min((upcomingPagination.page + 1) * PAGE_SIZE, upcomingEvents.length)}
          </Text>
        </View>
        <TouchableOpacity onPress={onSyncFRB} disabled={syncing} className="flex-row items-center bg-white px-3 py-2 rounded-full border border-[#DDE7F5] shadow-sm">
          {syncing ? <ActivityIndicator size="small" color="#1D3E90" /> : <Activity size={14} color="#1D3E90" />}
          <Text className="text-[#1D3E90] text-[10px] font-black uppercase tracking-widest ml-1">{syncing ? 'Se Sincronizează...' : 'Sincronizare Meciuri'}</Text>
        </TouchableOpacity>
      </View>

      {upcomingEvents.length === 0 ? (
        <View className="bg-white rounded-[28px] border border-[#DDE7F5] p-8 items-center mb-6">
          <CalendarIcon size={30} color="#94A3B8" />
          <Text className="text-slate-400 font-bold mt-3 text-center">No upcoming events for this view.</Text>
        </View>
      ) : (
        upcomingPagination.paginated.map((event) => (
          <View key={event.id} className="mb-2.5">
            <ScheduleEventCard
              item={event}
              isMobile={isMobile}
              isSmallPhone={isSmallPhone}
              onPress={() => onSelectEvent(event)}
              onAttendance={() => onAttendance(event)}
              onDuplicate={() => onDuplicate(event)}
              onToggleCancelled={() => onToggleCancelled(event)}
            />
          </View>
        ))
      )}

      {upcomingEvents.length > PAGE_SIZE ? (
        <Pagination page={upcomingPagination.page} totalPages={upcomingPagination.totalPages} setPage={upcomingPagination.setPage} />
      ) : null}

      <View className="mt-4 mb-4">
        <Text className="text-xl font-black text-[#1E293B]">Past Events</Text>
        <Text className="text-slate-400 text-sm font-bold mt-1">
          {pastEvents.length} completed • showing {pastPagination.paginated.length ? pastPagination.page * PAGE_SIZE + 1 : 0}-{Math.min((pastPagination.page + 1) * PAGE_SIZE, pastEvents.length)}
        </Text>
      </View>

      {pastEvents.length === 0 ? (
        <View className="bg-white/70 rounded-[28px] border border-dashed border-[#CFE0EF] p-8 items-center mb-10">
          <Clock size={30} color="#94A3B8" />
          <Text className="text-slate-400 font-bold mt-3 text-center">No past events yet for this view.</Text>
        </View>
      ) : (
        <View className="gap-3 mb-10">
          {pastPagination.paginated.map((event) => {
            const meta = EVENT_TYPE_META[event.type];
            const cancelled = isCancelledEvent(event);
            return (
              // Plain View wrapper: the navigable area and the two action
              // buttons are separate pressables, never a button-in-button.
              <View
                key={`past-${event.id}`}
                className={`bg-white/85 border border-[#DDE7F5] rounded-[24px] p-4 ${isMobile ? 'gap-3' : 'flex-row items-center'} ${cancelled ? 'opacity-60' : ''}`}
              >
                <TouchableOpacity
                  onPress={() => onSelectEvent(event)}
                  activeOpacity={0.82}
                  className={`flex-1 ${isMobile ? 'gap-3' : 'flex-row items-center'}`}
                >
                  <View className={`${isMobile ? 'w-12 h-12' : 'w-11 h-11 mr-4'} rounded-[16px] bg-slate-100 items-center justify-center`}>
                    <Text className="text-[10px] font-black text-slate-500 uppercase">{new Date(event.startTime).toLocaleString('default', { month: 'short' }).toUpperCase()}</Text>
                    <Text className="text-base font-black text-[#0E2041]">{new Date(event.startTime).getDate()}</Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className={`text-[#0E2041] font-black ${cancelled ? 'line-through' : ''}`} numberOfLines={1}>{event.title}</Text>
                    <View className="flex-row items-center gap-2 mt-2 flex-wrap">
                      <View className="rounded-full px-3 py-1" style={{ backgroundColor: meta.soft }}>
                        <Text className="text-[9px] font-black uppercase tracking-widest" style={{ color: meta.onSoft }}>{meta.label}</Text>
                      </View>
                      {cancelled && (
                        <View className="bg-rose-50 rounded-full px-3 py-1 border border-rose-100">
                          <Text className="text-[9px] font-black uppercase tracking-widest text-rose-500">Cancelled</Text>
                        </View>
                      )}
                      <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-widest flex-1" numberOfLines={1}>
                        {event.location || 'Main Arena'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <View className={`${isMobile ? 'flex-row self-start gap-2' : 'flex-row items-center gap-2 ml-4'}`}>
                  <TouchableOpacity
                    onPress={() => onDuplicate(event)}
                    className="rounded-full bg-slate-50 px-4 py-2 border border-slate-100"
                  >
                    <Text className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Duplicate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onGrade(event)}
                    className="rounded-full bg-[#EEF4FF] px-4 py-2 border border-[#DDE7F5]"
                  >
                    <Text className="text-[#1D3E90] text-[10px] font-black uppercase tracking-widest">Grade</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {pastEvents.length > PAGE_SIZE ? (
            <Pagination page={pastPagination.page} totalPages={pastPagination.totalPages} setPage={pastPagination.setPage} />
          ) : null}
        </View>
      )}
    </View>
  );
}
