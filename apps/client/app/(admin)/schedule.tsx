import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, useWindowDimensions } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { LinearGradient } from '@/src/web/linearGradient';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, RotateCw, LayoutGrid, List, CalendarDays, Download, Search, X,
  SlidersHorizontal, TrendingUp, Trophy,
} from 'lucide-react';
import { eventsApi, CalendarEvent, EventAttendance } from '../../services/eventsApi';
import { AttendanceTab } from '../../components/schedule/AttendanceTab';
import { GradeTab } from '../../components/schedule/GradeTab';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../components/HeaderContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useAdminScheduleData } from '../../hooks/useAdminScheduleData';
import { useAddEventForm } from '../../hooks/useAddEventForm';
import {
  eventMatchesSearch, isCancelledEvent, buildICSCalendar, triggerFileDownload, toDateKey,
} from '../../components/schedule/scheduleShared';
import { MonthlyCalendarGrid, CalendarLegend } from '../../components/schedule/admin/ScheduleCalendarGrid';
import { ScheduleEventCard } from '../../components/schedule/admin/ScheduleEventCard';
import { ScheduleWeekView } from '../../components/schedule/admin/ScheduleWeekView';
import { ScheduleAgendaList } from '../../components/schedule/admin/ScheduleAgendaList';
import { AddEventModal } from '../../components/schedule/admin/AddEventModal';
import { DayScheduleModal } from '../../components/schedule/admin/DayScheduleModal';
import { EventAttendanceModal } from '../../components/schedule/admin/EventAttendanceModal';
import { FilterModal } from '../../components/schedule/admin/FilterModal';

type TopTab = 'Monthly' | 'Attendance' | 'Grade';
type ScheduleView = 'month' | 'week' | 'agenda';

