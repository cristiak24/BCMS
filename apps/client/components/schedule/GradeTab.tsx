import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from '@/src/web/reactNative';
import { CalendarDays, CheckCircle2, Clock, MapPin, Medal, Star, UserCheck, ChevronLeft, ChevronRight, X, Search } from 'lucide-react';
import { useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { useResponsive } from '../../hooks/useResponsive';
import { RO_LOCALE, RO_MONTHS } from './scheduleShared';
import ThemedCheckbox from '../myclub/ThemedCheckbox';
import ConfirmDialog from '../ui/ConfirmDialog';
import { ToastHost, useToasts } from '../ui/Toast';
import { Skeleton } from '../ui/Skeleton';

type GradeStatusFilter = 'pending' | 'graded';
type GradeTypeFilter = 'all' | CalendarEvent['type'];

const PAGE_SIZE = 12;

function isEventGraded(event: CalendarEvent) {
  return event.status === 'completed' || event.status === 'graded';
}

function getEventTypeTone(type: CalendarEvent['type']) {
  if (type === 'match') return { label: 'Meci', bg: 'bg-[#EAF2FF]', text: 'text-[#1D3E90]' };
  if (type === 'camp') return { label: 'Cantonament', bg: 'bg-[#F1E8FF]', text: 'text-[#6D28D9]' };
  if (type === 'admin') return { label: 'Administrativ', bg: 'bg-slate-100', text: 'text-slate-600' };
  return { label: 'Antrenament', bg: 'bg-[#E1F1FF]', text: 'text-[#0A5EA8]' };
}

export function GradeTab() {
  const router = useRouter();
  const { isMobile, isSmallPhone } = useResponsive();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GradeStatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<GradeTypeFilter>('all');
  const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
  const [coachFilter, setCoachFilter] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { toasts, showToast, dismissToast } = useToasts();

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
    setSelectedIds(new Set());
  }, [statusFilter, typeFilter, teamFilter, coachFilter, search, viewMonth, viewYear]);

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

  // Team & coach options are derived from the month's events so the pickers only
  // ever show entries that actually have something to grade.
  const teamOptions = useMemo(() => {
    const map = new Map<number, string>();
    pastEvents.forEach((e) => { if (e.teamId != null) map.set(e.teamId, e.teamName || `Echipa #${e.teamId}`); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }, [pastEvents]);

  const coachOptions = useMemo(() => {
    const map = new Map<number, string>();
    pastEvents.forEach((e) => { if (e.coachId != null) map.set(e.coachId, e.coachName || `Antrenor #${e.coachId}`); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }, [pastEvents]);

  const filteredEvents = pastEvents.filter((event) => {
    if (typeFilter !== 'all' && event.type !== typeFilter) return false;
    if (teamFilter !== 'all' && event.teamId !== teamFilter) return false;
    if (coachFilter !== 'all' && event.coachId !== coachFilter) return false;
    if (statusFilter === 'graded' ? !isEventGraded(event) : isEventGraded(event)) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const haystack = `${event.title} ${event.teamName ?? ''} ${event.coachName ?? ''} ${event.location ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) + (teamFilter !== 'all' ? 1 : 0) + (coachFilter !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);
  const resetFilters = () => { setTypeFilter('all'); setTeamFilter('all'); setCoachFilter('all'); setSearch(''); };

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedEvents = filteredEvents.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Bulk-grade is only offered in the "To Grade" view.
  const selectable = statusFilter === 'pending';
  const pageAllSelected = selectable && paginatedEvents.length > 0 && paginatedEvents.every((e) => selectedIds.has(e.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) paginatedEvents.forEach((e) => next.delete(e.id));
      else paginatedEvents.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const runBulkGrade = async () => {
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => eventsApi.updateEvent(id, { status: 'graded' })));
      const okIds = new Set<number>();
      let failed = 0;
      results.forEach((r, i) => { if (r.status === 'fulfilled') okIds.add(ids[i]); else failed += 1; });
      if (okIds.size > 0) {
        setEvents((prev) => prev.map((e) => (okIds.has(e.id) ? { ...e, status: 'graded' } : e)));
        showToast({ variant: 'success', message: `${okIds.size} ${okIds.size === 1 ? 'eveniment notat' : 'evenimente notate'}.` });
      }
      if (failed > 0) showToast({ variant: 'error', message: `${failed} ${failed === 1 ? 'eveniment nu a putut fi notat' : 'evenimente nu au putut fi notate'}.` });
    } finally {
      setBulkBusy(false);
      setSelectedIds(new Set());
    }
  };

  const typeFilters: { label: string; value: GradeTypeFilter }[] = [
    { label: 'Toate', value: 'all' },
    { label: 'Antrenamente', value: 'training' },
    { label: 'Meciuri', value: 'match' },
    { label: 'Cantonamente', value: 'camp' },
    { label: 'Administrativ', value: 'admin' },
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
          Pagina {safePage + 1} din {totalPages}
        </Text>
        <View className="flex-row gap-2">
          <TouchableOpacity
            disabled={safePage === 0}
            onPress={() => setPage((value) => Math.max(value - 1, 0))}
            className={`px-4 py-2 rounded-full border ${safePage === 0 ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-white border-[#CFE0EF]'}`}
          >
            <Text className="text-[#1D3E90] text-[11px] font-black uppercase tracking-widest">Înapoi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={safePage >= totalPages - 1}
            onPress={() => setPage((value) => Math.min(value + 1, totalPages - 1))}
            className={`px-4 py-2 rounded-full border ${safePage >= totalPages - 1 ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-[#1D3E90] border-[#1D3E90]'}`}
          >
            <Text className={`${safePage >= totalPages - 1 ? 'text-[#1D3E90]' : 'text-white'} text-[11px] font-black uppercase tracking-widest`}>
              Înainte
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
                Centru de notare
              </Text>
              <Text className="text-[#D6E6FF] text-[14px] font-semibold mt-2">
                Notează antrenamentele și meciurile trecute, apoi revizuiește sesiunile notate.
              </Text>
            </View>

            <View className={`flex-row items-center bg-white/10 rounded-[18px] p-1 border border-white/20 ${isMobile ? 'self-start' : ''}`}>
              <TouchableOpacity
                onPress={() => setCurrentDate(new Date(viewYear, viewMonth - 1, 1))}
                className="w-10 h-10 items-center justify-center rounded-[14px]"
              >
                <ChevronLeft size={18} color="var(--c-tint-fg)" />
              </TouchableOpacity>

              <View className="px-4 py-2 rounded-[14px] bg-white shadow-sm justify-center">
                <Text className="text-[11px] font-black tracking-widest uppercase text-[#123A97]">
                  {RO_MONTHS[viewMonth]} {viewYear}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setCurrentDate(new Date(viewYear, viewMonth + 1, 1))}
                className="w-10 h-10 items-center justify-center rounded-[14px]"
              >
                <ChevronRight size={18} color="var(--c-tint-fg)" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-4 mb-6">
            {renderSummaryCard('De notat', pendingEvents.length, <Star size={18} color="var(--c-warning)" />, 'bg-amber-50 border-amber-100')}
            {renderSummaryCard('Notate', gradedEvents.length, <CheckCircle2 size={18} color="var(--c-success-fg)" />, 'bg-emerald-50 border-emerald-100')}
            {renderSummaryCard('Antrenamente', trainingCount, <CalendarDays size={18} color="var(--c-brand-fg)" />, 'bg-white border-[#DDE7F5]')}
            {renderSummaryCard('Meciuri', matchCount, <Medal size={18} color="#0789A3" />, 'bg-cyan-50 border-cyan-100')}
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
                      {status === 'pending' ? 'De notat' : 'Notate'}
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

          {/* Team / coach / search — the useful filters for finding what to grade */}
          <View className={`bg-white rounded-[28px] border border-[#DDE7F5] p-4 mb-5 ${isMobile ? 'gap-3' : 'flex-row items-center gap-3 flex-wrap'}`}>
            <View className="relative flex-1 min-w-[200px]">
              <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Search size={15} color="var(--c-faint)" />
              </View>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Caută eveniment, echipă, antrenor sau locație"
                placeholderTextColor="var(--c-faint)"
                className="w-full h-[40px] rounded-[12px] border border-[#DDE7F5] bg-[#FBFDFF] pl-9 pr-3 text-[13px] font-semibold text-[#0E2041]"
              />
            </View>

            <View className="flex-row items-center gap-1.5">
              <Text className="text-[11px] font-black text-[#64748B] uppercase tracking-widest">Echipă</Text>
              <select
                value={teamFilter === 'all' ? 'all' : String(teamFilter)}
                onChange={(e) => setTeamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="h-[36px] rounded-[10px] border border-[#DDE7F5] bg-white px-3 text-[12px] font-bold text-[#475569]"
              >
                <option value="all">Toate echipele</option>
                {teamOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </View>

            <View className="flex-row items-center gap-1.5">
              <Text className="text-[11px] font-black text-[#64748B] uppercase tracking-widest">Antrenor</Text>
              <select
                value={coachFilter === 'all' ? 'all' : String(coachFilter)}
                onChange={(e) => setCoachFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="h-[36px] rounded-[10px] border border-[#DDE7F5] bg-white px-3 text-[12px] font-bold text-[#475569]"
              >
                <option value="all">Toți antrenorii</option>
                {coachOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </View>

            {activeFilterCount > 0 && (
              <TouchableOpacity
                onPress={resetFilters}
                className="flex-row items-center gap-1.5 h-[36px] px-3 rounded-[10px] border border-[#F3C6C6] bg-[#FEF3F2]"
              >
                <X size={13} color="var(--c-danger-fg)" />
                <Text className="text-[#B42318] text-[12px] font-bold">Șterge filtrele ({activeFilterCount})</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Bulk-grade controls (only in "To Grade") */}
          {selectable && filteredEvents.length > 0 && (
            <View className={`flex-row items-center gap-3 mb-4 ${isMobile ? 'flex-wrap' : ''}`}>
              <TouchableOpacity onPress={toggleSelectPage} className="flex-row items-center gap-2">
                <ThemedCheckbox checked={pageAllSelected} onToggle={toggleSelectPage} ariaLabel="Selectează pagina" size={18} />
                <Text className="text-[12px] font-bold text-[#475569]">{pageAllSelected ? 'Deselectează pagina' : 'Selectează pagina'}</Text>
              </TouchableOpacity>
              {selectedIds.size > 0 && (
                <View className="flex-row items-center gap-2.5 bg-[#EBF1FF] border border-[#BFDBFE] rounded-full pl-4 pr-2 py-1.5">
                  <Text className="text-[#1D3E90] text-[12px] font-black">{selectedIds.size} selectate</Text>
                  {bulkBusy ? (
                    <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => setConfirmBulk(true)} className="bg-[#1D3E90] rounded-full px-3 py-1.5">
                        <Text className="text-white text-[11px] font-black uppercase tracking-widest">Marchează ca notate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setSelectedIds(new Set())} className="w-6 h-6 items-center justify-center">
                        <X size={14} color="var(--c-brand-fg)" />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {loading && (
        <View className={`${isMobile ? 'px-4' : 'px-8'} w-full`}>
          <View className="w-full max-w-[1180px] self-center gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} className={`bg-white rounded-[28px] border border-[#DDE7F5] ${isMobile ? 'p-4 gap-3' : 'p-5 flex-row items-center'}`}>
                <View className={isMobile ? 'flex-row items-center gap-4' : 'flex-row items-center flex-1'}>
                  <Skeleton className={`${isMobile ? 'w-12 h-12 rounded-2xl' : 'w-16 h-16 rounded-[22px] mr-5'}`} />
                  <View className="flex-1 gap-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </View>
                </View>
                <Skeleton className={`h-11 w-32 rounded-2xl ${isMobile ? 'mt-1' : 'ml-5'}`} />
              </View>
            ))}
          </View>
        </View>
      )}

      {!loading && filteredEvents.length === 0 && (
        <View className="flex-1 items-center justify-center px-8">
          <View className="bg-white rounded-[32px] border border-[#DDE7F5] p-8 items-center max-w-[520px]">
            <CheckCircle2 size={38} color="var(--c-faint)" />
            <Text className="text-slate-400 font-bold text-center mt-4">
              Niciun eveniment {statusFilter === 'graded' ? 'notat' : 'de notat'} în {RO_MONTHS[viewMonth]} {viewYear}.{'\n'}Încearcă alt filtru sau altă lună.
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
              const checked = selectedIds.has(item.id);

              return (
                <View className="mb-4 flex-row items-center gap-3">
                  {selectable && (
                    <ThemedCheckbox checked={checked} onToggle={() => toggleSelect(item.id)} ariaLabel={`Selectează ${item.title}`} size={20} />
                  )}
                  <TouchableOpacity
                    onPress={() => router.push(`/admin/attendance/${item.id}` as any)}
                    activeOpacity={0.82}
                    className={`flex-1 bg-white shadow-lg border border-[#DDE7F5] ${isMobile ? 'rounded-[24px] p-4' : 'rounded-[28px] p-5 flex-row items-center'}`}
                  >
                    <View className={isMobile ? 'gap-4' : 'flex-row items-center flex-1'}>
                      <View className={`${isMobile ? 'w-12 h-12 rounded-2xl' : 'w-16 h-16 rounded-[22px] mr-5'} bg-[#EAF2FF] border border-[#CFE0FF] items-center justify-center`}>
                        <Text className="text-[10px] font-black text-[#1D3E90] uppercase">
                          {eventDate.toLocaleString(RO_LOCALE, { month: 'short' }).toUpperCase()}
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
                            <Clock size={14} color="var(--c-faint)" />
                            <Text className="text-[11px] text-slate-500 font-bold ml-1.5 uppercase tracking-widest">
                              {eventDate.toLocaleTimeString(RO_LOCALE, { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <View className="flex-row items-center">
                            <MapPin size={14} color="var(--c-faint)" />
                            <Text
                              numberOfLines={isMobile && isSmallPhone ? 1 : 2}
                              className="text-[11px] text-slate-500 font-bold ml-1.5 uppercase tracking-widest"
                            >
                              {item.location || 'Sală principală'}
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
                          <UserCheck size={16} color={graded ? 'var(--c-success-fg)' : '#FFFFFF'} />
                          <Text className={`${graded ? 'text-emerald-700' : 'text-white'} text-[10px] font-black uppercase tracking-widest ml-2`}>
                            {graded ? 'Notat' : 'Notează'}
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

      <ConfirmDialog
        visible={confirmBulk}
        title="Marchezi ca notate?"
        message={`${selectedIds.size} ${selectedIds.size === 1 ? 'eveniment va fi marcat' : 'evenimente vor fi marcate'} ca notate.`}
        confirmLabel="Marchează"
        cancelLabel="Renunță"
        loading={bulkBusy}
        onConfirm={() => { setConfirmBulk(false); void runBulkGrade(); }}
        onCancel={() => setConfirmBulk(false)}
      />

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
