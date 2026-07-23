import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { RefreshCw, Pencil, Calendar, Trash2, AlertTriangle } from 'lucide-react';
import type { Team } from '../../services/teamsApi';
import type { SortKey, SortState } from '../../hooks/useTeamFilters';
import { GENDER_LABELS, LEVEL_LABELS, formatRelativeDate, isFrbTeam } from './teamDisplay';
import ThemedCheckbox from './ThemedCheckbox';

function SortableHeader({
    label,
    sortKey,
    sort,
    onToggle,
    align = 'left',
}: {
    label: string;
    sortKey: SortKey;
    sort: SortState;
    onToggle: (key: SortKey) => void;
    align?: 'left' | 'right';
}) {
    const active = sort.key === sortKey;
    return (
        <th className={`px-3 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
            <Pressable
                onPress={() => onToggle(sortKey)}
                className={`flex-row items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}
            >
                <Text className={`text-[10.5px] font-black uppercase tracking-widest ${active ? 'text-[#1D3E90]' : 'text-[#64748B]'}`}>
                    {label}
                </Text>
                <Text className={`text-[11px] font-black ${active ? 'text-[#1D3E90]' : 'text-[#CBD5E1]'}`}>
                    {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                </Text>
            </Pressable>
        </th>
    );
}

export default function TeamTable({
    teams,
    selectedIds,
    deletingId,
    sort,
    onToggleSort,
    allSelected,
    onToggleSelectAll,
    onToggleSelect,
    onOpen,
    onEdit,
    onSchedule,
    onDelete,
}: {
    teams: Team[];
    selectedIds: Set<number>;
    deletingId: number | null;
    sort: SortState;
    onToggleSort: (key: SortKey) => void;
    allSelected: boolean;
    onToggleSelectAll: () => void;
    onToggleSelect: (id: number) => void;
    onOpen: (id: number) => void;
    onEdit: (team: Team) => void;
    onSchedule: (id: number) => void;
    onDelete: (team: Team) => void;
}) {
    return (
        <View className="w-full overflow-x-auto rounded-[18px] border border-[#DDE7F5] bg-white">
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
                <thead>
                    <tr className="bg-[#F8FAFC]">
                        <th className="w-10 px-3 py-3">
                            <ThemedCheckbox checked={allSelected} onToggle={onToggleSelectAll} ariaLabel="Selectează toate echipele" size={18} />
                        </th>
                        <SortableHeader label="Echipă" sortKey="name" sort={sort} onToggle={onToggleSort} />
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#64748B]">Sursă</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#64748B]">Sex</th>
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#64748B]">Nivel</th>
                        <SortableHeader label="Jucători" sortKey="players" sort={sort} onToggle={onToggleSort} />
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#64748B]">Antrenor</th>
                        <SortableHeader label="Actualizat" sortKey="updated" sort={sort} onToggle={onToggleSort} />
                        <th className="text-left px-3 py-3 text-[10.5px] font-black uppercase tracking-widest text-[#64748B]">Status</th>
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
                                        <View className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: frb ? 'var(--c-danger)' : 'var(--c-success)' }} />
                                        <Text className="font-black text-[#0E2041] text-[13px] text-left">{team.name}</Text>
                                    </Pressable>
                                </td>
                                <td className="px-3 py-2.5">
                                    <View className="flex-row items-center gap-1 self-start px-2 py-0.5 rounded-full" style={{ backgroundColor: frb ? 'var(--c-danger-bg)' : 'var(--c-success-bg)' }}>
                                        {frb && <RefreshCw size={9} color="var(--c-danger-fg)" />}
                                        <Text className="text-[10px] font-black uppercase" style={{ color: frb ? 'var(--c-danger-fg)' : 'var(--c-success-fg)' }}>{frb ? 'FRB' : 'Manual'}</Text>
                                    </View>
                                </td>
                                <td className="px-3 py-2.5 text-[12.5px] font-bold text-[#475569]">{team.gender ? GENDER_LABELS[team.gender] : '—'}</td>
                                <td className="px-3 py-2.5 text-[12.5px] font-bold text-[#475569]">{team.level ? LEVEL_LABELS[team.level] : '—'}</td>
                                <td className="px-3 py-2.5">
                                    <View className="flex-row items-center gap-1.5">
                                        <Text className="text-[12.5px] font-bold text-[#0E2041]">{team.playerCount}</Text>
                                        {team.staleMedicalChecks > 0 && (
                                            <View className="flex-row items-center gap-0.5">
                                                <AlertTriangle size={11} color="var(--c-warning-fg)" />
                                                <Text className="text-[11px] font-bold text-[#B45309]">{team.staleMedicalChecks}</Text>
                                            </View>
                                        )}
                                    </View>
                                </td>
                                <td className="px-3 py-2.5 text-[12.5px] font-semibold text-[#475569]">{team.coachName ?? '—'}</td>
                                <td className="px-3 py-2.5 text-[12px] font-semibold text-[#64748B]">{formatRelativeDate(team.updatedAt)}</td>
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
                                            <Pencil size={13} color="var(--c-muted)" />
                                        </Pressable>
                                        <Pressable onPress={() => onSchedule(team.id)} className="w-7 h-7 rounded-lg items-center justify-center hover:bg-[#F1F5F9]" accessibilityLabel="Program">
                                            <Calendar size={13} color="var(--c-muted)" />
                                        </Pressable>
                                        <Pressable
                                            onPress={() => onDelete(team)}
                                            disabled={deletingId === team.id}
                                            className="w-7 h-7 rounded-lg items-center justify-center hover:bg-red-50"
                                            accessibilityLabel="Șterge"
                                        >
                                            {deletingId === team.id ? <ActivityIndicator size="small" color="var(--c-danger)" /> : <Trash2 size={13} color="var(--c-danger)" />}
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
