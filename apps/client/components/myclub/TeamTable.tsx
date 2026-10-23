import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { RefreshCw, Pencil, Calendar, Trash2, AlertTriangle } from 'lucide-react';
import type { Team } from '../../services/teamsApi';
import type { SortKey, SortState } from '../../hooks/useTeamFilters';
import { GENDER_LABELS, LEVEL_LABELS, formatRelativeDate, isFrbTeam, teamClearance } from './teamDisplay';
import ThemedCheckbox from './ThemedCheckbox';

// Tokens only: the legacy hex classes here (`hover:bg-[#FBFDFF]` above all)
// are not reached by palette.css, so in dark mode a hovered row went
// near-white under light text.
const HEADER = 'text-[11px] font-semibold uppercase tracking-[0.06em]';
const CELL = 'px-3 py-2.5';

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
        <th
            className={`px-3 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}
            aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            <Pressable
                onPress={() => onToggle(sortKey)}
                className={`flex-row items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}
            >
                <Text className={HEADER} style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>
                    {label}
                </Text>
                <Text className="text-[11px] font-semibold" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-border-strong)' }} aria-hidden>
                    {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                </Text>
            </Pressable>
        </th>
    );
}

function PlainHeader({ label }: { label: string }) {
    return (
        <th className={`text-left px-3 py-3 ${HEADER}`} style={{ color: 'var(--c-muted)' }}>{label}</th>
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
        <View
            className="w-full overflow-x-auto rounded-[14px] border shadow-[var(--e-sm)]"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
        >
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
                <thead>
                    <tr style={{ backgroundColor: 'var(--c-surface-2)' }}>
                        <th className="w-10 px-3 py-3">
                            <ThemedCheckbox checked={allSelected} onToggle={onToggleSelectAll} ariaLabel="Selectează toate echipele" size={18} />
                        </th>
                        <SortableHeader label="Echipă" sortKey="name" sort={sort} onToggle={onToggleSort} />
                        <PlainHeader label="Sursă" />
                        <PlainHeader label="Sex" />
                        <PlainHeader label="Nivel" />
                        <SortableHeader label="Jucători" sortKey="players" sort={sort} onToggle={onToggleSort} />
                        <PlainHeader label="Antrenor" />
                        <SortableHeader label="Actualizat" sortKey="updated" sort={sort} onToggle={onToggleSort} />
                        <PlainHeader label="Stare" />
                        <th className="w-32 px-3 py-3" />
                    </tr>
                </thead>
                <tbody>
                    {teams.map((team) => {
                        const frb = isFrbTeam(team);
                        return (
                            <tr
                                key={team.id}
                                className={`border-t hover:bg-[var(--c-surface-2)] ${team.isActive ? '' : 'opacity-60'}`}
                                style={{ borderColor: 'var(--c-border-soft)' }}
                            >
                                <td className={CELL}>
                                    <ThemedCheckbox
                                        checked={selectedIds.has(team.id)}
                                        onToggle={() => onToggleSelect(team.id)}
                                        ariaLabel={`Selectează ${team.name}`}
                                        size={18}
                                    />
                                </td>
                                <td className={CELL}>
                                    <Pressable onPress={() => onOpen(team.id)} className="flex-row items-center gap-2">
                                        <View className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: frb ? 'var(--c-danger)' : 'var(--c-success)' }} />
                                        <Text className="font-semibold text-[13px] text-left" style={{ color: 'var(--c-ink)' }}>{team.name}</Text>
                                    </Pressable>
                                </td>
                                <td className={CELL}>
                                    <View className="flex-row items-center gap-1 self-start px-2 py-0.5 rounded-full" style={{ backgroundColor: frb ? 'var(--c-danger-bg)' : 'var(--c-success-bg)' }}>
                                        {frb && <RefreshCw size={10} color="var(--c-danger-fg)" />}
                                        <Text className="text-[11px] font-semibold" style={{ color: frb ? 'var(--c-danger-fg)' : 'var(--c-success-fg)' }}>{frb ? 'FRB' : 'Manual'}</Text>
                                    </View>
                                </td>
                                <td className={`${CELL} text-[12.5px] font-medium`} style={{ color: 'var(--c-ink-soft)' }}>{team.gender ? GENDER_LABELS[team.gender] : '—'}</td>
                                <td className={`${CELL} text-[12.5px] font-medium`} style={{ color: 'var(--c-ink-soft)' }}>{team.level ? LEVEL_LABELS[team.level] : '—'}</td>
                                <td className={CELL}>
                                    <View className="flex-row items-center gap-1.5">
                                        <Text className="t-num text-[12.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>{team.playerCount}</Text>
                                        {teamClearance(team).total > 0 && (
                                            <View className="flex-row items-center gap-0.5" accessibilityLabel={teamClearance(team).label ?? undefined}>
                                                <AlertTriangle size={11} color="var(--c-warning-fg)" />
                                                <Text className="t-num text-[11px] font-semibold" style={{ color: 'var(--c-warning-fg)' }}>{teamClearance(team).total}</Text>
                                            </View>
                                        )}
                                    </View>
                                </td>
                                <td className={`${CELL} text-[12.5px] font-medium`} style={{ color: 'var(--c-ink-soft)' }}>{team.coachName ?? '—'}</td>
                                <td className={`${CELL} text-[12px] font-medium`} style={{ color: 'var(--c-muted)' }}>{formatRelativeDate(team.updatedAt)}</td>
                                <td className={CELL}>
                                    <View className="self-start px-2 py-0.5 rounded-full" style={{ backgroundColor: team.isActive ? 'var(--c-success-bg)' : 'var(--c-surface-3)' }}>
                                        <Text className="text-[11px] font-semibold" style={{ color: team.isActive ? 'var(--c-success-fg)' : 'var(--c-muted)' }}>
                                            {team.isActive ? 'Activă' : 'Inactivă'}
                                        </Text>
                                    </View>
                                </td>
                                <td className={CELL}>
                                    <View className="flex-row items-center justify-end gap-0.5">
                                        <Pressable onPress={() => onEdit(team)} className="w-8 h-8 rounded-[8px] items-center justify-center hover:bg-[var(--c-surface-3)]" accessibilityLabel={`Editează ${team.name}`}>
                                            <Pencil size={14} color="var(--c-muted)" />
                                        </Pressable>
                                        <Pressable onPress={() => onSchedule(team.id)} className="w-8 h-8 rounded-[8px] items-center justify-center hover:bg-[var(--c-surface-3)]" accessibilityLabel={`Programul echipei ${team.name}`}>
                                            <Calendar size={14} color="var(--c-muted)" />
                                        </Pressable>
                                        <Pressable
                                            onPress={() => onDelete(team)}
                                            disabled={deletingId === team.id}
                                            className="w-8 h-8 rounded-[8px] items-center justify-center hover:bg-[var(--c-danger-bg)]"
                                            accessibilityLabel={`Șterge ${team.name}`}
                                        >
                                            {deletingId === team.id ? <ActivityIndicator size="small" color="var(--c-danger)" /> : <Trash2 size={14} color="var(--c-danger)" />}
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
