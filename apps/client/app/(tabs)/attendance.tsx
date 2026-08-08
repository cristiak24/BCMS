import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import GlassCard from '../../components/ui/GlassCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import Pagination, { usePagination } from '../../components/ui/Pagination';
import SectionHeader from '../../components/ui/SectionHeader';
import { CalendarEvent, eventsApi } from '../../services/eventsApi';
import {
  isPresentAttendanceStatus,
  loadPlayerAttendanceDetails,
  PlayerAttendanceRecord,
  PlayerAttendanceSummary,
} from '../../utils/playerAttendance';
import { useFirebaseAuth } from '../../context/AuthContext';
import CoachAttendance from '../../components/coach/CoachAttendance';
import { normalizeRole } from '../../utils/authSession';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ro-RO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function eventTypeIcon(type: CalendarEvent['type']) {
  if (type === 'match') return 'sports-basketball' as const;
  if (type === 'camp') return 'terrain' as const;
  if (type === 'admin') return 'badge' as const;
  return 'fitness-center' as const;
}

function statusTone(status?: string | null) {
  const normalized = String(status ?? '').toLowerCase();

  if (isPresentAttendanceStatus(normalized)) {
    return { label: 'Prezent', bg: 'bg-emerald-50', fg: 'text-emerald-700', color: 'var(--c-success-fg)', icon: 'check-circle' as const };
  }

  if (normalized === 'absent') {
    return { label: 'Absent', bg: 'bg-red-50', fg: 'text-red-700', color: 'var(--c-danger)', icon: 'cancel' as const };
  }

  if (normalized === 'medical' || normalized === 'excused') {
    return { label: 'Medical', bg: 'bg-amber-50', fg: 'text-amber-700', color: 'var(--c-warning-fg)', icon: 'medical-services' as const };
  }

  return { label: 'Nemarcat', bg: 'bg-slate-100', fg: 'text-slate-500', color: 'var(--c-muted)', icon: 'radio-button-unchecked' as const };
}

function PlayerAttendanceScreen() {
  const { session } = useFirebaseAuth();
  const [summary, setSummary] = useState<PlayerAttendanceSummary>({ rate: null, present: 0, total: 0 });
  const [records, setRecords] = useState<PlayerAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleRecords = useMemo(
    () => records.filter((record) => record.status !== null),
    [records]
  );

  // The history was an unbounded stack — 40 sessions meant 40 rows and a very
  // long scroll with no way to move through it. resetKey is the record count so
  // a refresh that changes the set returns to page 1.
  const pager = usePagination(visibleRecords, 8, String(visibleRecords.length));

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const events = await eventsApi.getEvents();
      const details = await loadPlayerAttendanceDetails(session, events, 40);
      setSummary(details.summary);
      setRecords(details.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu s-a putut încărca prezența.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHeader
          title="Prezență"
          subtitle="Prezența ta marcată la sesiunile recente ale clubului."
          actions={
            <Pressable
              onPress={() => loadData(true)}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
              className="w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

        <View className="gap-4">
        {/* Two tiles, so two columns — NOT admin's 4-up roster grid. Copying
            `xl:grid-cols-4` here left the two cards in the leftmost 480px of a
            972px row with 492px of dead space beside them. Column count has to
            follow the item count, not the reference screen. */}
        <View className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <GlassCard>
            <Text className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--c-muted)]">Rată prezență</Text>
            {loading ? (
              <View>
                <Skeleton className="h-10 w-24 mt-2" />
                <Skeleton className="h-3 w-40 mt-3" />
              </View>
            ) : (
              <>
                <Text className="text-[25px] font-bold mt-1.5 text-[var(--c-ink)]">
                  {summary.rate == null ? '—' : `${summary.rate}%`}
                </Text>
                <Text className="text-[12px] font-medium mt-2 text-[var(--c-muted)]">
                  {summary.total ? `${summary.present}/${summary.total} sesiuni prezent` : 'Nicio sesiune marcată încă'}
                </Text>
              </>
            )}
          </GlassCard>

          <GlassCard>
            <Text className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--c-muted)]">Sesiuni marcate</Text>
            {loading ? (
              <View>
                <Skeleton className="h-10 w-16 mt-2" />
                <Skeleton className="h-3 w-44 mt-3" />
              </View>
            ) : (
              <>
                <Text className="text-[25px] font-bold mt-1.5 text-[var(--c-ink)]">{summary.total}</Text>
                <Text className="text-[12px] font-medium mt-2 text-[var(--c-muted)]">Înregistrări recente de prezență</Text>
              </>
            )}
          </GlassCard>
        </View>

        {/* Flat section, not a card wrapping cards. The outer GlassCard put a
            border around a list of bordered rows, so every record read as
            nested boxes. */}
        <View>
          <SectionHeader
            title="Înregistrări recente"
            subtitle="Sesiuni în care prezența ta a fost marcată."
          />

          {loading ? (
            // Same row geometry as a loaded record (48px tile, two text lines, badge)
            // so the card keeps its height when the records land.
            <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă prezența">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-[68px] w-full rounded-[14px]" />
              ))}
            </View>
          ) : error ? (
            <ErrorState
              title="Nu am putut încărca prezența"
              message={error}
              actionLabel="Reîncearcă"
              onAction={() => loadData(true)}
            />
          ) : visibleRecords.length === 0 ? (
            <EmptyState
              icon="event-busy"
              compact
              title="Nicio prezență marcată încă"
              message="Sesiunile la care antrenorul îți marchează prezența apar aici."
            />
          ) : (
            <View className="gap-2.5">
              {pager.pageItems.map((record) => {
                const tone = statusTone(record.status);

                return (
                  <View
                    key={record.event.id}
                    className="rounded-[14px] border px-4 py-3 flex-row gap-3 items-center"
                    style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
                  >
                    <View
                      className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--c-surface-tint)' }}
                    >
                      <MaterialIcons name={eventTypeIcon(record.event.type)} size={17} color="var(--c-brand-fg)" />
                    </View>

                    {/* teamName dropped: it is the player's own squad on every
                        row, so it added a third line of identical text to each
                        record. */}
                    <View className="flex-1 min-w-0">
                      <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                        {record.event.title}
                      </Text>
                      <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                        {formatDateTime(record.event.startTime)}
                        {record.event.location ? ` · ${record.event.location}` : ''}
                      </Text>
                    </View>

                    <View className={`${tone.bg} px-2.5 py-1 rounded-full flex-row items-center gap-1.5 shrink-0`}>
                      <MaterialIcons name={tone.icon} size={13} color={tone.color} />
                      <Text className={`${tone.fg} text-[11px] font-semibold`}>{tone.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {!loading && !error && visibleRecords.length ? (
            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              onPageChange={pager.setPage}
              rangeStart={pager.rangeStart}
              rangeEnd={pager.rangeEnd}
              total={pager.total}
              itemNoun="sesiuni"
            />
          ) : null}
        </View>
        </View>
      </PageContainer>
    </ScrollView>
  );
}

export default function AttendanceScreen() {
  const { session } = useFirebaseAuth();

  if (normalizeRole(session?.role) === 'coach') {
    return <CoachAttendance />;
  }

  return <PlayerAttendanceScreen />;
}
