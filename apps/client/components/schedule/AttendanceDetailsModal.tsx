import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView } from '@/src/web/reactNative';
import { X, Clock, CheckCircle, XCircle, BriefcaseMedical, Clock3, ChevronRight, CalendarDays } from 'lucide-react';
import { useResponsive } from '../../hooks/useResponsive';

interface AttendanceDetailsModalProps {
    visible: boolean;
    onClose: () => void;
    player: {
        id: number;
        firstName: string;
        lastName: string;
    };
    date: Date;
    details: {
        eventId: number;
        eventTitle: string;
        startTime: string;
        status: string | null;
    }[];
    /** Navigate to grade this event (opens the event attendance/grade screen). */
    onSelectEvent?: (eventId: number) => void;
}

const STATUS_META: Record<string, { label: string; accent: string; bg: string; border: string; text: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
    present: { label: 'Prezent', accent: 'var(--c-success)', bg: 'var(--c-success-bg)', border: '#A7F3D0', text: 'var(--c-success-fg)', Icon: CheckCircle },
    absent: { label: 'Absent', accent: 'var(--c-danger)', bg: 'var(--c-danger-bg)', border: 'var(--c-danger-bg)', text: 'var(--c-danger)', Icon: XCircle },
    medical: { label: 'Medical', accent: 'var(--c-warning)', bg: 'var(--c-warning-bg)', border: '#FDE68A', text: 'var(--c-warning-fg)', Icon: BriefcaseMedical },
    pending: { label: 'În așteptare', accent: 'var(--c-faint)', bg: 'var(--c-surface-2)', border: 'var(--c-border)', text: 'var(--c-muted)', Icon: Clock3 },
};

export function AttendanceDetailsModal({ visible, onClose, player, date, details, onSelectEvent }: AttendanceDetailsModalProps) {
    const { isMobile, height } = useResponsive();

    if (!visible) return null;

    const presentCount = details.filter((d) => d.status === 'present').length;
    const takenCount = details.filter((d) => d.status && d.status !== 'pending').length;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable className="flex-1 bg-black/50 justify-center p-6" onPress={onClose}>
                <View
                    className={`bg-white w-full max-w-2xl self-center overflow-hidden ${isMobile ? 'rounded-[28px]' : 'rounded-[32px]'} shadow-2xl`}
                    onStartShouldSetResponder={() => true}
                >
                    {/* Header */}
                    <View className={`${isMobile ? 'px-5 pt-5 pb-4' : 'px-7 pt-6 pb-5'} border-b border-slate-100`} style={{ backgroundColor: 'var(--c-surface-2)' }}>
                        <View className="flex-row justify-between items-start">
                            <View className="flex-row items-center gap-3 flex-1 min-w-0">
                                <View className="w-11 h-11 rounded-2xl bg-[#EAF2FF] items-center justify-center">
                                    <CalendarDays size={20} color="var(--c-brand-fg)" />
                                </View>
                                <View className="flex-1 min-w-0">
                                    <Text className={`${isMobile ? 'text-lg' : 'text-xl'} font-black text-[#0E2041]`} numberOfLines={1}>
                                        {player.firstName} {player.lastName}
                                    </Text>
                                    <Text className="text-slate-400 font-bold text-[11px] uppercase tracking-widest mt-0.5">
                                        {date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={onClose} className="w-10 h-10 bg-white border border-slate-200 rounded-full items-center justify-center">
                                <X color="var(--c-muted)" size={18} />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row items-center gap-2 mt-4">
                            <View className="flex-row items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5">
                                <Text className="text-[11px] font-black text-[#0E2041]">{details.length}</Text>
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{details.length === 1 ? 'sesiune' : 'sesiuni'}</Text>
                            </View>
                            <View className="flex-row items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5">
                                <CheckCircle size={12} color="var(--c-success)" />
                                <Text className="text-[10px] font-black text-emerald-700 uppercase tracking-wide">{presentCount}/{details.length} prezent</Text>
                            </View>
                            {takenCount < details.length && (
                                <View className="flex-row items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1.5">
                                    <Clock3 size={12} color="var(--c-faint)" />
                                    <Text className="text-[10px] font-black text-slate-500 uppercase tracking-wide">{details.length - takenCount} de notat</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Event list */}
                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ padding: isMobile ? 16 : 24 }}>
                        <View className="gap-2.5">
                            {details.map((detail) => {
                                const meta = STATUS_META[detail.status && detail.status !== 'pending' ? detail.status : 'pending'] ?? STATUS_META.pending;
                                const StatusIcon = meta.Icon;
                                const clickable = Boolean(onSelectEvent);

                                return (
                                    <TouchableOpacity
                                        key={detail.eventId}
                                        activeOpacity={clickable ? 0.7 : 1}
                                        disabled={!clickable}
                                        onPress={() => onSelectEvent?.(detail.eventId)}
                                        className="flex-row items-center bg-white border border-slate-100 rounded-2xl overflow-hidden"
                                        style={{ shadowColor: 'var(--c-ink-strong)', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }}
                                    >
                                        <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: meta.accent }} />
                                        <View className="flex-1 flex-row items-center justify-between py-3.5 px-4 gap-3">
                                            <View className="flex-row items-center gap-3 flex-1 min-w-0">
                                                <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: meta.bg }}>
                                                    <StatusIcon size={16} color={meta.accent} />
                                                </View>
                                                <View className="flex-1 min-w-0">
                                                    <Text className="font-black text-slate-800 text-[14px]" numberOfLines={1}>{detail.eventTitle}</Text>
                                                    <View className="flex-row items-center mt-0.5">
                                                        <Clock size={11} color="var(--c-faint)" />
                                                        <Text className="text-[10px] text-slate-500 font-bold ml-1 uppercase tracking-widest">
                                                            {new Date(detail.startTime).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <View className="flex-row items-center gap-2 flex-none">
                                                <View className="px-2.5 py-1 rounded-full border" style={{ backgroundColor: meta.bg, borderColor: meta.border }}>
                                                    <Text className="font-black text-[10px] uppercase tracking-widest" style={{ color: meta.text }}>{meta.label}</Text>
                                                </View>
                                                {clickable && <ChevronRight size={16} color="var(--c-border-strong)" />}
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {onSelectEvent && (
                            <Text className="text-center text-[11px] font-bold text-slate-400 mt-4">
                                Apasă pe o sesiune pentru a nota prezența.
                            </Text>
                        )}
                    </ScrollView>

                    <View className={`${isMobile ? 'px-5 py-4' : 'px-7 py-5'} border-t border-slate-100`}>
                        <TouchableOpacity
                            onPress={onClose}
                            className="bg-[#0E2041] h-12 rounded-2xl items-center justify-center"
                        >
                            <Text className="text-white font-black uppercase tracking-widest text-xs">Închide</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
}
