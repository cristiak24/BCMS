import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { RefreshCw, Users, AlertTriangle, Clock, Pencil, Calendar, Trash2, ArrowRight, Shield } from 'lucide-react';
import type { Team } from '../../services/teamsApi';
import { GENDER_LABELS, LEVEL_LABELS, formatRelativeDate, isFrbTeam } from './teamDisplay';
import ThemedCheckbox from './ThemedCheckbox';

export default function TeamCard({
    team,
    selected,
    deleting,
    onToggleSelect,
    onOpen,
    onEdit,
    onSchedule,
    onDelete,
}: {
    team: Team;
    selected: boolean;
    deleting: boolean;
    onToggleSelect: () => void;
    onOpen: () => void;
    onEdit: () => void;
    onSchedule: () => void;
    onDelete: () => void;
}) {
    const frb = isFrbTeam(team);
    const accentColor = frb ? '#C62828' : '#0E9F6E';
    const crestTint = frb ? '#FBEAEA' : '#E6F8F1';
    const coachInitials = team.coachName
        ? team.coachName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
        : null;

    return (
        <View
            className={`group relative flex-col bg-white rounded-[20px] p-5 border transition-all duration-150 ${
                selected
                    ? 'border-[#1D3E90] shadow-[0_0_0_3px_rgba(29,62,144,0.12)]'
                    : 'border-[#E3E9F2] shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-[#CBD8EC] hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] hover:-translate-y-0.5'
            } ${team.isActive ? '' : 'opacity-60'}`}
        >
            {/* Header: crest + name + checkbox */}
            <View className="flex-row items-start gap-3 mb-3.5">
                <View className="w-11 h-11 rounded-[13px] items-center justify-center flex-none" style={{ backgroundColor: crestTint }}>
                    <Shield size={20} color={accentColor} fill={accentColor} />
                </View>

                <Pressable onPress={onOpen} className="flex-1 min-w-0 flex-col items-start pt-0.5">
                    <Text className="text-[#0E2041] text-[15px] font-black leading-tight text-left" numberOfLines={2}>
                        {team.name}
                    </Text>
                    <Text className="text-[#94A3B8] text-[11.5px] font-bold mt-1 text-left" numberOfLines={1}>
                        {team.seasonName}
                    </Text>
                </Pressable>

                <View className="flex-none pt-0.5">
                    <ThemedCheckbox checked={selected} onToggle={onToggleSelect} ariaLabel={`Selectează ${team.name}`} size={19} />
                </View>
            </View>

            {/* Badges */}
            <View className="flex-row flex-wrap gap-1.5 mb-4">
                <View className="flex-row items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: crestTint }}>
                    {frb && <RefreshCw size={9} color={frb ? '#8A1F1F' : '#0B7A55'} />}
                    <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: frb ? '#8A1F1F' : '#0B7A55' }}>
                        {frb ? 'Sincronizat FRB' : 'Administrat local'}
                    </Text>
                </View>
                {team.gender && (
                    <View className="px-2 py-1 rounded-full" style={{ backgroundColor: team.gender === 'M' ? '#EEF1F8' : '#FBEAF2' }}>
                        <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: team.gender === 'M' ? '#28345E' : '#7C3560' }}>
                            {GENDER_LABELS[team.gender]}
                        </Text>
                    </View>
                )}
                {team.level && (
                    <View className="px-2 py-1 rounded-full bg-[#F1F5F9]">
                        <Text className="text-[10px] font-black uppercase tracking-wide text-[#64748B]">{LEVEL_LABELS[team.level]}</Text>
                    </View>
                )}
                {!team.isActive && (
                    <View className="px-2 py-1 rounded-full bg-slate-100">
                        <Text className="text-[10px] font-black uppercase tracking-wide text-slate-500">Inactivă</Text>
                    </View>
                )}
            </View>

            {/* Stats */}
            <View className="flex-row gap-2.5 mb-4">
                <View className="flex-1 rounded-[13px] bg-[#F7F9FC] px-3 py-2.5">
                    <View className="flex-row items-center gap-1.5">
                        <Users size={13} color="#1D3E90" />
                        <Text className="text-[15px] font-black text-[#0E2041]">{team.playerCount}</Text>
                    </View>
                    <Text className="text-[10.5px] font-bold text-[#94A3B8] mt-0.5">jucători</Text>
                </View>
                <View className="flex-1 rounded-[13px] px-3 py-2.5" style={{ backgroundColor: team.staleMedicalChecks > 0 ? '#FCF3E3' : '#EEFaF4' }}>
                    <View className="flex-row items-center gap-1.5">
                        {team.staleMedicalChecks > 0 ? (
                            <>
                                <AlertTriangle size={13} color="#B45309" />
                                <Text className="text-[15px] font-black text-[#B45309]">{team.staleMedicalChecks}</Text>
                            </>
                        ) : (
                            <Text className="text-[13px] font-black text-[#0B7A55]">La zi</Text>
                        )}
                    </View>
                    <Text className="text-[10.5px] font-bold mt-0.5" style={{ color: team.staleMedicalChecks > 0 ? '#B45309' : '#0B7A55' }}>
                        {team.staleMedicalChecks > 0 ? 'verificări expirate' : 'verificări medicale'}
                    </Text>
                </View>
            </View>

            {/* Updated timestamp */}
            <View className="flex-row items-center gap-1.5 mb-3.5">
                <Clock size={12} color="#94A3B8" />
                <Text className="text-[11.5px] font-semibold text-[#94A3B8]">actualizat {formatRelativeDate(team.updatedAt)}</Text>
            </View>

            {/* Footer: coach + actions */}
            <View className="flex-row items-center justify-between pt-3.5 border-t border-[#F1F5F9]">
                <View className="flex-row items-center gap-2 min-w-0 flex-1">
                    <View
                        className="w-7 h-7 rounded-full items-center justify-center flex-none"
                        style={{ backgroundColor: coachInitials ? '#EBF1FF' : '#F1F5F9' }}
                    >
                        <Text className="text-[10px] font-black" style={{ color: coachInitials ? '#1D3E90' : '#94A3B8' }}>
                            {coachInitials ?? '—'}
                        </Text>
                    </View>
                    <Text className="text-[12px] font-bold text-[#475569] truncate" numberOfLines={1}>{team.coachName ?? 'Fără antrenor'}</Text>
                </View>

                <View className="flex-row items-center gap-0.5 flex-none">
                    <Pressable onPress={onEdit} className="w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[#F1F5F9]" accessibilityLabel="Editează">
                        <Pencil size={14} color="#64748B" />
                    </Pressable>
                    <Pressable onPress={onSchedule} className="w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[#F1F5F9]" accessibilityLabel="Program">
                        <Calendar size={14} color="#64748B" />
                    </Pressable>
                    <Pressable
                        onPress={onDelete}
                        disabled={deleting}
                        className="w-8 h-8 rounded-[9px] items-center justify-center hover:bg-red-50"
                        accessibilityLabel="Șterge"
                    >
                        {deleting ? <ActivityIndicator size="small" color="#DC2626" /> : <Trash2 size={14} color="#DC2626" />}
                    </Pressable>
                </View>
            </View>

            {/* Open CTA */}
            <Pressable onPress={onOpen} className="flex-row items-center justify-center gap-1.5 mt-3.5 h-10 rounded-[12px] bg-[#1D3E90] active:bg-[#15316f] transition-colors">
                <Text className="text-white text-[11px] font-black uppercase tracking-widest">Deschide echipa</Text>
                <ArrowRight size={13} color="#ffffff" />
            </Pressable>
        </View>
    );
}
