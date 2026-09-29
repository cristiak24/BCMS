import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from '@/src/web/reactNative';
import { Calendar as CalendarIcon, Clock, RotateCw } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { sortByStartTime, isUpcomingEvent } from '../scheduleShared';
import { ScheduleEventRow, EventGroupCard } from './ScheduleEventRow';

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
  const button = (label: string, disabled: boolean, onPress: () => void, primary?: boolean) => (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      className="ui-press h-8 px-3 rounded-[9px] border justify-center"
      style={{
        backgroundColor: primary && !disabled ? 'var(--c-brand-surface)' : 'var(--c-surface)',
        borderColor: primary && !disabled ? 'transparent' : 'var(--c-border)',
        opacity: disabled ? 0.5 : 1,
      } as any}
    >
      <Text className="text-[12px] font-semibold" style={{ color: primary && !disabled ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View className="flex-row items-center justify-between mt-2.5 px-0.5">
      <Text className="t-meta t-num" style={{ color: 'var(--c-faint)' }}>Pagina {page + 1} din {totalPages}</Text>
      <View className="flex-row gap-1.5">
        {button('Înapoi', page === 0, () => setPage((p) => Math.max(p - 1, 0)))}
        {button('Înainte', page >= totalPages - 1, () => setPage((p) => Math.min(p + 1, totalPages - 1)), true)}
      </View>
    </View>
  );
}

function SectionTitle({ title, meta, trailing }: { title: string; meta: string; trailing?: React.ReactNode }) {
  return (
    <View className="flex-row items-end justify-between gap-3 mb-2.5 px-0.5">
      <View className="flex-1 min-w-0">
        <Text className="text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        <Text className="t-meta mt-0.5" style={{ color: 'var(--c-faint)' }}>{meta}</Text>
      </View>
      {trailing}
    </View>
  );
}

function EmptyBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="rounded-[16px] border border-dashed px-5 py-7 items-center" style={{ borderColor: 'var(--c-border)' } as any}>
      {icon}
      <Text className="t-meta mt-2 text-center" style={{ color: 'var(--c-muted)' }}>{text}</Text>
    </View>
  );
}

function rangeLabel(page: number, shown: number, total: number) {
  if (!total) return '0';
  return `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + shown} din ${total}`;
}

/**
 * Agenda: upcoming and past events as grouped cards of rows (the same row the
 * month view's "Evenimente viitoare" uses). Desktop rows carry their actions
 * as icon buttons; on phones a row simply opens the event.
 */
export function ScheduleAgendaList({
  events,
  isMobile,
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
  isSmallPhone?: boolean;
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
    <View className="gap-6">
      <View>
        <SectionTitle
          title="Viitoare"
          meta={rangeLabel(upcomingPagination.page, upcomingPagination.paginated.length, upcomingEvents.length)}
          trailing={(
            <TouchableOpacity
              onPress={onSyncFRB}
              disabled={syncing}
              accessibilityLabel="Sincronizează meciurile FRB"
              className="ui-press flex-row items-center gap-1.5 h-8 px-3 rounded-[9px] border"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', opacity: syncing ? 0.7 : 1 } as any}
            >
              {syncing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <RotateCw size={13} color="var(--c-brand-fg)" />}
              <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{syncing ? 'Se sincronizează…' : 'Meciuri FRB'}</Text>
            </TouchableOpacity>
          )}
        />
        {upcomingEvents.length === 0 ? (
          <EmptyBox icon={<CalendarIcon size={22} color="var(--c-faint)" />} text="Niciun eveniment viitor în această lună." />
        ) : (
          <EventGroupCard>
            {upcomingPagination.paginated.map((event) => (
              <ScheduleEventRow
                key={event.id}
                item={event}
                showActions={!isMobile}
                onPress={() => onSelectEvent(event)}
                onAttendance={() => onAttendance(event)}
                onDuplicate={() => onDuplicate(event)}
                onToggleCancelled={() => onToggleCancelled(event)}
              />
            ))}
          </EventGroupCard>
        )}
        {upcomingEvents.length > PAGE_SIZE ? (
          <Pagination page={upcomingPagination.page} totalPages={upcomingPagination.totalPages} setPage={upcomingPagination.setPage} />
        ) : null}
      </View>

      <View className="mb-6">
        <SectionTitle
          title="Trecute"
          meta={rangeLabel(pastPagination.page, pastPagination.paginated.length, pastEvents.length)}
        />
        {pastEvents.length === 0 ? (
          <EmptyBox icon={<Clock size={22} color="var(--c-faint)" />} text="Niciun eveniment trecut în această lună." />
        ) : (
          <EventGroupCard>
            {pastPagination.paginated.map((event) => (
              <ScheduleEventRow
                key={`past-${event.id}`}
                item={event}
                showActions={!isMobile}
                onPress={() => onSelectEvent(event)}
                onGrade={() => onGrade(event)}
                onDuplicate={() => onDuplicate(event)}
              />
            ))}
          </EventGroupCard>
        )}
        {pastEvents.length > PAGE_SIZE ? (
          <Pagination page={pastPagination.page} totalPages={pastPagination.totalPages} setPage={pastPagination.setPage} />
        ) : null}
      </View>
    </View>
  );
}