export default function ScheduleScreen() {
  const router = useRouter();
  const { isMobile, isSmallPhone } = useResponsive();
  const { width } = useWindowDimensions();
  // Kept in sync with useResponsive()'s isMobile (1024px) so this matches
  // when the app shell switches between mobile chrome and the desktop header.
  const isDesktop = !isMobile;
  const isWideDesktop = width >= 1440;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TopTab>('Monthly');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('month');
  const [syncing, setSyncing] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [selectedAttendanceEvent, setSelectedAttendanceEvent] = useState<CalendarEvent | null>(null);
  const [attendanceList, setAttendanceList] = useState<EventAttendance[]>([]);

  // Filters
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterCoachId, setFilterCoachId] = useState<number | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<number | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const filters = useMemo(() => ({ type: filterType, coachId: filterCoachId, teamId: filterTeamId }), [filterType, filterCoachId, filterTeamId]);
  const { events, teams, coaches, refetch } = useAdminScheduleData(currentDate, filters);

  // ── HeaderContext integration ─────────────────────────────────────
  const { setSearchPlaceholder, setHeaderActions, setMobileFab, searchValue, setSearchValue } = useHeader();

  useEffect(() => {
    setSearchPlaceholder('Search events...');
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setHeaderActions(null);
      setMobileFab(null);
      setSearchValue('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setHeaderActions(
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 24, padding: 3 }}>
          {(['Monthly', 'Attendance', 'Grade'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: activeTab === tab ? '#fff' : 'transparent',
                shadowColor: activeTab === tab ? '#0F172A' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: activeTab === tab ? 0.08 : 0,
                shadowRadius: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: activeTab === tab ? '#1D3E90' : '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: '#1D3E90', paddingHorizontal: 16, paddingVertical: 8,
            borderRadius: 20, gap: 6, shadowColor: '#1D3E90', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
          }}
        >
          <Plus color="#fff" size={14} />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 }}>Add Event</Text>
        </TouchableOpacity>
      </View>
    );

    setMobileFab(
      <TouchableOpacity
        onPress={() => setShowAddModal(true)}
        style={{
          position: 'absolute', bottom: 96, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1D3E90',
          alignItems: 'center', justifyContent: 'center', shadowColor: '#1D3E90', shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45, shadowRadius: 12, elevation: 10, zIndex: 30,
        }}
      >
        <Plus color="#fff" size={22} />
      </TouchableOpacity>
    );
  }, [activeTab, setHeaderActions, setMobileFab]);
  // ─────────────────────────────────────────────────────────────────

  const form = useAddEventForm(refetch);
  useEffect(() => { form.loadRecentLocations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncFRB = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await eventsApi.syncFRBMatches();
      Alert.alert('Succes', `Au fost sincronizate ${res.syncedCount} meciuri noi din FRB!`);
      refetch();
    } catch {
      Alert.alert('Eroare', 'Eroare la sincronizarea meciurilor.');
    } finally {
      setSyncing(false);
    }
  };

  const navigateToEvent = (event: CalendarEvent) => router.push(`/admin/event/${event.id}` as any);
  const navigateToGrade = (event: CalendarEvent) => router.push(`/admin/attendance/${event.id}` as any);

  const openDaySchedule = (dayData: { date: Date; events: CalendarEvent[] }) => setSelectedDay(dayData);

  const handleQuickAdd = (date: Date) => {
    form.prefillDate(date);
    setSelectedDay(null);
    setShowAddModal(true);
  };

  const handleOpenAttendance = async (event: CalendarEvent) => {
    setSelectedAttendanceEvent(event);
    try {
      const data = await eventsApi.getEventAttendance(event.id);
      setAttendanceList(data);
    } catch {
      Alert.alert('Error', 'Could not load attendance');
      setSelectedAttendanceEvent(null);
    }
  };

  const updateAttendance = async (playerId: number, status: string) => {
    if (!selectedAttendanceEvent) return;
    try {
      await eventsApi.updateEventAttendance(selectedAttendanceEvent.id, [{ playerId, status }]);
      setAttendanceList((prev) => prev.map((p) => (p.playerId === playerId ? { ...p, status } : p)));
    } catch {
      Alert.alert('Error', 'Update failed');
    }
  };

  const handleDuplicate = async (event: CalendarEvent) => {
    try {
      await eventsApi.createEvent({
        type: event.type,
        title: `${event.title} (Copy)`,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        teamId: event.teamId,
        amount: event.amount,
      });
      refetch();
    } catch {
      Alert.alert('Error', 'Could not duplicate this event.');
    }
  };

  const handleToggleCancelled = async (event: CalendarEvent) => {
    const nextStatus = isCancelledEvent(event) ? 'scheduled' : 'cancelled';
    try {
      await eventsApi.updateEvent(event.id, { status: nextStatus });
      refetch();
    } catch {
      Alert.alert('Error', 'Could not update this event.');
    }
  };

  const handleExport = () => {
    const filename = `schedule-${toDateKey(currentDate).slice(0, 7)}.ics`;
    const ok = triggerFileDownload(filename, buildICSCalendar(visibleEvents), 'text/calendar;charset=utf-8;');
    if (!ok) Alert.alert('Export unavailable', 'Calendar export is currently available on web.');
  };

  const navigateMonth = (delta: number) => {
    setCurrentDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const visibleEvents = useMemo(
    () => events.filter((event) => (showCancelled || !isCancelledEvent(event)) && eventMatchesSearch(event, searchValue)),
    [events, showCancelled, searchValue]
  );

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const viewYear = currentDate.getFullYear();
  const upcomingCount = visibleEvents.filter((event) => new Date(event.endTime || event.startTime) >= new Date()).length;
  const featuredUpcoming = useMemo(
    () => [...visibleEvents]
      .filter((event) => new Date(event.endTime || event.startTime) >= new Date())
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 3),
    [visibleEvents]
  );
  const nextMatch = featuredUpcoming.find((event) => event.type === 'match')
    ?? [...visibleEvents].filter((e) => e.type === 'match' && new Date(e.endTime || e.startTime) >= new Date())
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

  const filterChips = [
    { label: 'All Events', value: null },
    { label: 'Training', value: 'training' },
    { label: 'Matches', value: 'match' },
    { label: 'Camps', value: 'camp' },
  ];

  const resetKey = `${toDateKey(currentDate).slice(0, 7)}|${filterType}|${filterCoachId}|${filterTeamId}|${showCancelled}|${searchValue}`;

  const ViewSwitcher = () => (
    <View className="flex-row items-center bg-white rounded-2xl border border-[#DDE7F5] p-1 gap-1">
      {([
        { key: 'month' as const, icon: LayoutGrid, label: 'Month' },
        { key: 'week' as const, icon: CalendarDays, label: 'Week' },
        { key: 'agenda' as const, icon: List, label: 'Agenda' },
      ]).map(({ key, icon: Icon, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => setScheduleView(key)}
          className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${scheduleView === key ? 'bg-[#1D3E90]' : ''}`}
        >
          <Icon size={13} color={scheduleView === key ? '#fff' : '#64748B'} />
          <Text className={`text-[11px] font-black uppercase tracking-widest ${scheduleView === key ? 'text-white' : 'text-slate-500'}`}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const MonthlyBody = () => (
    <View className={`${isMobile ? 'px-4 pt-5' : 'px-6 xl:px-8 2xl:px-10 pt-8'} w-full`}>
      <View className="w-full">
        <View className={`${isMobile ? 'gap-5' : 'flex-row items-end justify-between'} mb-6`}>
          <View className="flex-1">
            <Text className={`${isMobile ? 'text-[34px]' : 'text-[44px]'} font-black text-[#123A97] tracking-tight leading-tight`}>
              My Schedule
            </Text>
            <View className="flex-row items-center flex-wrap gap-2 mt-3">
              <View className="w-9 h-9 rounded-[14px] bg-white border border-[#DDE7F5] items-center justify-center shadow-sm">
                <CalendarIcon size={17} color="#0E2041" />
              </View>
              <Text className="text-[#0E2041] text-[15px] font-black">{monthName} {viewYear}</Text>
              <Text className="text-slate-400 text-[11px] font-black uppercase tracking-widest">{visibleEvents.length} events this month</Text>
            </View>
          </View>

          {!isDesktop && (
            <View className="flex-row items-center gap-4 flex-wrap">
              {(['Monthly', 'Attendance', 'Grade'] as const).map((tab) => (
                <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} className={`pb-1.5 ${activeTab === tab ? 'border-b-2 border-[#1D3E90]' : ''}`}>
                  <Text className={`font-bold text-[15px] ${activeTab === tab ? 'text-[#1D3E90]' : 'text-slate-400'}`}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View className={`${isMobile ? 'gap-3' : 'flex-row items-center gap-3'}`}>
            <View className="flex-row flex-wrap items-center gap-2">
              {filterChips.map((chip) => {
                const isActive = filterType === chip.value;
                return (
                  <TouchableOpacity
                    key={chip.label}
                    onPress={() => setFilterType(chip.value)}
                    className={`px-5 py-3 rounded-full border ${isActive ? 'bg-[#25AEEB] border-[#25AEEB]' : 'bg-white border-[#CFE0EF]'}`}
                  >
                    <Text className={`text-[12px] font-black ${isActive ? 'text-white' : 'text-[#0E2041]'}`}>{chip.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity onPress={() => setShowFilterModal(true)} className="w-11 h-11 rounded-full bg-white border border-[#CFE0EF] items-center justify-center shadow-sm" accessibilityLabel="More filters">
              <SlidersHorizontal size={16} color="#1D3E90" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExport} className="w-11 h-11 rounded-full bg-white border border-[#CFE0EF] items-center justify-center shadow-sm" accessibilityLabel="Export month as .ics">
              <Download size={16} color="#1D3E90" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSyncFRB} disabled={syncing} className="w-11 h-11 rounded-full bg-white border border-[#CFE0EF] items-center justify-center shadow-sm">
              <RotateCw size={17} color="#1D3E90" />
            </TouchableOpacity>
          </View>
        </View>

        <View className={`${isMobile ? 'gap-3 mb-6' : 'flex-row items-center justify-between gap-3 mb-6'}`}>
          <ViewSwitcher />
          <CalendarLegend />
          {searchValue ? (
            <View className="flex-row items-center gap-2 bg-white rounded-full border border-[#DDE7F5] px-4 py-2">
              <Search size={13} color="#94A3B8" />
              <Text className="text-[11px] font-bold text-slate-500">Searching "{searchValue}"</Text>
              <TouchableOpacity onPress={() => setSearchValue('')}>
                <X size={13} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {scheduleView === 'week' ? (
          <ScheduleWeekView
            filters={filters}
            searchQuery={searchValue}
            showCancelled={showCancelled}
            onSelectEvent={navigateToEvent}
            onQuickAdd={handleQuickAdd}
            isMobile={isMobile}
          />
        ) : scheduleView === 'agenda' ? (
          <ScheduleAgendaList
            events={visibleEvents}
            isMobile={isMobile}
            isSmallPhone={isSmallPhone}
            resetKey={resetKey}
            syncing={syncing}
            onSyncFRB={handleSyncFRB}
            onSelectEvent={navigateToEvent}
            onAttendance={handleOpenAttendance}
            onDuplicate={handleDuplicate}
            onToggleCancelled={handleToggleCancelled}
            onGrade={navigateToGrade}
          />
        ) : (
          <View className={`${isDesktop ? 'flex-row gap-6 2xl:gap-8 items-start w-full' : 'gap-4'}`}>
            <View className="flex-1 min-w-0">
              <View className="bg-white rounded-[32px] border border-[#DDE7F5] shadow-lg overflow-hidden">
                <View className="px-6 py-5 flex-row items-center justify-between border-b border-[#DDE7F5]">
                  <View>
                    <Text className="text-[26px] font-black text-[#0E2041]">{monthName} {viewYear}</Text>
                    <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">{visibleEvents.length} events this month</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity onPress={() => navigateMonth(-1)} className="w-10 h-10 items-center justify-center rounded-xl bg-[#F4F8FD]">
                      <ChevronLeft color="#0E2041" size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigateMonth(1)} className="w-10 h-10 items-center justify-center rounded-xl bg-[#F4F8FD]">
                      <ChevronRight color="#0E2041" size={18} />
                    </TouchableOpacity>
                  </View>
                </View>

                <MonthlyCalendarGrid currentDate={currentDate} events={visibleEvents} onSelectEvent={navigateToEvent} onSelectDay={openDaySchedule} />
              </View>
            </View>

            <View className={`${isDesktop ? 'shrink-0' : 'w-full'} gap-5`} style={isDesktop ? { width: isWideDesktop ? 400 : 360 } : undefined}>
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-black text-[#0E2041]">Upcoming Events</Text>
                <TouchableOpacity onPress={() => setScheduleView('agenda')}>
                  <Text className="text-[#1D3E90] text-[12px] font-black">View All</Text>
                </TouchableOpacity>
              </View>

              {featuredUpcoming.length === 0 ? (
                <View className="bg-white rounded-[28px] border border-[#DDE7F5] p-6 items-center">
                  <CalendarIcon size={28} color="#94A3B8" />
                  <Text className="text-slate-400 font-bold mt-3 text-center">No upcoming events in this view.</Text>
                </View>
              ) : featuredUpcoming.map((event) => (
                <ScheduleEventCard key={`featured-${event.id}`} item={event} compact isMobile={isMobile} isSmallPhone={isSmallPhone} onPress={() => navigateToEvent(event)} />
              ))}

              <View className="flex-row gap-3">
                <LinearGradient
                  colors={['#2B3FA8', '#4A5FD9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 24, flex: 1, padding: 20, minHeight: 108, justifyContent: 'space-between' }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[#BFD0FF] text-[10px] font-black uppercase tracking-widest">Upcoming</Text>
                    <View className="w-7 h-7 rounded-full bg-white/15 items-center justify-center">
                      <TrendingUp size={13} color="#DCE6FF" />
                    </View>
                  </View>
                  <Text className="text-white text-[32px] font-black">{upcomingCount}</Text>
                </LinearGradient>
                <LinearGradient
                  colors={['#046B85', '#0EA5C4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 24, flex: 1, padding: 20, minHeight: 108, justifyContent: 'space-between' }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[#BFEFFF] text-[10px] font-black uppercase tracking-widest">Next Match</Text>
                    <View className="w-7 h-7 rounded-full bg-white/15 items-center justify-center">
                      <Trophy size={13} color="#DFFAFF" />
                    </View>
                  </View>
                  <Text className="text-white text-[22px] font-black" numberOfLines={1}>
                    {nextMatch ? new Date(nextMatch.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'None scheduled'}
                  </Text>
                </LinearGradient>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-[#EDF4FB]">
      {activeTab === 'Monthly' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 132 }}>
          <MonthlyBody />
        </ScrollView>
      )}
      {activeTab === 'Attendance' && (
        <View className="flex-1">
          <AttendanceTab events={events} teams={teams} />
        </View>
      )}
      {activeTab === 'Grade' && (
        <View className="flex-1">
          <GradeTab events={events} />
        </View>
      )}

      <AddEventModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        form={form}
        teams={teams}
        isMobile={isMobile}
        currentDate={currentDate}
        onNavigateMonth={navigateMonth}
      />

      <DayScheduleModal
        day={selectedDay}
        isMobile={isMobile}
        isSmallPhone={isSmallPhone}
        onClose={() => setSelectedDay(null)}
        onSelectEvent={(event) => { setSelectedDay(null); navigateToEvent(event); }}
        onQuickAdd={handleQuickAdd}
      />

      <EventAttendanceModal
        event={selectedAttendanceEvent}
        attendanceList={attendanceList}
        onClose={() => setSelectedAttendanceEvent(null)}
        onUpdate={updateAttendance}
      />

      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filterType={filterType}
        setFilterType={setFilterType}
        filterCoachId={filterCoachId}
        setFilterCoachId={setFilterCoachId}
        filterTeamId={filterTeamId}
        setFilterTeamId={setFilterTeamId}
        showCancelled={showCancelled}
        setShowCancelled={setShowCancelled}
        coaches={coaches}
        teams={teams}
      />
    </View>
  );
}
