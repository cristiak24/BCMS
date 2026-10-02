import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from '@/src/web/reactNative';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import { useResponsive } from '../../hooks/useResponsive';
import { RO_LOCALE, RO_MONTHS, getEventTypeMeta } from './scheduleShared';
import { useHeader } from '../HeaderContext';
import ThemedCheckbox from '../myclub/ThemedCheckbox';
import ConfirmDialog from '../ui/ConfirmDialog';
import Button from '../ui/Button';
import FilterChips from '../ui/FilterChips';
import SelectField from '../ui/SelectField';
import Pagination, { usePagination } from '../ui/Pagination';
import { EmptyState } from '../ui/ScreenState';
import { ToastHost, useToasts } from '../ui/Toast';
import { Skeleton } from '../ui/Skeleton';

type GradeStatusFilter = 'pending' | 'graded';
type GradeTypeFilter = 'all' | CalendarEvent['type'];

const PAGE_SIZE = 15;

function isEventGraded(event: CalendarEvent) {
  return event.status === 'completed' || event.status === 'graded';
}

export function GradeTab() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const { searchValue: search } = useHeader();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GradeStatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<GradeTypeFilter>('all');
  const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');
  const [coachFilter, setCoachFilter] = useState<number | 'all'>('all');
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

  const { page, totalPages, pageItems: paginatedEvents, setPage, rangeStart, rangeEnd, total } = usePagination(
    filteredEvents,
    PAGE_SIZE,
    `${statusFilter}|${typeFilter}|${teamFilter}|${coachFilter}|${search}|${viewYear}-${viewMonth}`,
  );

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

  const statusScoped = pastEvents.filter((event) => (statusFilter === 'graded' ? isEventGraded(event) : !isEventGraded(event)));
  const typeOptions = [
    { key: 'all' as GradeTypeFilter, label: 'Toate', count: statusScoped.length },
    ...(['training', 'match', 'camp', 'admin'] as const).map((type) => ({
      key: type as GradeTypeFilter,
      label: getEventTypeMeta(type).label,
      dot: getEventTypeMeta(type).solid,
      count: statusScoped.filter((e) => e.type === type).length,
    })).filter((o) => o.count > 0 || typeFilter === o.key),
  ];

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 132 }}>
      <View className={`${isMobile ? 'px-4 pt-3' : 'px-6 xl:px-8 pt-4'} w-full gap-4`}>
        {/* Period + status */}
        <View className="flex-row flex-wrap items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Pressable onPress={() => setCurrentDate(new Date(viewYear, viewMonth - 1, 1))} accessibilityLabel="Luna anterioară" className="ui-press w-8 h-8 rounded-[9px] items-center justify-center border" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' }}>
              <ChevronLeft size={16} color="var(--c-ink-soft)" />
            </Pressable>
            <Text className="text-[15px] font-bold px-2.5 min-w-[132px]" style={{ color: 'var(--c-ink)' }}>
              {RO_MONTHS[viewMonth].charAt(0).toUpperCase() + RO_MONTHS[viewMonth].slice(1)} {viewYear}
            </Text>
            <Pressable onPress={() => setCurrentDate(new Date(viewYear, viewMonth + 1, 1))} accessibilityLabel="Luna următoare" className="ui-press w-8 h-8 rounded-[9px] items-center justify-center border" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' }}>
              <ChevronRight size={16} color="var(--c-ink-soft)" />
            </Pressable>
          </View>
          <View className="p-[3px] rounded-[10px] flex-row sm:ml-auto" style={{ backgroundColor: 'var(--c-surface-3)' }}>
            {(['pending', 'graded'] as GradeStatusFilter[]).map((status) => {
              const active = statusFilter === status;
              const count = status === 'pending' ? pendingEvents.length : gradedEvents.length;
              return (
                <Pressable
                  key={status}
                  onPress={() => setStatusFilter(status)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className="px-3 h-[30px] rounded-[8px] flex-row items-center gap-1.5"
                  style={active ? ({ backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any) : undefined}
                >
                  <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>{status === 'pending' ? 'De notat' : 'Notate'}</Text>
                  <Text className="t-num text-[11.5px] font-semibold" style={{ color: status === 'pending' && count > 0 ? 'var(--c-warning-fg)' : 'var(--c-faint)' }}>{count}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Filters */}
        <View className="flex-col lg:flex-row lg:items-center gap-2">
          {teamOptions.length > 1 ? (
            <SelectField
              label="Echipă"
              icon="groups"
              options={[{ key: 'all', label: 'Toate echipele' }, ...teamOptions.map((t) => ({ key: String(t.id), label: t.name }))]}
              value={teamFilter === 'all' ? 'all' : String(teamFilter)}
              onChange={(v) => setTeamFilter(v === 'all' ? 'all' : Number(v))}
              className="w-full lg:w-[240px]"
            />
          ) : null}
          {coachOptions.length > 1 ? (
            <SelectField
              label="Antrenor"
              icon="person"
              options={[{ key: 'all', label: 'Toți antrenorii' }, ...coachOptions.map((c) => ({ key: String(c.id), label: c.name }))]}
              value={coachFilter === 'all' ? 'all' : String(coachFilter)}
              onChange={(v) => setCoachFilter(v === 'all' ? 'all' : Number(v))}
              className="w-full lg:w-[220px]"
            />
          ) : null}
          <View className="flex-1 min-w-0">
            <FilterChips label="Tip eveniment" options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
          </View>
        </View>

        {selectable && selectedIds.size > 0 ? (
          <View className="flex-row items-center gap-3 rounded-[12px] px-3.5 py-2.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
            <Text className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
              {selectedIds.size} {selectedIds.size === 1 ? 'eveniment selectat' : 'evenimente selectate'}
            </Text>
            <Button size="sm" variant="ghost" label="Renunță" onPress={() => setSelectedIds(new Set())} />
            <Button size="sm" variant="primary" icon="done-all" label="Marchează ca notate" loading={bulkBusy} onPress={() => setConfirmBulk(true)} />
          </View>
        ) : null}

        {loading ? (
          <View className="gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[58px] w-full rounded-[12px]" />)}
          </View>
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            compact
            icon={statusFilter === 'pending' ? 'task-alt' : 'search-off'}
            title={statusFilter === 'pending' ? 'Nimic de notat' : 'Niciun eveniment notat'}
            message={`Niciun eveniment ${statusFilter === 'graded' ? 'notat' : 'de notat'} în ${RO_MONTHS[viewMonth]} ${viewYear} pentru filtrele alese.`}
          />
        ) : (
          <>
            <View className="rounded-[14px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
              {selectable ? (
                <View className="flex-row items-center gap-2 px-3 py-2 border-b" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                  <ThemedCheckbox checked={pageAllSelected} onToggle={toggleSelectPage} ariaLabel="Selectează pagina" size={18} />
                  <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>{pageAllSelected ? 'Deselectează pagina' : 'Selectează pagina'}</Text>
                </View>
              ) : null}
              {paginatedEvents.map((item, index) => {
                const eventDate = new Date(item.startTime);
                const meta = getEventTypeMeta(item.type);
                const graded = isEventGraded(item);
                const checked = selectedIds.has(item.id);
                return (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-3 px-3 py-2.5"
                    style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: 'var(--c-border)', backgroundColor: checked ? 'var(--c-surface-tint)' : 'transparent' } as any}
                  >
                    {selectable ? (
                      <ThemedCheckbox checked={checked} onToggle={() => toggleSelect(item.id)} ariaLabel={`Selectează ${item.title}`} size={18} />
                    ) : null}
                    <View className="w-11 items-center shrink-0">
                      <Text className="text-[10px] font-bold uppercase" style={{ color: 'var(--c-muted)' }}>
                        {eventDate.toLocaleString(RO_LOCALE, { month: 'short' }).replace('.', '')}
                      </Text>
                      <Text className="t-num text-[17px] font-bold leading-none mt-0.5" style={{ color: 'var(--c-ink)' }}>{eventDate.getDate()}</Text>
                    </View>
                    <View className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: meta.solid }} />
                    <Pressable onPress={() => router.push(`/admin/attendance/${item.id}` as any)} accessibilityRole="link" className="flex-1 min-w-0 text-left">
                      <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{item.title}</Text>
                      <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                        {[eventDate.toLocaleTimeString(RO_LOCALE, { hour: '2-digit', minute: '2-digit' }), meta.label, item.teamName, item.location].filter(Boolean).join(' · ')}
                      </Text>
                    </Pressable>
                    {graded ? (
                      <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1 shrink-0" style={{ backgroundColor: 'var(--c-success-bg)' }}>
                        <MaterialIcons name="check" size={13} color="var(--c-success-fg)" />
                        <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-success-fg)' }}>Notat</Text>
                      </View>
                    ) : (
                      <Button size="sm" variant="primary" icon="how-to-reg" label="Notează" iconOnlyOnMobile onPress={() => router.push(`/admin/attendance/${item.id}` as any)} />
                    )}
                  </View>
                );
              })}
            </View>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} itemNoun="evenimente" />
          </>
        )}
      </View>

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
    </ScrollView>
  );
}
