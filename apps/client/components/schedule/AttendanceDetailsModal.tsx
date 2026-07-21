import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView } from '@/src/web/reactNative';
import { X, Clock } from 'lucide-react';
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
}

export function AttendanceDetailsModal({ visible, onClose, player, date, details }: AttendanceDetailsModalProps) {
    const { isMobile, height } = useResponsive();

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable className="flex-1 bg-black/40 justify-center p-6" onPress={onClose}>
                <View className={`bg-white ${isMobile ? 'rounded-[28px] p-5' : 'rounded-[40px] p-8'} shadow-2xl space-y-6`} onStartShouldSetResponder={() => true}>
                    <View className="flex-row justify-between items-center mb-2">
                        <View>
                            <Text className={`${isMobile ? 'text-xl' : 'text-2xl'} font-black text-[#1E293B]`}>Daily Attendance</Text>
                            <Text className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
                                {player.firstName} {player.lastName} • {date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="w-10 h-10 bg-slate-50 rounded-xl items-center justify-center">
                            <X color="#1E293B" size={20} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.45 }}>
                        <View className="gap-3">
                            {details.map((detail, idx) => {
                                const isPresent = detail.status === 'present';
                                const isAbsent = detail.status === 'absent';
                                const isMedical = detail.status === 'medical';
                                const isPending = !detail.status || detail.status === 'pending';

                                return (
                                    <View key={idx} className={`bg-slate-50 border border-slate-100 p-4 ${isMobile ? 'rounded-2xl gap-3' : 'rounded-3xl flex-row items-center justify-between'}`}>
                                        <View className="flex-1">
                                            <Text className="font-black text-slate-800 text-[14px]">{detail.eventTitle}</Text>
                                            <View className="flex-row items-center mt-1">
                                                <Clock size={12} color="#94A3B8" />
                                                <Text className="text-[10px] text-slate-500 font-bold ml-1 uppercase tracking-widest">
                                                    {new Date(detail.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </View>
                                        </View>
                                        <View className={isMobile ? 'self-start' : ''}>
                                            {isPresent && (
                                                <View className="bg-emerald-100 px-3 py-1.5 rounded-full border border-emerald-200">
                                                    <Text className="text-emerald-700 font-black text-[10px] uppercase tracking-widest">Present</Text>
                                                </View>
                                            )}
                                            {isAbsent && (
                                                <View className="bg-rose-100 px-3 py-1.5 rounded-full border border-rose-200">
                                                    <Text className="text-rose-700 font-black text-[10px] uppercase tracking-widest">Absent</Text>
                                                </View>
                                            )}
                                            {isMedical && (
                                                <View className="bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
                                                    <Text className="text-amber-700 font-black text-[10px] uppercase tracking-widest">Medical</Text>
                                                </View>
                                            )}
                                            {isPending && (
                                                <View className="bg-slate-200 px-3 py-1.5 rounded-full border border-slate-300">
                                                    <Text className="text-slate-600 font-black text-[10px] uppercase tracking-widest">Pending</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>

                    <TouchableOpacity 
                        onPress={onClose}
                        className="bg-slate-900 h-14 rounded-2xl items-center justify-center mt-4"
                    >
                        <Text className="text-white font-black uppercase tracking-widest text-xs">Close</Text>
                    </TouchableOpacity>
                </View>
            </Pressable>
        </Modal>
    );
}
