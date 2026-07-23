import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from '@/src/web/reactNative';
import { useRouter, useLocalSearchParams } from '@/src/web/expoRouter';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ToastHost, useToasts } from '../../components/ui/Toast';
import { LinearGradient } from '@/src/web/linearGradient';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, RotateCw, LayoutGrid, List, CalendarDays, Download, Search, X,
  SlidersHorizontal, TrendingUp, Trophy, Users, ShieldCheck, Receipt,
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
import TeamMedicalVisaModal from '../../components/schedule/admin/TeamMedicalVisaModal';
import TeamPaymentsReportModal from '../../components/schedule/admin/TeamPaymentsReportModal';

type TopTab = 'Monthly' | 'Attendance' | 'Grade';
type ScheduleView = 'month' | 'week' | 'agenda';

const TOP_TAB_LABELS: Record<TopTab, string> = {
  Monthly: 'Lunar',
  Attendance: 'Prezență',
  Grade: 'Notare',
};

const VIEW_LABELS: Record<ScheduleView, string> = {
  month: 'Lună',
  week: 'Săptămână',
  agenda: 'Agendă',
};

export default function ScheduleScreen() {
  const router = useRouter();
  // When arriving from My Club ("Program" on a team) the team id comes through as
  // a query param so the schedule opens scoped to that team.
  const routeParams = useLocalSearchParams<{ teamId?: string; tab?: string }>();
  const paramTeamId = useMemo(() => {
    const n = Number(routeParams.teamId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [routeParams.teamId]);
  const { isMobile, isSmallPhone } = useResponsive();
  const { width } = useWindowDimensions();
  // Kept in sync with useResponsive()'s isMobile (1024px) so this matches
  // when the app shell switches between mobile chrome and the desktop header.
  const isDesktop = !isMobile;
  const isWideDesktop = width >= 1440;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TopTab>(
    routeParams.tab === 'attendance' ? 'Attendance' : routeParams.tab === 'grade' ? 'Grade' : 'Monthly'
  );
  const [scheduleView, setScheduleView] = useState<ScheduleView>('month');
  const [syncing, setSyncing] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMedicalVisa, setShowMedicalVisa] = useState(false);
  const [showPaymentsReport, setShowPaymentsReport] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [selectedAttendanceEvent, setSelectedAttendanceEvent] = useState<CalendarEvent | null>(null);
  const [attendanceList, setAttendanceList] = useState<EventAttendance[]>([]);

  // Confirmation dialogs for impactful actions (duplicate / cancel an event).
  const [confirmDuplicate, setConfirmDuplicate] = useState<CalendarEvent | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<CalendarEvent | null>(null);

  const { toasts, showToast, dismissToast } = useToasts();

  // Filters
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterCoachId, setFilterCoachId] = useState<number | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<number | null>(paramTeamId);
  const [showCancelled, setShowCancelled] = useState(false);

  const filters = useMemo(() => ({ type: filterType, coachId: filterCoachId, teamId: filterTeamId }), [filterType, filterCoachId, filterTeamId]);
  const { events, teams, coaches, refetch } = useAdminScheduleData(currentDate, filters);

  // ── HeaderContext integration ─────────────────────────────────────
  const { setSearchPlaceholder, setHeaderActions, setMobileFab, searchValue, setSearchValue } = useHeader();

  useEffect(() => {
    setSearchPlaceholder('Caută evenimente...');
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
        <View style={{ flexDirection: 'row', backgroundColor: 'var(--c-surface-3)', borderRadius: 24, padding: 3 }}>
          {(['Monthly', 'Attendance', 'Grade'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: activeTab === tab ? 'var(--c-surface)' : 'transparent',
                shadowColor: activeTab === tab ? 'var(--c-ink-strong)' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: activeTab === tab ? 0.08 : 0,
                shadowRadius: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: activeTab === tab ? 'var(--c-brand-fg)' : 'var(--c-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {TOP_TAB_LABELS[tab]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: 'var(--c-brand-surface)', paddingHorizontal: 16, paddingVertical: 8,
            borderRadius: 20, gap: 6, shadowColor: 'var(--c-brand-fg)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
          }}
        >
          <Plus color="#fff" size={14} />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 }}>Adaugă eveniment</Text>
        </TouchableOpacity>
      </View>
    );

    setMobileFab(
      <TouchableOpacity
        onPress={() => setShowAddModal(true)}
        style={{
          position: 'absolute', bottom: 96, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: 'var(--c-brand-surface)',
          alignItems: 'center', justifyContent: 'center', shadowColor: 'var(--c-brand-fg)', shadowOffset: { width: 0, height: 6 },
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

  // Pre-select the team in the "Add event" form when scoped to a team, so a new
  // event defaults to that team without the admin re-picking it. Re-applied each
  // time the modal opens because the form resets its team after each create.
  const { setNewTeamId } = form;
  useEffect(() => {
    if (showAddModal && paramTeamId != null) setNewTeamId(paramTeamId);
  }, [showAddModal, paramTeamId, setNewTeamId]);

  const handleSyncFRB = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await eventsApi.syncFRBMatches();
      showToast({ variant: 'success', message: `Au fost sincronizate ${res.syncedCount} meciuri noi din FRB.` });
      refetch();
    } catch {
      showToast({ variant: 'error', message: 'Eroare la sincronizarea meciurilor.' });
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
      showToast({ variant: 'error', message: 'Nu s-a putut încărca prezența.' });
      setSelectedAttendanceEvent(null);
    }
  };

  const updateAttendance = async (playerId: number, status: string) => {
    if (!selectedAttendanceEvent) return;
    try {
      await eventsApi.updateEventAttendance(selectedAttendanceEvent.id, [{ playerId, status }]);
      setAttendanceList((prev) => prev.map((p) => (p.playerId === playerId ? { ...p, status } : p)));
    } catch {
      showToast({ variant: 'error', message: 'Actualizarea a eșuat.' });
    }
  };

  // Duplicate/cancel go through a confirmation dialog first (impactful, was
  // previously fire-and-forget on a single tap).
  const handleDuplicate = async (event: CalendarEvent) => {
    try {
      await eventsApi.createEvent({
        type: event.type,
        title: `${event.title} (Copie)`,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        teamId: event.teamId,
        amount: event.amount,
      });
      refetch();
      showToast({ variant: 'success', message: `„${event.title}” a fost duplicat.` });
    } catch {
      showToast({ variant: 'error', message: 'Nu s-a putut duplica acest eveniment.' });
    }
  };

  const handleToggleCancelled = async (event: CalendarEvent) => {
    const nextStatus = isCancelledEvent(event) ? 'scheduled' : 'cancelled';
    try {
      await eventsApi.updateEvent(event.id, { status: nextStatus });
      refetch();
      showToast({
        variant: 'success',
        message: nextStatus === 'cancelled' ? `„${event.title}” a fost anulat.` : `„${event.title}” a fost reactivat.`,
      });
    } catch {
      showToast({ variant: 'error', message: 'Nu s-a putut actualiza acest eveniment.' });
    }
  };

  // A cancelled event just gets reactivated (reversible) — only cancelling asks.
  const requestToggleCancelled = (event: CalendarEvent) => {
    if (isCancelledEvent(event)) void handleToggleCancelled(event);
    else setConfirmCancel(event);
  };

  const handleExport = () => {
    const filename = `program-${toDateKey(currentDate).slice(0, 7)}.ics`;
    const ok = triggerFileDownload(filename, buildICSCalendar(visibleEvents), 'text/calendar;charset=utf-8;');
    if (!ok) showToast({ variant: 'error', message: 'Exportul calendarului este disponibil momentan doar pe web.' });
    else showToast({ variant: 'success', message: 'Calendarul lunii a fost exportat (.ics).' });
  };

  const navigateMonth = (delta: number) => {
    setCurrentDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const visibleEvents = useMemo(
    () => events.filter((event) => (showCancelled || !isCancelledEvent(event)) && eventMatchesSearch(event, searchValue)),
    [events, showCancelled, searchValue]
  );

  const scopedTeamName = useMemo(
    () => (filterTeamId != null ? teams.find((team) => team.id === filterTeamId)?.name ?? null : null),
    [filterTeamId, teams]
  );

  const monthName = currentDate.toLocaleString('ro-RO', { month: 'long' });
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
    { label: 'Toate', value: null },
    { label: 'Antrenamente', value: 'training' },
    { label: 'Meciuri', value: 'match' },
    { label: 'Cantonamente', value: 'camp' },
    { label: 'Vizite medicale', value: 'medical' },
  ];

  const resetKey = `${toDateKey(currentDate).slice(0, 7)}|${filterType}|${filterCoachId}|${filterTeamId}|${showCancelled}|${searchValue}`;

  const ViewSwitcher = () => (
    <View className={`flex-row items-center bg-white rounded-2xl border border-[#DDE7F5] p-1 gap-1 ${isMobile ? 'w-full' : ''}`}>
      {([
        { key: 'month' as const, icon: LayoutGrid, label: 'Month' },
        { key: 'week' as const, icon: CalendarDays, label: 'Week' },
        { key: 'agenda' as const, icon: List, label: 'Agenda' },
      ]).map(({ key, icon: Icon, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => setScheduleView(key)}
          className={`flex-row items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl ${isMobile ? 'flex-1' : ''} ${scheduleView === key ? 'bg-[#1D3E90]' : ''}`}
        >
          <Icon size={13} color={scheduleView === key ? '#fff' : 'var(--c-muted)'} />
          <Text className={`text-[11px] font-black uppercase tracking-widest ${scheduleView === key ? 'text-white' : 'text-slate-500'}`}>{VIEW_LABELS[key]}</Text>
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
              Programul meu
            </Text>
            <View className="flex-row items-center flex-wrap gap-2 mt-3">
              <View className="w-9 h-9 rounded-[14px] bg-white border border-[#DDE7F5] items-center justify-center shadow-sm">
                <CalendarIcon size={17} color="var(--c-ink)" />
              </View>
              <Text className="text-[#0E2041] text-[15px] font-black">{monthName} {viewYear}</Text>
              <Text className="text-slate-400 text-[11px] font-black uppercase tracking-widest">{visibleEvents.length} evenimente luna aceasta</Text>
            </View>
          </View>

          {!isDesktop && (
            <View className="flex-row items-center gap-4 flex-wrap">
              {(['Monthly', 'Attendance', 'Grade'] as const).map((tab) => (
                <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} className={`pb-1.5 ${activeTab === tab ? 'border-b-2 border-[#1D3E90]' : ''}`}>
                  <Text className={`font-bold text-[15px] ${activeTab === tab ? 'text-[#1D3E90]' : 'text-slate-400'}`}>{TOP_TAB_LABELS[tab]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View className={`${isMobile ? 'gap-2.5' : 'flex-row items-center gap-3'}`}>
            <View className={`${isMobile ? '' : 'flex-1'} flex-row flex-wrap items-center gap-2`}>
              {filterChips.map((chip) => {
                const isActive = filterType === chip.value;
                return (
                  <TouchableOpacity
                    key={chip.label}
                    onPress={() => setFilterType(chip.value)}
                    className={`${isMobile ? 'px-4 py-2' : 'px-5 py-3'} rounded-full border ${isActive ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-white border-[#CFE0EF]'}`}
                  >
                    <Text className={`text-[12px] font-black ${isActive ? 'text-white' : 'text-[#0E2041]'}`}>{chip.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className={`flex-row items-center gap-2 ${isMobile ? 'w-full justify-end' : ''}`}>
              <TouchableOpacity onPress={() => setShowFilterModal(true)} className={`${isMobile ? 'w-9 h-9' : 'w-11 h-11'} rounded-full bg-white border border-[#CFE0EF] items-center justify-center shadow-sm`} accessibilityLabel="More filters">
                <SlidersHorizontal size={isMobile ? 14 : 16} color="var(--c-brand-fg)" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExport} className={`${isMobile ? 'w-9 h-9' : 'w-11 h-11'} rounded-full bg-white border border-[#CFE0EF] items-center justify-center shadow-sm`} accessibilityLabel="Export month as .ics">
                <Download size={isMobile ? 14 : 16} color="var(--c-brand-fg)" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSyncFRB} disabled={syncing} className={`${isMobile ? 'w-9 h-9' : 'w-11 h-11'} rounded-full bg-white border border-[#CFE0EF] items-center justify-center shadow-sm`} accessibilityLabel="Sync FRB matches">
                <RotateCw size={isMobile ? 15 : 17} color="var(--c-brand-fg)" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View className={`${isMobile ? 'gap-3 mb-6' : 'flex-row items-center justify-between gap-3 mb-6'}`}>
          <View className={isMobile ? 'w-full' : ''}>
            <ViewSwitcher />
          </View>
          {!isMobile && <CalendarLegend />}
          {scopedTeamName ? (
            <View className="flex-row items-center gap-2 bg-[#1D3E90] rounded-full px-4 py-2 self-start">
              <Users size={13} color="#BFD0FF" />
              <Text className="text-[11px] font-black text-white uppercase tracking-wide">Echipă: {scopedTeamName}</Text>
              <TouchableOpacity onPress={() => setFilterTeamId(null)} accessibilityLabel="Elimină filtrul de echipă">
                <X size={13} color="#BFD0FF" />
              </TouchableOpacity>
            </View>
          ) : null}
          {searchValue ? (
            <View className="flex-row items-center gap-2 bg-white rounded-full border border-[#DDE7F5] px-4 py-2 self-start">
              <Search size={13} color="var(--c-faint)" />
              <Text className="text-[11px] font-bold text-slate-500">Caut „{searchValue}”</Text>
              <TouchableOpacity onPress={() => setSearchValue('')}>
                <X size={13} color="var(--c-faint)" />
              </TouchableOpacity>
            </View>
          ) : null}
          {isMobile && (
            <View className="w-full">
              <CalendarLegend />
            </View>
          )}
        </View>

        {filterTeamId != null && (
          <View className={`flex-row flex-wrap items-center gap-3 mb-6 ${isMobile ? '' : ''}`}>
            <TouchableOpacity
              onPress={() => setShowMedicalVisa(true)}
              className="flex-row items-center gap-2 h-11 px-4 rounded-2xl bg-white border border-[#DDE7F5] shadow-sm"
            >
              <ShieldCheck size={15} color="var(--c-success-fg)" />
              <Text className="text-[12px] font-black text-[#0E2041] uppercase tracking-wide">Vize medicale</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowPaymentsReport(true)}
              className="flex-row items-center gap-2 h-11 px-4 rounded-2xl bg-white border border-[#DDE7F5] shadow-sm"
            >
              <Receipt size={15} color="var(--c-brand-fg)" />
              <Text className="text-[12px] font-black text-[#0E2041] uppercase tracking-wide">Raport plăți</Text>
            </TouchableOpacity>
          </View>
        )}

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
            onDuplicate={(event) => setConfirmDuplicate(event)}
            onToggleCancelled={requestToggleCancelled}
            onGrade={navigateToGrade}
          />
        ) : (
          <View className={`${isDesktop ? 'flex-row gap-6 2xl:gap-8 items-start w-full' : 'gap-4'}`}>
            <View className="flex-1 min-w-0">
              <View className="bg-white rounded-[32px] border border-[#DDE7F5] shadow-lg overflow-hidden">
                <View className="px-6 py-5 flex-row items-center justify-between border-b border-[#DDE7F5]">
                  <View>
                    <Text className="text-[26px] font-black text-[#0E2041]">{monthName} {viewYear}</Text>
                    <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">{visibleEvents.length} evenimente luna aceasta</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity onPress={() => navigateMonth(-1)} className="w-10 h-10 items-center justify-center rounded-xl bg-[#F4F8FD]">
                      <ChevronLeft color="var(--c-ink)" size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigateMonth(1)} className="w-10 h-10 items-center justify-center rounded-xl bg-[#F4F8FD]">
                      <ChevronRight color="var(--c-ink)" size={18} />
                    </TouchableOpacity>
                  </View>
                </View>

                <MonthlyCalendarGrid currentDate={currentDate} events={visibleEvents} onSelectEvent={navigateToEvent} onSelectDay={openDaySchedule} />
              </View>
            </View>

            <View className={`${isDesktop ? 'shrink-0' : 'w-full'} gap-5`} style={isDesktop ? { width: isWideDesktop ? 400 : 360 } : undefined}>
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-black text-[#0E2041]">Evenimente viitoare</Text>
                <TouchableOpacity onPress={() => setScheduleView('agenda')}>
                  <Text className="text-[#1D3E90] text-[12px] font-black">Vezi tot</Text>
                </TouchableOpacity>
              </View>

              {featuredUpcoming.length === 0 ? (
                <View className="bg-white rounded-[28px] border border-[#DDE7F5] p-6 items-center">
                  <CalendarIcon size={28} color="var(--c-faint)" />
                  <Text className="text-slate-400 font-bold mt-3 text-center">Niciun eveniment viitor în această vedere.</Text>
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
                    <Text className="text-[#BFD0FF] text-[10px] font-black uppercase tracking-widest">Viitoare</Text>
                    <View className="w-7 h-7 rounded-full bg-white/15 items-center justify-center">
                      <TrendingUp size={13} color="var(--c-surface-tint)" />
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
                    <Text className="text-[#BFEFFF] text-[10px] font-black uppercase tracking-widest">Următorul meci</Text>
                    <View className="w-7 h-7 rounded-full bg-white/15 items-center justify-center">
                      <Trophy size={13} color="var(--c-surface-tint)" />
                    </View>
                  </View>
                  <Text className="text-white text-[22px] font-black" numberOfLines={1}>
                    {nextMatch ? new Date(nextMatch.startTime).toLocaleDateString('ro-RO', { month: 'short', day: 'numeric' }) : 'Niciunul programat'}
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
          <AttendanceTab events={events} teams={teams} initialTeamId={filterTeamId} />
        </View>
      )}
      {activeTab === 'Grade' && (
        <View className="flex-1">
          <GradeTab />
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

      <TeamMedicalVisaModal
        visible={showMedicalVisa}
        teamId={filterTeamId}
        teamName={scopedTeamName}
        onClose={() => setShowMedicalVisa(false)}
        onSuccess={(updated, failed) => {
          if (updated > 0) {
            showToast({ variant: 'success', message: `Viză medicală actualizată pentru ${updated} ${updated === 1 ? 'jucător' : 'jucători'}.` });
          }
          if (failed > 0) {
            showToast({ variant: 'error', message: `${failed} ${failed === 1 ? 'actualizare a eșuat' : 'actualizări au eșuat'}.` });
          }
        }}
      />

      <TeamPaymentsReportModal
        visible={showPaymentsReport}
        teamId={filterTeamId}
        teamName={scopedTeamName}
        onClose={() => setShowPaymentsReport(false)}
      />

      <ConfirmDialog
        visible={confirmDuplicate !== null}
        title="Duplici evenimentul?"
        message={confirmDuplicate ? `Se va crea o copie a evenimentului „${confirmDuplicate.title}”.` : undefined}
        confirmLabel="Duplică"
        cancelLabel="Renunță"
        onConfirm={() => { if (confirmDuplicate) void handleDuplicate(confirmDuplicate); setConfirmDuplicate(null); }}
        onCancel={() => setConfirmDuplicate(null)}
      />

      <ConfirmDialog
        visible={confirmCancel !== null}
        title="Anulezi evenimentul?"
        message={confirmCancel ? `„${confirmCancel.title}” va fi marcat ca anulat. Poți reactiva evenimentul oricând.` : undefined}
        confirmLabel="Anulează evenimentul"
        cancelLabel="Renunță"
        destructive
        onConfirm={() => { if (confirmCancel) void handleToggleCancelled(confirmCancel); setConfirmCancel(null); }}
        onCancel={() => setConfirmCancel(null)}
      />

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
