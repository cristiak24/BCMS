import { parseApiDate } from '@/utils/dates';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import PageContainer from '../../components/ui/PageContainer';
import PageHero, { GlassStat, StatStrip } from '../../components/admin/PageHero';
import { DenseList, DenseRow } from '../../components/ui/DenseList';
import { ATTENDANCE_MIN_SESSIONS, ATTENDANCE_PERIOD_DAYS, ATTENDANCE_PERIOD_LABEL } from '../../utils/attendanceRate';
import Pagination, { usePagination } from '../../components/ui/Pagination';
import ProgressRing from '../../components/ui/ProgressRing';
import DateTile from '../../components/ui/DateTile';
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
import { isEliteRhythm } from '../../utils/attendanceBadge';
import { plural } from '../../utils/plural';
import { attendanceMarkMeta, toAttendanceMark } from '../../utils/attendanceStatus';

import { tr, appLocale } from '../../i18n';
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
  present: { label: tr('Prezent'), fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', bar: 'var(--c-success)', icon: 'check-circle' },
  absent: { label: tr('Absent'), fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', bar: 'var(--c-danger)', icon: 'cancel' },
  excused: { label: tr('Motivat'), fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', bar: 'var(--c-warning)', icon: 'medical-services' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: tr('Toate') },
  { key: 'present', label: tr('Prezent') },
  { key: 'absent', label: tr('Absent') },
  { key: 'excused', label: tr('Motivat') },
];

function formatTime(value: string) {
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const text = new Intl.DateTimeFormat(appLocale(), { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function monthLabel(value: string) {
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const text = new Intl.DateTimeFormat(appLocale(), { month: 'long', year: 'numeric' }).format(date);
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

function rateTone(rate: number | null, sessions: number) {
  if (rate == null) return { label: tr('Încă nu există date'), color: 'var(--c-muted)' };
  // 1 of 1 is 100%, not a verdict.
  if (sessions < ATTENDANCE_MIN_SESSIONS) return { label: tr('Prea puține sesiuni pentru o concluzie'), color: 'var(--c-muted)' };
  if (isEliteRhythm(rate, sessions)) return { label: tr('Ritm de elită'), color: 'var(--c-success-fg)' };
  if (rate >= 75) return { label: tr('Pe drumul bun'), color: 'var(--c-brand-fg)' };
  if (rate >= 50) return { label: tr('Poate mai bine'), color: 'var(--c-warning-fg)' };
  return { label: tr('Necesită atenție'), color: 'var(--c-danger-fg)' };
}

function AttendanceRow({ record }: { record: PlayerAttendanceRecord }) {
  const key = statusKey(record.status);
  // A late arrival is filed under "Prezent" (it counts as attended) but the
  // badge says what the coach marked.
  const lateMeta = toAttendanceMark(record.status) === 'late' ? attendanceMarkMeta('late') : null;
  const meta = key
    ? (lateMeta ? { label: lateMeta.label, fg: lateMeta.fg, bg: lateMeta.bg, bar: lateMeta.solid, icon: lateMeta.icon } : STATUS_META[key])
    : null;
  const type = eventTypeMeta(record.event.type);
  const note = record.attendance?.note?.trim();

  return (
    <DenseRow stacked={Boolean(note)}>
      <View className="flex-row items-center gap-3">
        <DateTile value={record.event.startTime} fg="var(--c-muted)" bg="var(--c-surface-2)" size={44} dayFirst />
        <View className="flex-1 min-w-0">
          <Text className="text-[14.5px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
            {record.event.title}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1 min-w-0">
            <MaterialIcons name={type.icon} size={13} color="var(--c-faint)" />
            <Text className="t-meta flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
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
        <View className="flex-row items-start gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)' }}>
          <MaterialIcons name="chat-bubble-outline" size={14} color="var(--c-muted)" style={{ marginTop: 2 }} />
          <View className="flex-1 min-w-0">
            <Text className="t-label" style={{ color: 'var(--c-muted)' }}>{tr('Feedback antrenor')}</Text>
            <Text className="text-[13px] font-medium mt-0.5 leading-5" style={{ color: 'var(--c-ink-soft)' }}>{note}</Text>
          </View>
        </View>
      ) : null}
    </DenseRow>
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
    const result: Record<StatusKey | 'late', number> = { present: 0, absent: 0, excused: 0, late: 0 };
    markedRecords.forEach((record) => {
      const key = statusKey(record.status);
      if (key) result[key] += 1;
      if (toAttendanceMark(record.status) === 'late') result.late += 1;
    });
    return result;
  }, [markedRecords]);

  // The figures in the header share the rate's window; the history below
  // keeps every marked session.
  const windowCounts = useMemo(() => {
    const since = Date.now() - ATTENDANCE_PERIOD_DAYS * 86400000;
    const result = { present: 0, absent: 0, excused: 0, late: 0 };
    markedRecords.forEach((record) => {
      if (parseApiDate(record.event.startTime).getTime() < since) return;
      const key = statusKey(record.status);
      if (key) result[key] += 1;
      if (toAttendanceMark(record.status) === 'late') result.late += 1;
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
  const tone = rateTone(summary.rate, summary.total);
  const isParent = session?.role === 'parent';

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);

    try {
      const details = await loadMyAttendanceHistory(session, HISTORY_LIMIT);
      setSummary(details.summary);
      setRecords(details.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Nu s-a putut încărca prezența.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // The current page, one list per month.
  const monthGroups = pager.pageItems.reduce<{ month: string; records: PlayerAttendanceRecord[] }[]>((groups, record) => {
    const month = monthLabel(record.event.startTime);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.records.push(record);
    else groups.push({ month, records: [record] });
    return groups;
  }, []);

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHero
          eyebrow={tr('Prezență')}
          title={isParent ? tr('Prezența copilului') : tr('Prezența mea')}
          subtitle={loading || error
            ? (isParent ? tr('Istoricul sesiunilor la care antrenorul a marcat prezența copilului.') : tr('Istoricul sesiunilor la care antrenorul ți-a marcat prezența.'))
            : `${tone.label} · ${summary.total ? tr('{0} din {1}', { '0': summary.present, '1': plural(summary.total, 'sesiune', 'sesiuni') }) : tr('nicio sesiune marcată')} · ${ATTENDANCE_PERIOD_LABEL.toLowerCase()}`}
          leading={loading || error ? undefined : (
            <ProgressRing
              value={summary.rate}
              size={60}
              stroke={7}
              color={tone.color}
              label={summary.rate == null ? tr('Rată prezență indisponibilă') : tr('Rată prezență {0}%', { '0': summary.rate })}
            >
              <Text className="f-display t-num text-[15px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>
                {summary.rate == null ? '—' : `${summary.rate}%`}
              </Text>
            </ProgressRing>
          )}
          actions={
            <>
              {!loading && !error && streak > 1 ? (
                <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1 border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                  <MaterialIcons name="bolt" size={13} color="var(--c-success-fg)" />
                  <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{tr('{0} la rând', { '0': plural(streak, tr('prezență'), tr('prezențe')) })}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => loadData(true)}
                accessibilityRole="button"
                accessibilityLabel={tr('Reîmprospătează')}
                className="ui-press hidden sm:flex w-10 h-10 rounded-[11px] border items-center justify-center"
                style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
              >
                {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
              </Pressable>
            </>
          }
        >
          {loading || error ? null : (
            <StatStrip className="grid-cols-3">
              <GlassStat dot="var(--c-success)" label={tr('Prezent')} value={windowCounts.present} hint={windowCounts.late ? plural(windowCounts.late, tr('întârziere'), tr('întârzieri')) : tr('{ATTENDANCE_PERIOD_DAYS} de zile', { ATTENDANCE_PERIOD_DAYS })} />
              <GlassStat dot="var(--c-danger)" label={tr('Absent')} value={windowCounts.absent} hint={tr('{ATTENDANCE_PERIOD_DAYS} de zile', { ATTENDANCE_PERIOD_DAYS })} />
              <GlassStat dot="var(--c-warning)" label={tr('Motivat')} value={windowCounts.excused} hint={tr('{ATTENDANCE_PERIOD_DAYS} de zile', { ATTENDANCE_PERIOD_DAYS })} />
            </StatStrip>
          )}
        </PageHero>

        {loading ? (
          <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel={tr('Se încarcă prezența')}>
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[72px] w-full rounded-[14px]" />)}
          </View>
        ) : error ? (
          <ErrorState
            title={tr('Nu am putut încărca prezența')}
            message={error}
            actionLabel={tr('Reîncearcă')}
            onAction={() => loadData(true)}
          />
        ) : (
          <View className="gap-5">
            <View>
              <View className="flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
                <View>
                  <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>{tr('Istoric')}</Text>
                  <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
                    {markedRecords.length === 0
                      ? tr('Nicio sesiune marcată încă')
                      : markedRecords.length === 1 ? tr('Ultima sesiune marcată') : tr('Ultimele {0}', { '0': plural(markedRecords.length, 'sesiune marcată', 'sesiuni marcate') })}
                  </Text>
                </View>
                {/* Only statuses that occur: „Absent 0” was a button leading to an empty list. */}
                {markedRecords.length ? (
                <View className="flex-row flex-wrap gap-1.5" accessibilityRole="tablist">
                  {FILTERS.filter((option) => option.key === 'all' || option.key === filter || counts[option.key] > 0).map((option) => {
                    const active = filter === option.key;
                    const count = option.key === 'all' ? markedRecords.length : counts[option.key];
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => setFilter(option.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${option.label}: ${count}`}
                        className="ui-press h-10 rounded-full px-3.5 flex-row items-center gap-1.5 border"
                        style={{
                          backgroundColor: active ? 'var(--c-surface-3)' : 'var(--c-surface)',
                          borderColor: active ? 'var(--c-border-strong)' : 'var(--c-border)',
                        } as any}
                      >
                        <Text className="text-[13px] font-semibold" style={{ color: active ? 'var(--c-ink-strong)' : 'var(--c-ink-soft)' }}>
                          {option.label}
                        </Text>
                        <Text className="t-num text-[12px] font-bold" style={{ color: active ? 'var(--c-ink-soft)' : 'var(--c-faint)' }}>{count}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                ) : null}
              </View>

              {filteredRecords.length === 0 ? (
                <EmptyState
                  icon="event-busy"
                  compact
                  title={markedRecords.length ? tr('Nicio sesiune cu acest status') : tr('Nicio prezență marcată încă')}
                  message={markedRecords.length
                    ? tr('Alege alt filtru pentru a vedea restul istoricului.')
                    : tr('Sesiunile la care antrenorul îți marchează prezența apar aici.')}
                />
              ) : (
                <View className="gap-4">
                  {monthGroups.map((group) => (
                    <View key={group.month} className="gap-2">
                      <Text className="t-label" style={{ color: 'var(--c-muted)' }}>{group.month}</Text>
                      <DenseList label={group.month}>
                        {group.records.map((record) => <AttendanceRow key={record.event.id} record={record} />)}
                      </DenseList>
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
