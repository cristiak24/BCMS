import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { RefreshCw, Pencil, Calendar, Trash2, AlertTriangle } from 'lucide-react';
import type { Team } from '../../services/teamsApi';
import { GENDER_LABELS, LEVEL_LABELS, formatRelativeDate, isFrbTeam } from './teamDisplay';
import ThemedCheckbox from './ThemedCheckbox';

export default function TeamTable({
    teams,
    selectedIds,
    deletingId,
    onToggleSelect,
    onOpen,
    onEdit,
    onSchedule,
    onDelete,
}: {
    teams: Team[];
    selectedIds: Set<number>;
    deletingId: number | null;
    onToggleSelect: (id: number) => void;
    onOpen: (id: number) => void;
    onEdit: (team: Team) => void;
    onSchedule: () => void;
    onDelete: (team: Team) => void;
}) {
    return (
        <View className="w-full overflow-x-auto rounded-[18px] border border-[#DDE7F5] bg-white">
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
                <thead>
                    <tr className="bg-[#F8FAFC]">
                        <th className="w-10 px-3 py-3" />
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Echipă</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Sursă</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Sex</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Nivel</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Jucători</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Antrenor</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Actualizat</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#94A3B8]">Status</th>
                        <th className="w-32 px-3 py-3" />
                    </tr>
                </thead>
                <tbody>
                    {teams.map((team) => {
                        const frb = isFrbTeam(team);
                        return (
                            <tr key={team.id} className={`border-t border-[#F1F5F9] hover:bg-[#FBFDFF] ${team.isActive ? '' : 'opacity-60'}`}>
                                <td className="px-3 py-2.5">
                                    <ThemedCheckbox
                                        checked={selectedIds.has(team.id)}
                                        onToggle={() => onToggleSelect(team.id)}
                                        ariaLabel={`Selectează ${team.name}`}
                                        size={18}
                                    />
                                </td>
                                <td className="px-3 py-2.5">
                                    <Pressable onPress={() => onOpen(team.id)} className="flex-row items-center gap-2">
                                        <View className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: frb ? '#C62828' : '#0E9F6E' }} />
                                        <Text className="font-black text-[#0E2041] text-[13px] text-left">{team.name}</Text>
                                    </Pressable>
                                </td>
                                <td className="px-3 py-2.5">
                                    <View className="flex-row items-center gap-1 self-start px-2 py-0.5 rounded-full" style={{ backgroundColor: frb ? '#FBEAEA' : '#E6F8F1' }}>
                                        {frb && <RefreshCw size={9} color="#8A1F1F" />}
                                        <Text className="text-[10px] font-black uppercase" style={{ color: frb ? '#8A1F1F' : '#0B7A55' }}>{frb ? 'FRB' : 'Manual'}</Text>
                                    </View>
                                </td>
                                <td className="px-3 py-2.5 text-[12.5px] font-bold text-[#475569]">{team.gender ? GENDER_LABELS[team.gender] : '—'}</td>
                                <td className="px-3 py-2.5 text-[12.5px] font-bold text-[#475569]">{team.level ? LEVEL_LABELS[team.level] : '—'}</td>
                                <td className="px-3 py-2.5">
                                    <View className="flex-row items-center gap-1.5">
                                        <Text className="text-[12.5px] font-bold text-[#0E2041]">{team.playerCount}</Text>
                                        {team.staleMedicalChecks > 0 && (
                                            <View className="flex-row items-center gap-0.5">
                                                <AlertTriangle size={11} color="#B45309" />
                                                <Text className="text-[11px] font-bold text-[#B45309]">{team.staleMedicalChecks}</Text>
                                            </View>
                                        )}
                                    </View>
                                </td>
                                <td className="px-3 py-2.5 text-[12.5px] font-semibold text-[#475569]">{team.coachName ?? '—'}</td>
                                <td className="px-3 py-2.5 text-[12px] font-semibold text-[#94A3B8]">{formatRelativeDate(team.updatedAt)}</td>
                                <td className="px-3 py-2.5">
                                    <View className={`self-start px-2 py-0.5 rounded-full ${team.isActive ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                                        <Text className={`text-[10px] font-black uppercase ${team.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                                            {team.isActive ? 'Activă' : 'Inactivă'}
                                        </Text>
                                    </View>
                                </td>
                                <td className="px-3 py-2.5">
                                    <View className="flex-row items-center justify-end gap-0.5">
                                        <Pressable onPress={() => onEdit(team)} className="w-7 h-7 rounded-lg items-center justify-center hover:bg-[#F1F5F9]" accessibilityLabel="Editează">
                                            <Pencil size={13} color="#64748B" />
                                        </Pressable>
                                        <Pressable onPress={onSchedule} className="w-7 h-7 rounded-lg items-center justify-center hover:bg-[#F1F5F9]" accessibilityLabel="Program">
                                            <Calendar size={13} color="#64748B" />
                                        </Pressable>
                                        <Pressable
                                            onPress={() => onDelete(team)}
                                            disabled={deletingId === team.id}
                                            className="w-7 h-7 rounded-lg items-center justify-center hover:bg-red-50"
                                            accessibilityLabel="Șterge"
                                        >
                                            {deletingId === team.id ? <ActivityIndicator size="small" color="#DC2626" /> : <Trash2 size={13} color="#DC2626" />}
                                        </Pressable>
                                    </View>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </View>
    );
}
