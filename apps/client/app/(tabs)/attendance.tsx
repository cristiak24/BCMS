import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import GlassCard from '../../components/ui/GlassCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import Pagination, { usePagination } from '../../components/ui/Pagination';
import ProgressRing from '../../components/ui/ProgressRing';
import DateTile from '../../components/ui/DateTile';
import StatCard from '../../components/ui/StatCard';
import { eventTypeMeta } from '../../components/coach/coachDisplay';
import {
  isCountedAttendanceStatus,
  isPresentAttendanceStatus,
  loadMyAttendanceHistory,
  PlayerAttendanceRecord,
  PlayerAttendanceSummary,
} from '../../utils/playerAttendance';
import { useSession } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { normalizeRole } from '../../utils/authSession';

/** How many recent marked sessions the history covers. */
const HISTORY_LIMIT = 60;
const PAGE_SIZE = 10;

type StatusKey = 'present' | 'absent' | 'excused';
type FilterKey = 'all' | StatusKey;

function statusKey(status?: string | null): StatusKey | null {
  const normalized = String(status ?? '').toLowerCase();
  if (isPresentAttendanceStatus(normalized)) return 'present';
  if (normalized === 'absent') return 'absent';
  if (normalized === 'medical' || normalized === 'excused') return 'excused';
  return null;
}

