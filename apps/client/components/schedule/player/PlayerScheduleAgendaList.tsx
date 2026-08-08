import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from '@/src/web/reactNative';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { sortByStartTime, isUpcomingEvent } from '../scheduleShared';
import { PlayerScheduleEventCard } from './PlayerScheduleEventCard';

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
    <View className="flex-row items-center justify-between rounded-[20px] border p-3 mb-4" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
      <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>Pagina {page + 1} din {totalPages}</Text>
      <View className="flex-row gap-1.5">
        <TouchableOpacity
          disabled={page === 0}
          onPress={() => setPage((p) => Math.max(p - 1, 0))}
          className={`h-8 px-3 items-center justify-center rounded-[9px] border border-[var(--c-border)] bg-[var(--c-surface)] ${page === 0 ? 'opacity-40' : ''}`}
        >
          <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Înapoi</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={page >= totalPages - 1}
          onPress={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
          style={page >= totalPages - 1 ? undefined : { backgroundColor: 'var(--c-brand-surface)' }}
          className={`h-8 px-3 items-center justify-center rounded-[9px] border ${
            page >= totalPages - 1 ? 'opacity-40 border-[var(--c-border)]' : 'border-transparent'
          }`}
        >
          <Text
            className="text-[12px] font-semibold"
            style={{ color: page >= totalPages - 1 ? 'var(--c-ink-soft)' : 'var(--c-on-brand)' }}
          >
            Înainte
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Read-only agenda list — player equivalent of admin's ScheduleAgendaList,
 * without FRB sync, duplicate, or "notează" actions.
 */
export function PlayerScheduleAgendaList({
  events,
  resetKey,
  isMobile,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  resetKey: string;
  isMobile: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const now = Date.now();
  const sortedEvents = useMemo(() => sortByStartTime(events), [events]);
  const upcomingEvents = useMemo(() => sortedEvents.filter((event) => isUpcomingEvent(event, now)), [sortedEvents, now]);
  const pastEvents = useMemo(() => sortedEvents.filter((event) => !isUpcomingEvent(event, now)).reverse(), [sortedEvents, now]);

  const upcomingPagination = usePaginated(upcomingEvents, resetKey);
  const pastPagination = usePaginated(pastEvents, resetKey);

  return (
    <View>
      <View className="mb-3">
        <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Evenimente viitoare</Text>
        <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-faint)' }}>{upcomingEvents.length} programate</Text>
      </View>

      {upcomingEvents.length === 0 ? (
        <View className="rounded-[24px] border p-8 items-center mb-6" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <CalendarIcon size={28} color="var(--c-faint)" />
          <Text className="font-bold mt-3 text-center" style={{ color: 'var(--c-muted)' }}>Niciun eveniment viitor în această vedere.</Text>
        </View>
      ) : (
        <View className="gap-2.5 mb-2">
          {upcomingPagination.paginated.map((event) => (
            <PlayerScheduleEventCard key={event.id} item={event} isMobile={isMobile} onPress={() => onSelectEvent(event)} />
          ))}
        </View>
      )}

      {upcomingEvents.length > PAGE_SIZE ? (
        <Pagination page={upcomingPagination.page} totalPages={upcomingPagination.totalPages} setPage={upcomingPagination.setPage} />
      ) : null}

      <View className="mt-4 mb-3">
        <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Evenimente trecute</Text>
        <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-faint)' }}>{pastEvents.length} finalizate</Text>
      </View>

      {pastEvents.length === 0 ? (
        <View className="rounded-[24px] border border-dashed p-8 items-center mb-6" style={{ borderColor: 'var(--c-border)' }}>
          <Clock size={28} color="var(--c-faint)" />
          <Text className="font-bold mt-3 text-center" style={{ color: 'var(--c-muted)' }}>Niciun eveniment trecut în această vedere.</Text>
        </View>
      ) : (
        <View className="gap-2.5">
          {pastPagination.paginated.map((event) => (
            <PlayerScheduleEventCard key={`past-${event.id}`} item={event} isMobile={isMobile} onPress={() => onSelectEvent(event)} />
          ))}
        </View>
      )}

      {pastEvents.length > PAGE_SIZE ? (
        <Pagination page={pastPagination.page} totalPages={pastPagination.totalPages} setPage={pastPagination.setPage} />
      ) : null}
    </View>
  );
}
