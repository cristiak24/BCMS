import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { Dumbbell, Trophy, MapPin, CalendarDays } from 'lucide-react';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { formatDate } from '../teamDisplay';

type TypeFilter = 'all' | 'training' | 'match';
type Scope = 'past' | 'upcoming';

const TYPE_META: Record<string, { icon: typeof Dumbbell; accent: string; tint: string; label: string }> = {
    training: { icon: Dumbbell, accent: 'var(--c-brand-fg)', tint: 'var(--c-surface-tint)', label: 'Antrenament' },
    match: { icon: Trophy, accent: 'var(--c-warning-fg)', tint: 'var(--c-warning-bg)', label: 'Meci' },
    camp: { icon: MapPin, accent: 'var(--c-success-fg)', tint: 'var(--c-success-bg)', label: 'Cantonament' },
    admin: { icon: CalendarDays, accent: 'var(--c-muted)', tint: 'var(--c-surface-3)', label: 'Administrativ' },
};

function metaFor(type: string) {
    return TYPE_META[type] ?? TYPE_META.admin;
}

export default function TeamEventsPanel({ teamId, scope }: { teamId: number; scope: Scope }) {
    const [events, setEvents] = useState<CalendarEvent[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [type, setType] = useState<TypeFilter>('all');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await eventsApi.getEvents({ teamId });
                if (!cancelled) setEvents(data);
            } catch (e) {
                if (!cancelled) setError('Nu s-au putut încărca evenimentele.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [teamId]);

    const scoped = useMemo(() => {
        if (!events) return [];
        const now = Date.now();
        return events.filter((e) => {
            const end = new Date(e.endTime || e.startTime).getTime();
            return scope === 'past' ? end < now : end >= now;
        });
    }, [events, scope]);

    const list = useMemo(() => {
        const filtered = type === 'all' ? scoped : scoped.filter((e) => e.type === type);
        return [...filtered].sort((a, b) => {
            const da = new Date(a.startTime).getTime();
            const db = new Date(b.startTime).getTime();
            return scope === 'past' ? db - da : da - db;
        });
    }, [scoped, type, scope]);

    const counts = useMemo(() => ({
        all: scoped.length,
        training: scoped.filter((e) => e.type === 'training').length,
        match: scoped.filter((e) => e.type === 'match').length,
    }), [scoped]);

    const chips: { key: TypeFilter; label: string; count: number }[] = [
        { key: 'all', label: 'Toate', count: counts.all },
        { key: 'training', label: 'Antrenamente', count: counts.training },
        { key: 'match', label: 'Meciuri', count: counts.match },
    ];

    return (
        <View className="bg-white rounded-[20px] border border-[#E3E9F2] p-5">
            <View className="flex-row bg-[#F4F8FD] p-1 rounded-[14px] border border-[#DDE7F5] self-start mb-5">
                {chips.map((c) => {
                    const active = type === c.key;
                    return (
                        <Pressable key={c.key} onPress={() => setType(c.key)} className={`px-3.5 py-2 rounded-[11px] ${active ? 'bg-white shadow-sm' : ''}`}>
                            <Text className={`text-[12px] font-black ${active ? 'text-[#1D3E90]' : 'text-[#94A3B8]'}`}>{c.label} ({c.count})</Text>
                        </Pressable>
                    );
                })}
            </View>

            {loading ? (
                <View className="items-center justify-center py-12"><ActivityIndicator size="large" color="var(--c-brand-fg)" /></View>
            ) : error ? (
                <Text className="text-[13px] font-bold text-[#94A3B8] py-8 text-center">{error}</Text>
            ) : list.length === 0 ? (
                <View className="items-center justify-center py-14">
                    <View className="w-14 h-14 rounded-full bg-[#EBF1FF] items-center justify-center mb-3">
                        <CalendarDays size={24} color="var(--c-brand-fg)" />
                    </View>
                    <Text className="text-[#0E2041] text-[14px] font-black mb-1">
                        {scope === 'past' ? 'Niciun eveniment în istoric' : 'Niciun eveniment programat'}
                    </Text>
                    <Text className="text-[#94A3B8] text-[12.5px] font-semibold text-center max-w-[340px]">
                        Evenimentele adăugate din Program pentru această echipă apar aici.
                    </Text>
                </View>
            ) : (
                <View className="gap-2">
                    {list.map((e) => {
                        const meta = metaFor(e.type);
                        const Icon = meta.icon;
                        return (
                            <View key={e.id} className="flex-row items-center gap-3 rounded-[14px] border border-[#F1F5F9] hover:bg-[#FBFDFF] px-3.5 py-3 transition-colors">
                                <View className="w-10 h-10 rounded-[12px] items-center justify-center flex-none" style={{ backgroundColor: meta.tint }}>
                                    <Icon size={17} color={meta.accent} />
                                </View>
                                <View className="flex-1 min-w-0">
                                    <View className="flex-row items-center gap-2">
                                        <Text className="text-[13.5px] font-black text-[#0E2041]" numberOfLines={1}>{e.title}</Text>
                                        <View className="px-1.5 py-0.5 rounded-full flex-none" style={{ backgroundColor: meta.tint }}>
                                            <Text className="text-[9px] font-black uppercase tracking-wide" style={{ color: meta.accent }}>{meta.label}</Text>
                                        </View>
                                    </View>
                                    <View className="flex-row items-center gap-3 mt-0.5">
                                        <View className="flex-row items-center gap-1">
                                            <CalendarDays size={11} color="var(--c-faint)" />
                                            <Text className="text-[11px] font-bold text-[#94A3B8]">{formatDate(e.startTime)}</Text>
                                        </View>
                                        {e.location ? (
                                            <View className="flex-row items-center gap-1 min-w-0">
                                                <MapPin size={11} color="var(--c-faint)" />
                                                <Text className="text-[11px] font-bold text-[#94A3B8] truncate" numberOfLines={1}>{e.location}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                </View>
                                <View className="px-2.5 py-1 rounded-full flex-none" style={{ backgroundColor: scope === 'past' ? 'var(--c-surface-3)' : meta.tint }}>
                                    <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: scope === 'past' ? 'var(--c-muted)' : meta.accent }}>
                                        {scope === 'past' ? 'Încheiat' : 'Programat'}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
}
