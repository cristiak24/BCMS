import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from '@/src/web/reactNative';
import { CalendarDays, CheckCircle2, Clock, MapPin, Medal, Star, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { useResponsive } from '../../hooks/useResponsive';

interface GradeTabProps {
  events?: CalendarEvent[];
}

type GradeStatusFilter = 'pending' | 'graded';
type GradeTypeFilter = 'all' | CalendarEvent['type'];

const PAGE_SIZE = 12;

function isEventGraded(event: CalendarEvent) {
  return event.status === 'completed' || event.status === 'graded';
}

function getEventTypeTone(type: CalendarEvent['type']) {
  if (type === 'match') return { label: 'Match', bg: 'bg-[#EAF2FF]', text: 'text-[#1D3E90]' };
  if (type === 'camp') return { label: 'Camp', bg: 'bg-[#F1E8FF]', text: 'text-[#6D28D9]' };
  if (type === 'admin') return { label: 'Admin', bg: 'bg-slate-100', text: 'text-slate-600' };
  return { label: 'Training', bg: 'bg-[#E1F1FF]', text: 'text-[#0A5EA8]' };
}

export function GradeTab(_props: GradeTabProps) {
  const router = useRouter();
  const { isMobile, isSmallPhone } = useResponsive();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GradeStatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<GradeTypeFilter>('all');
  const [page, setPage] = useState(0);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const viewYear = currentDate.getFullYear();
  const viewMonth = currentDate.getMonth();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const start = new Date(viewYear, viewMonth, 1).toISOString();
        const end = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString();
        const data = await eventsApi.getEvents({ start, end });
        setEvents(data);
      } catch (e) {
        console.error('GradeTab fetch error', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [viewYear, viewMonth]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, typeFilter, viewMonth, viewYear]);

  const pastEvents = useMemo(() => {
    const nowTime = Date.now();
    return events
      .filter((event) => {
        const timeStr = event.endTime || event.startTime;
        if (!timeStr) return false;
        return new Date(timeStr).getTime() < nowTime;
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [events]);

  const gradedEvents = pastEvents.filter(isEventGraded);
  const pendingEvents = pastEvents.filter((event) => !isEventGraded(event));
  const trainingCount = pastEvents.filter((event) => event.type === 'training').length;
  const matchCount = pastEvents.filter((event) => event.type === 'match').length;

  const filteredEvents = pastEvents.filter((event) => {
    if (typeFilter !== 'all' && event.type !== typeFilter) return false;
    return statusFilter === 'graded' ? isEventGraded(event) : !isEventGraded(event);
  });

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedEvents = filteredEvents.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const typeFilters: { label: string; value: GradeTypeFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Training', value: 'training' },
    { label: 'Matches', value: 'match' },
    { label: 'Camps', value: 'camp' },
    { label: 'Admin', value: 'admin' },
  ];

  const renderSummaryCard = (label: string, value: number, icon: React.ReactNode, tone: string) => (
    <View className={`flex-1 min-w-[150px] rounded-[24px] p-5 border ${tone}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</Text>
        {icon}
      </View>
      <Text className="text-[32px] font-black text-[#0E2041] mt-3">{value}</Text>
    </View>
  );

  const renderPagination = () => {
    if (filteredEvents.length <= PAGE_SIZE) return null;

    return (
      <View className={`${isMobile ? 'gap-3 mx-4' : 'flex-row items-center justify-between mx-8'} bg-white rounded-[24px] border border-[#DDE7F5] p-4 mb-8 max-w-[1180px] self-center w-full`}>
        <Text className="text-slate-500 font-black text-[12px] uppercase tracking-widest">
          Page {safePage + 1} of {totalPages}
        </Text>
        <View className="flex-row gap-2">
          <TouchableOpacity
            disabled={safePage === 0}
            onPress={() => setPage((value) => Math.max(value - 1, 0))}
            className={`px-4 py-2 rounded-full border ${safePage === 0 ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-white border-[#CFE0EF]'}`}
          >
            <Text className="text-[#1D3E90] text-[11px] font-black uppercase tracking-widest">Previous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={safePage >= totalPages - 1}
            onPress={() => setPage((value) => Math.min(value + 1, totalPages - 1))}
            className={`px-4 py-2 rounded-full border ${safePage >= totalPages - 1 ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-[#1D3E90] border-[#1D3E90]'}`}
          >
            <Text className={`${safePage >= totalPages - 1 ? 'text-[#1D3E90]' : 'text-white'} text-[11px] font-black uppercase tracking-widest`}>
              Next
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#EDF4FB]">
      <View className={`${isMobile ? 'px-4 pt-5' : 'px-8 pt-8'} w-full`}>
        <View className="w-full max-w-[1180px] self-center">
          <View className={`bg-[#123A97] rounded-[32px] p-6 md:p-8 shadow-xl border border-white/40 mb-6 ${isMobile ? 'gap-5' : 'flex-row items-end justify-between'}`}>
            <View className="flex-1">
              <Text className={`${isMobile ? 'text-[32px]' : 'text-[40px]'} font-black text-white tracking-tight leading-tight`}>
                Grade Center
              </Text>
              <Text className="text-[#D6E6FF] text-[14px] font-semibold mt-2">
                Grade past trainings and matches, then review completed graded sessions.
              </Text>
            </View>

            <View className={`flex-row items-center bg-white/10 rounded-[18px] p-1 border border-white/20 ${isMobile ? 'self-start' : ''}`}>
              <TouchableOpacity
                onPress={() => setCurrentDate(new Date(viewYear, viewMonth - 1, 1))}
                className="w-10 h-10 items-center justify-center rounded-[14px]"
              >
                <ChevronLeft size={18} color="#D6E6FF" />
              </TouchableOpacity>

              <View className="px-4 py-2 rounded-[14px] bg-white shadow-sm justify-center">
                <Text className="text-[11px] font-black tracking-widest uppercase text-[#123A97]">
                  {months[viewMonth]} {viewYear}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setCurrentDate(new Date(viewYear, viewMonth + 1, 1))}
                className="w-10 h-10 items-center justify-center rounded-[14px]"
              >
                <ChevronRight size={18} color="#D6E6FF" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-4 mb-6">
            {renderSummaryCard('To Grade', pendingEvents.length, <Star size={18} color="#D97706" />, 'bg-amber-50 border-amber-100')}
            {renderSummaryCard('Graded', gradedEvents.length, <CheckCircle2 size={18} color="#059669" />, 'bg-emerald-50 border-emerald-100')}
            {renderSummaryCard('Training', trainingCount, <CalendarDays size={18} color="#1D3E90" />, 'bg-white border-[#DDE7F5]')}
            {renderSummaryCard('Matches', matchCount, <Medal size={18} color="#0789A3" />, 'bg-cyan-50 border-cyan-100')}
          </View>

          <View className={`bg-white rounded-[28px] border border-[#DDE7F5] p-4 mb-5 ${isMobile ? 'gap-4' : 'flex-row items-center justify-between'}`}>
            <View className="flex-row bg-[#F1F5F9] rounded-full p-1 self-start">
              {(['pending', 'graded'] as GradeStatusFilter[]).map((status) => {
                const active = statusFilter === status;
                return (
                  <TouchableOpacity
                    key={status}
                    onPress={() => setStatusFilter(status)}
                    className={`px-5 py-2 rounded-full ${active ? 'bg-white shadow-sm' : ''}`}
                  >
                    <Text className={`text-[11px] font-black uppercase tracking-widest ${active ? 'text-[#1D3E90]' : 'text-slate-400'}`}>
                      {status === 'pending' ? 'To Grade' : 'Graded'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {typeFilters.map((filter) => {
                  const active = typeFilter === filter.value;
                  return (
                    <TouchableOpacity
                      key={filter.value}
                      onPress={() => setTypeFilter(filter.value)}
                      className={`px-4 py-2 rounded-full border ${active ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-white border-[#DDE7F5]'}`}
                    >
                      <Text className={`text-[11px] font-black ${active ? 'text-white' : 'text-[#0E2041]'}`}>
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </View>

      {loading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1D3E90" />
        </View>
      )}

      {!loading && filteredEvents.length === 0 && (
        <View className="flex-1 items-center justify-center px-8">
          <View className="bg-white rounded-[32px] border border-[#DDE7F5] p-8 items-center max-w-[520px]">
            <CheckCircle2 size={38} color="#94A3B8" />
            <Text className="text-slate-400 font-bold text-center mt-4">
              No {statusFilter === 'graded' ? 'graded' : 'pending'} events found in {months[viewMonth]} {viewYear}.{'\n'}Try another filter or month.
            </Text>
          </View>
        </View>
      )}

      {!loading && filteredEvents.length > 0 && (
        <>
          <FlatList
            data={paginatedEvents}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: isMobile ? 16 : 32, maxWidth: 1180, alignSelf: 'center', width: '100%' }}
            renderItem={({ item }) => {
              const eventDate = new Date(item.startTime);
              const typeTone = getEventTypeTone(item.type);
              const graded = isEventGraded(item);

              return (
                <View className="mb-4">
                  <TouchableOpacity
                    onPress={() => router.push(`/admin/attendance/${item.id}` as any)}
                    activeOpacity={0.82}
                    className={`bg-white shadow-lg border border-[#DDE7F5] ${isMobile ? 'rounded-[24px] p-4' : 'rounded-[28px] p-5 flex-row items-center'}`}
                  >
                    <View className={isMobile ? 'gap-4' : 'flex-row items-center flex-1'}>
                      <View className={`${isMobile ? 'w-12 h-12 rounded-2xl' : 'w-16 h-16 rounded-[22px] mr-5'} bg-[#EAF2FF] border border-[#CFE0FF] items-center justify-center`}>
                        <Text className="text-[10px] font-black text-[#1D3E90] uppercase">
                          {eventDate.toLocaleString('default', { month: 'short' }).toUpperCase()}
                        </Text>
                        <Text className={`${isMobile ? 'text-lg' : 'text-xl'} font-black text-slate-900`}>
                          {eventDate.getDate()}
                        </Text>
                      </View>

                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-start gap-3 mb-2">
                          <Text className={`${isMobile ? 'text-base' : 'text-lg'} font-black text-[#1E293B] flex-1`} numberOfLines={1}>
                            {item.title}
                          </Text>
                          {isMobile ? (
                            <View className={`${typeTone.bg} rounded-full px-3 py-1`}>
                              <Text className={`${typeTone.text} text-[9px] font-black uppercase tracking-widest`}>{typeTone.label}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View className={`${isMobile ? 'gap-2' : 'flex-row items-center gap-4'}`}>
                          <View className="flex-row items-center">
                            <Clock size={14} color="#94A3B8" />
                            <Text className="text-[11px] text-slate-500 font-bold ml-1.5 uppercase tracking-widest">
                              {eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <View className="flex-row items-center">
                            <MapPin size={14} color="#94A3B8" />
                            <Text
                              numberOfLines={isMobile && isSmallPhone ? 1 : 2}
                              className="text-[11px] text-slate-500 font-bold ml-1.5 uppercase tracking-widest"
                            >
                              {item.location || 'Main Arena'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View className={`${isMobile ? 'self-start mt-1' : 'ml-5 flex-row items-center justify-end gap-3 min-w-[180px]'}`}>
                        {!isMobile ? (
                          <View className={`${typeTone.bg} rounded-full px-3 py-1.5`}>
                            <Text className={`${typeTone.text} text-[9px] font-black uppercase tracking-widest`}>{typeTone.label}</Text>
                          </View>
                        ) : null}
                        <View className={`${graded ? 'bg-emerald-50 border-emerald-100' : 'bg-[#1D3E90] border-[#1D3E90]'} border px-5 py-3 rounded-2xl flex-row items-center justify-center`}>
                          <UserCheck size={16} color={graded ? '#047857' : '#FFFFFF'} />
                          <Text className={`${graded ? 'text-emerald-700' : 'text-white'} text-[10px] font-black uppercase tracking-widest ml-2`}>
                            {graded ? 'Graded' : 'Grade'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
          {renderPagination()}
        </>
      )}
    </View>
  );
}