// Token pairs — the previous version used named Tailwind utilities
// (bg-emerald-50 / text-emerald-700) that had to be patched for dark mode.
const STATUS_META: Record<StatusKey, { label: string; fg: string; bg: string; bar: string; icon: string }> = {
  present: { label: 'Prezent', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', bar: 'var(--c-success)', icon: 'check-circle' },
  absent: { label: 'Absent', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', bar: 'var(--c-danger)', icon: 'cancel' },
  excused: { label: 'Motivat', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', bar: 'var(--c-warning)', icon: 'medical-services' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Toate' },
  { key: 'present', label: 'Prezent' },
  { key: 'absent', label: 'Absent' },
  { key: 'excused', label: 'Motivat' },
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ro-RO', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
}

function monthLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const text = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Consecutive present sessions from the newest counted one. */
function currentStreak(records: PlayerAttendanceRecord[]) {
  let streak = 0;
  for (const record of records) {
    if (!isCountedAttendanceStatus(record.status)) continue;
    if (isPresentAttendanceStatus(record.status)) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function rateTone(rate: number | null) {
  if (rate == null) return { label: 'Încă nu există date', color: 'var(--c-muted)' };
  if (rate >= 90) return { label: 'Ritm de elită', color: 'var(--c-success-fg)' };
  if (rate >= 75) return { label: 'Pe drumul bun', color: 'var(--c-brand-fg)' };
  if (rate >= 50) return { label: 'Poate mai bine', color: 'var(--c-warning-fg)' };
  return { label: 'Necesită atenție', color: 'var(--c-danger-fg)' };
}

function AttendanceRow({ record }: { record: PlayerAttendanceRecord }) {
  const key = statusKey(record.status);
  const meta = key ? STATUS_META[key] : null;
  const type = eventTypeMeta(record.event.type);
  const note = record.attendance?.note?.trim();

  return (
    <View
      className="relative overflow-hidden rounded-[14px] border pl-4 pr-3.5 py-3"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: meta?.bar ?? 'var(--c-border-strong)' }} />
      <View className="flex-row items-center gap-3">
        <DateTile value={record.event.startTime} fg={type.fg} bg={type.bg} size={46} />
        <View className="flex-1 min-w-0">
          <Text className="text-[14.5px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
            {record.event.title}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1 min-w-0">
            <MaterialIcons name={type.icon} size={13} color={type.fg} />
            <Text className="t-meta flex-1 min-w-0 capitalize" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
              {[formatTime(record.event.startTime), record.event.location].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        {meta ? (
          <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1 shrink-0" style={{ backgroundColor: meta.bg }}>
            <MaterialIcons name={meta.icon} size={13} color={meta.fg} />
            <Text className="text-[12px] font-bold" style={{ color: meta.fg }}>{meta.label}</Text>
          </View>
        ) : null}
      </View>

      {/* The coach's note on THIS player for the session. It was already sent
          to the player (as a notification) but never shown in their history. */}
      {note ? (
        <View
          className="flex-row items-start gap-2 mt-3 rounded-[10px] px-3 py-2.5"
          style={{ backgroundColor: 'var(--c-surface-2)' }}
        >
          <MaterialIcons name="chat-bubble-outline" size={14} color="var(--c-brand-fg)" style={{ marginTop: 2 }} />
          <View className="flex-1 min-w-0">
            <Text className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--c-brand-fg)' }}>Feedback antrenor</Text>
            <Text className="text-[13px] font-medium mt-0.5 leading-5" style={{ color: 'var(--c-ink-soft)' }}>{note}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PlayerAttendanceScreen() {
  const { session } = useSession();
  const [summary, setSummary] = useState<PlayerAttendanceSummary>({ rate: null, present: 0, total: 0 });
  const [records, setRecords] = useState<PlayerAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const markedRecords = useMemo(() => records.filter((record) => statusKey(record.status) !== null), [records]);

  const counts = useMemo(() => {
    const result: Record<StatusKey, number> = { present: 0, absent: 0, excused: 0 };
    markedRecords.forEach((record) => {
      const key = statusKey(record.status);
      if (key) result[key] += 1;
    });
    return result;
  }, [markedRecords]);

  const filteredRecords = useMemo(
    () => (filter === 'all' ? markedRecords : markedRecords.filter((record) => statusKey(record.status) === filter)),
    [filter, markedRecords],
  );

  // resetKey includes the filter so switching chips returns to page 1.
  const pager = usePagination(filteredRecords, PAGE_SIZE, `${filter}:${filteredRecords.length}`);
  const streak = useMemo(() => currentStreak(markedRecords), [markedRecords]);
  const tone = rateTone(summary.rate);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);

    try {
      const details = await loadMyAttendanceHistory(session, HISTORY_LIMIT);
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

  // Month headers are inserted between rows of the current page.
  const pageRows = pager.pageItems.map((record, index) => {
    const month = monthLabel(record.event.startTime);
    const previous = index > 0 ? monthLabel(pager.pageItems[index - 1].event.startTime) : null;
    return { record, header: month !== previous ? month : null };
  });

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHeader
          title="Prezența mea"
          subtitle="Istoricul sesiunilor la care antrenorul ți-a marcat prezența."
          actions={
            <Pressable
              onPress={() => loadData(true)}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
              className="ui-press w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

        {loading ? (
          <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă prezența">
            <View className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Skeleton className="h-[150px] w-full rounded-[16px] lg:col-span-1" />
              <View className="grid grid-cols-3 gap-3 lg:col-span-2">
                {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[150px] w-full rounded-[16px]" />)}
              </View>
            </View>
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[72px] w-full rounded-[14px]" />)}
          </View>
        ) : error ? (
          <ErrorState
            title="Nu am putut încărca prezența"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadData(true)}
          />
        ) : (
          <View className="gap-5">
            <View className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <GlassCard className="ui-rise flex-row items-center gap-4">
                <ProgressRing
                  value={summary.rate}
                  size={88}
                  stroke={9}
                  color={tone.color}
                  label={summary.rate == null ? 'Rată prezență indisponibilă' : `Rată prezență ${summary.rate}%`}
                >
                  <Text className="t-num text-[21px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>
                    {summary.rate == null ? '—' : `${summary.rate}%`}
                  </Text>
                </ProgressRing>
                <View className="flex-1 min-w-0">
                  <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>Rată prezență</Text>
                  <Text className="text-[17px] font-bold mt-1" style={{ color: tone.color }}>{tone.label}</Text>
                  <Text className="t-meta mt-1" style={{ color: 'var(--c-muted)' }}>
                    {summary.total ? `${summary.present} din ${summary.total} sesiuni` : 'Nicio sesiune marcată încă'}
                  </Text>
                  {streak > 1 ? (
                    <View className="flex-row items-center gap-1 mt-2 self-start rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--c-success-bg)' }}>
                      <MaterialIcons name="bolt" size={12} color="var(--c-success-fg)" />
                      <Text className="text-[11.5px] font-bold" style={{ color: 'var(--c-success-fg)' }}>{streak} la rând</Text>
                    </View>
                  ) : null}
                </View>
              </GlassCard>

              <View className="grid grid-cols-3 gap-3 lg:col-span-2 ui-stagger">
                <StatCard icon="check-circle" tone="success" label="Prezent" value={counts.present} hint="sesiuni" />
                <StatCard icon="cancel" tone="danger" label="Absent" value={counts.absent} hint="sesiuni" />
                <StatCard icon="medical-services" tone="warning" label="Motivat" value={counts.excused} hint="sesiuni" />
              </View>
            </View>

            <View>
              <View className="flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
                <View>
                  <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Istoric</Text>
                  <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
                    Ultimele {markedRecords.length} sesiuni marcate
                  </Text>
                </View>
                <View className="flex-row flex-wrap gap-1.5" accessibilityRole="tablist">
                  {FILTERS.map((option) => {
                    const active = filter === option.key;
                    const count = option.key === 'all' ? markedRecords.length : counts[option.key];
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => setFilter(option.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${option.label}: ${count}`}
                        className="ui-press h-9 rounded-full px-3.5 flex-row items-center gap-1.5 border"
                        style={{
                          backgroundColor: active ? 'var(--c-brand-surface)' : 'var(--c-surface)',
                          borderColor: active ? 'var(--c-brand-surface)' : 'var(--c-border)',
                        } as any}
                      >
                        <Text className="text-[13px] font-semibold" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                          {option.label}
                        </Text>
                        <Text className="t-num text-[12px] font-bold" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-faint)' }}>{count}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {filteredRecords.length === 0 ? (
                <EmptyState
                  icon="event-busy"
                  compact
                  title={markedRecords.length ? 'Nicio sesiune cu acest status' : 'Nicio prezență marcată încă'}
                  message={markedRecords.length
                    ? 'Alege alt filtru pentru a vedea restul istoricului.'
                    : 'Sesiunile la care antrenorul îți marchează prezența apar aici.'}
                />
              ) : (
                <View className="gap-2.5 ui-stagger">
                  {pageRows.map(({ record, header }) => (
                    <View key={record.event.id} className="gap-2.5">
                      {header ? (
                        <Text className="t-eyebrow mt-2 first:mt-0" style={{ color: 'var(--c-faint)' }}>{header}</Text>
                      ) : null}
                      <AttendanceRow record={record} />
                    </View>
                  ))}
                </View>
              )}

              {filteredRecords.length > PAGE_SIZE ? (
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
        )}
      </PageContainer>
    </ScrollView>
  );
}

export default function AttendanceScreen() {
  const { session } = useSession();

  // The coach marking screen is /coach/attendance; this one is the player's own
  // attendance history.
  if (normalizeRole(session?.role) === 'coach') {
    return <Navigate to="/coach/attendance" replace />;
  }

  return <PlayerAttendanceScreen />;
}
