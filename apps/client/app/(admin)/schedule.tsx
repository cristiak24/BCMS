import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from '@/src/web/reactNative';
import { useRouter, useLocalSearchParams } from '@/src/web/expoRouter';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ToastHost, useToasts } from '../../components/ui/Toast';
import { LinearGradient } from '@/src/web/linearGradient';
import {
  Calendar as CalendarIcon, Plus, TrendingUp, Trophy, ShieldCheck, Receipt,
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
import { MonthlyCalendarGrid } from '../../components/schedule/admin/ScheduleCalendarGrid';
import { ScheduleToolbar } from '../../components/schedule/admin/ScheduleToolbar';
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

  // Per-type counts feed the toolbar chips (which double as the calendar's
  // legend). Computed off the search-filtered set, ignoring the active type
  // filter, so each chip always shows its own total rather than 0 once another
  // type is selected.
  const typeCounts = useMemo(() => {
    const base = events.filter(
      (event) => (showCancelled || !isCancelledEvent(event)) && eventMatchesSearch(event, searchValue),
    );
    return base.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});
  }, [events, showCancelled, searchValue]);

  // "Advanced" = the filters that live behind the sliders modal (coach, team,
  // show-cancelled), separate from the always-visible type chips. Drives the
  // badge on the filter button.
  const advancedFilterCount = (filterCoachId != null ? 1 : 0) + (filterTeamId != null ? 1 : 0) + (showCancelled ? 1 : 0);

  const resetKey = `${toDateKey(currentDate).slice(0, 7)}|${filterType}|${filterCoachId}|${filterTeamId}|${showCancelled}|${searchValue}`;

  const MonthlyBody = () => (
    <View className={`${isMobile ? 'px-4 pt-3' : 'px-6 xl:px-8 pt-4'} w-full`}>
      <View className="w-full">
        {/* Mobile-only sub-tab switcher — on desktop these live in the app header. */}
        {!isDesktop && (
          <View
            className="flex-row items-center rounded-[10px] p-[3px] gap-[2px] mb-3 self-start"
            style={{ backgroundColor: 'var(--c-surface-3)' }}
          >
            {(['Monthly', 'Attendance', 'Grade'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className="px-3 h-7 rounded-[8px] justify-center"
                style={activeTab === tab ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
              >
                <Text
                  className="text-[12px] font-semibold"
                  style={{ color: activeTab === tab ? 'var(--c-ink)' : 'var(--c-muted)' }}
                >
                  {TOP_TAB_LABELS[tab]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View className="mb-4">
          <ScheduleToolbar
            monthLabel={monthName}
            year={viewYear}
            eventCount={visibleEvents.length}
            onNavigateMonth={navigateMonth}
            onToday={() => setCurrentDate(new Date())}
            view={scheduleView}
            onViewChange={setScheduleView}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            typeCounts={typeCounts}
            activeFilterCount={advancedFilterCount}
            onOpenFilters={() => setShowFilterModal(true)}
            onExport={handleExport}
            onSync={handleSyncFRB}
            syncing={syncing}
            isMobile={isMobile}
            scopedTeamName={scopedTeamName}
            onClearTeam={() => setFilterTeamId(null)}
            searchValue={searchValue}
            onClearSearch={() => setSearchValue('')}
          />
        </View>

        {/* Team-scoped shortcuts, only present when a team filter is applied. */}
        {filterTeamId != null && (
          <View className="flex-row flex-wrap items-center gap-2 mb-4">
            <TouchableOpacity
              onPress={() => setShowMedicalVisa(true)}
              className="flex-row items-center gap-2 h-9 px-3 rounded-[10px] bg-[var(--c-surface)] border border-[var(--c-border)]"
            >
              <ShieldCheck size={14} color="var(--c-success-fg)" />
              <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Vize medicale</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowPaymentsReport(true)}
              className="flex-row items-center gap-2 h-9 px-3 rounded-[10px] bg-[var(--c-surface)] border border-[var(--c-border)]"
            >
              <Receipt size={14} color="var(--c-brand-fg)" />
              <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Raport plăți</Text>
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
          <View className={`${isDesktop ? 'flex-row gap-5 items-start w-full' : 'gap-4'}`}>
            <View className="flex-1 min-w-0">
              {/* Month header removed — the toolbar above already owns the month
                  label, count and stepper. The grid card is now just the grid. */}
              <MonthlyCalendarGrid currentDate={currentDate} events={visibleEvents} onSelectEvent={navigateToEvent} onSelectDay={openDaySchedule} />
            </View>

            <View className={`${isDesktop ? 'shrink-0' : 'w-full'} gap-4`} style={isDesktop ? { width: isWideDesktop ? 380 : 340 } : undefined}>
              <View className="flex-row items-center justify-between">
                <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Evenimente viitoare</Text>
                <TouchableOpacity onPress={() => setScheduleView('agenda')}>
                  <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Vezi tot</Text>
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
                  colors={['var(--c-brand-surface)', 'var(--c-brand-strong)']}
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
