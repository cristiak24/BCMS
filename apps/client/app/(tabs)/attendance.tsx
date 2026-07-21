import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import GlassCard from '../../components/ui/GlassCard';
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
    return { label: 'Present', bg: 'bg-emerald-50', fg: 'text-emerald-700', color: '#047857', icon: 'check-circle' as const };
  }

  if (normalized === 'absent') {
    return { label: 'Absent', bg: 'bg-red-50', fg: 'text-red-700', color: '#B91C1C', icon: 'cancel' as const };
  }

  if (normalized === 'medical' || normalized === 'excused') {
    return { label: 'Medical', bg: 'bg-amber-50', fg: 'text-amber-700', color: '#B45309', icon: 'medical-services' as const };
  }

  return { label: 'Not marked', bg: 'bg-slate-100', fg: 'text-slate-500', color: '#64748B', icon: 'radio-button-unchecked' as const };
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
      setError(err instanceof Error ? err.message : 'Could not load attendance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <ScrollView className="flex-1 bg-[#F1F5F9]" contentContainerClassName="px-4 md:px-10 py-8 pb-16">
      <View className="max-w-5xl w-full mx-auto gap-6">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[#0E2041] text-3xl md:text-4xl font-black tracking-tight">Attendance</Text>
            <Text className="text-[#64748B] text-sm md:text-base font-semibold mt-2 max-w-2xl">
              Your marked attendance from recent club sessions.
            </Text>
            {session ? (
              <Text className="text-[#94A3B8] text-xs font-bold uppercase tracking-widest mt-3">
                {session.name}
              </Text>
            ) : null}
          </View>

          <Pressable onPress={() => loadData(true)} className="px-4 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm flex-row items-center gap-2">
            {refreshing ? <ActivityIndicator size="small" color="#2563EB" /> : <MaterialIcons name="refresh" size={20} color="#2563EB" />}
            <Text className="text-[#0E2041] font-bold">Refresh</Text>
          </Pressable>
        </View>

        <View className="flex-row flex-wrap gap-4">
          <GlassCard className="flex-1 min-w-[190px] p-5">
            <Text className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Attendance rate</Text>
            <Text className="text-[#0E2041] text-4xl font-black mt-2">
              {summary.rate == null ? '—' : `${summary.rate}%`}
            </Text>
            <Text className="text-[#64748B] text-xs font-semibold mt-2">
              {summary.total ? `${summary.present}/${summary.total} sessions present` : 'No marked sessions yet'}
            </Text>
          </GlassCard>

          <GlassCard className="flex-1 min-w-[190px] p-5">
            <Text className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Marked sessions</Text>
            <Text className="text-[#0E2041] text-4xl font-black mt-2">{summary.total}</Text>
            <Text className="text-[#64748B] text-xs font-semibold mt-2">Recent attendance records found</Text>
          </GlassCard>
        </View>

        <GlassCard className="p-5 md:p-6">
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-[#0E2041] text-xl font-black">Recent records</Text>
              <Text className="text-[#64748B] text-sm font-semibold mt-1">Sessions where your attendance was marked.</Text>
            </View>
            <MaterialIcons name="fact-check" size={22} color="#2563EB" />
          </View>

          {loading ? (
            <View className="py-10 items-center justify-center">
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : error ? (
            <View className="py-8 items-center">
              <MaterialIcons name="error-outline" size={32} color="#EF4444" />
              <Text className="text-red-600 font-bold text-center mt-3">{error}</Text>
            </View>
          ) : visibleRecords.length === 0 ? (
            <View className="py-8 items-center">
              <MaterialIcons name="event-busy" size={32} color="#94A3B8" />
              <Text className="text-[#64748B] font-semibold text-center mt-3">No marked attendance found yet.</Text>
            </View>
          ) : (
            <View className="gap-3">
              {visibleRecords.map((record) => {
                const tone = statusTone(record.status);

                return (
                  <View key={record.event.id} className="rounded-2xl border border-gray-100 bg-white p-4 flex-row gap-4 items-center">
                    <View className="w-12 h-12 rounded-2xl bg-[#EBF1FF] items-center justify-center">
                      <MaterialIcons name={eventTypeIcon(record.event.type)} size={22} color="#2563EB" />
                    </View>

                    <View className="flex-1">
                      <Text className="text-[#0E2041] font-black text-base">{record.event.title}</Text>
                      <Text className="text-[#64748B] text-sm font-semibold mt-1">
                        {formatDateTime(record.event.startTime)}
                        {record.event.location ? ` · ${record.event.location}` : ''}
                      </Text>
                      {record.event.teamName ? (
                        <Text className="text-[#94A3B8] text-xs font-semibold mt-1">{record.event.teamName}</Text>
                      ) : null}
                    </View>

                    <View className={`${tone.bg} px-3 py-2 rounded-2xl flex-row items-center gap-2`}>
                      <MaterialIcons name={tone.icon} size={16} color={tone.color} />
                      <Text className={`${tone.fg} text-[11px] font-black uppercase tracking-widest`}>{tone.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </GlassCard>
      </View>
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
