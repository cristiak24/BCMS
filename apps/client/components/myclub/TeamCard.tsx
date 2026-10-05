import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { RefreshCw, Users, AlertTriangle, Check, Pencil, Calendar, Trash2, ArrowRight } from 'lucide-react';
import type { Team } from '../../services/teamsApi';
import { GENDER_LABELS, LEVEL_LABELS, formatRelativeDate, isFrbTeam } from './teamDisplay';
import ThemedCheckbox from './ThemedCheckbox';
import { TeamAvatar } from '../l12/L12Visuals';

function Chip({ label, bg, fg, icon }: { label: string; bg: string; fg: string; icon?: React.ReactNode }) {
    return (
        <View className="flex-row items-center gap-1 px-2 h-[22px] rounded-full" style={{ backgroundColor: bg }}>
            {icon}
            <Text className="text-[11px] font-semibold" style={{ color: fg }}>{label}</Text>
        </View>
    );
}

function IconAction({ label, onPress, disabled, danger, children }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={label}
            className={`ui-press w-8 h-8 rounded-[9px] items-center justify-center ${danger ? 'hover:bg-[var(--c-danger-bg)]' : 'hover:bg-[var(--c-surface-3)]'}`}
        >
            {children}
        </Pressable>
    );
}

export default function TeamCard({
    team,
    selected,
    deleting,
    syncing,
    onToggleSelect,
    onOpen,
    onEdit,
    onSchedule,
    onSync,
    onDelete,
}: {
    team: Team;
    selected: boolean;
    deleting: boolean;
    syncing?: boolean;
    onToggleSelect: () => void;
    onOpen: () => void;
    onEdit: () => void;
    onSchedule: () => void;
    onSync?: () => void;
    onDelete: () => void;
}) {
    const frb = isFrbTeam(team);
    const stale = team.staleMedicalChecks > 0;
    const coachInitials = team.coachName
        ? team.coachName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
        : null;

    return (
        <View
            className={`ui-lift group relative flex-col rounded-[14px] p-3.5 border ${team.isActive ? '' : 'opacity-60'}`}
            style={{
                backgroundColor: 'var(--c-surface)',
                borderColor: selected ? 'var(--c-brand-fg)' : 'var(--c-border)',
                boxShadow: selected ? '0 0 0 3px var(--c-brand-border)' : 'var(--e-sm)',
            } as any}
        >
            <View className="flex-row items-start gap-3">
                <TeamAvatar name={team.name} mine size={38} />

                <Pressable onPress={onOpen} className="flex-1 min-w-0 flex-col items-start">
                    <Text className="f-display text-[15px] font-bold leading-tight text-left" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.015em' } as any} numberOfLines={2}>
                        {team.name}
                    </Text>
                    <Text className="t-meta mt-0.5 text-left" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                        {team.seasonName}
                    </Text>
                </Pressable>

                <View className="flex-none pt-0.5">
                    <ThemedCheckbox checked={selected} onToggle={onToggleSelect} ariaLabel={`Selectează ${team.name}`} size={19} />
                </View>
            </View>

            <View className="flex-row flex-wrap gap-1.5 mt-3">
                <Chip
                    label={frb ? 'FRB' : 'Local'}
                    bg={frb ? 'var(--c-danger-bg)' : 'var(--c-success-bg)'}
                    fg={frb ? 'var(--c-danger-fg)' : 'var(--c-success-fg)'}
                    icon={frb ? <RefreshCw size={9} color="var(--c-danger-fg)" /> : undefined}
                />
                {team.gender && GENDER_LABELS[team.gender] ? (
                    <Chip
                        label={GENDER_LABELS[team.gender]}
                        bg={team.gender === 'M' ? 'var(--c-surface-tint)' : 'var(--c-danger-bg)'}
                        fg={team.gender === 'M' ? 'var(--c-gender-m)' : 'var(--c-gender-f)'}
                    />
                ) : null}
                {team.level && LEVEL_LABELS[team.level] ? (
                    <Chip label={LEVEL_LABELS[team.level]} bg="var(--c-surface-3)" fg="var(--c-muted)" />
                ) : null}
                {!team.isActive ? <Chip label="Inactivă" bg="var(--c-surface-3)" fg="var(--c-muted)" /> : null}
            </View>

            <View className="flex-row items-center gap-2 mt-3 rounded-[11px] px-3 py-2" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
                    <Users size={13} color="var(--c-brand-fg)" />
                    <Text className="f-display t-num text-[15px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>{team.playerCount}</Text>
                    <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>jucători</Text>
                </View>
                <View
                    className="flex-row items-center gap-1 px-2 h-[22px] rounded-full"
                    style={{ backgroundColor: stale ? 'var(--c-warning-bg)' : 'var(--c-success-bg)' }}
                >
                    {stale ? <AlertTriangle size={11} color="var(--c-warning-fg)" /> : <Check size={11} color="var(--c-success-fg)" />}
                    <Text className="text-[11px] font-semibold" style={{ color: stale ? 'var(--c-warning-fg)' : 'var(--c-success-fg)' }}>
                        {stale ? `${team.staleMedicalChecks} vize expirate` : 'Vize la zi'}
                    </Text>
                </View>
            </View>

            <View className="flex-row items-center justify-between gap-2 mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: 'var(--c-border-soft)' } as any}>
                <View className="flex-row items-center gap-2 min-w-0 flex-1">
                    <View
                        className="w-6 h-6 rounded-full items-center justify-center flex-none"
                        style={{ backgroundColor: coachInitials ? 'var(--c-surface-tint)' : 'var(--c-surface-3)' }}
                    >
                        <Text className="text-[9.5px] font-bold" style={{ color: coachInitials ? 'var(--c-brand-fg)' : 'var(--c-faint)' }}>
                            {coachInitials ?? '—'}
                        </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                        <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{team.coachName ?? 'Fără antrenor'}</Text>
                        {team.updatedAt ? (
                            <Text className="text-[10.5px]" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>actualizat {formatRelativeDate(team.updatedAt)}</Text>
                        ) : null}
                    </View>
                </View>

                <View className="flex-row items-center flex-none">
                    {frb && onSync ? (
                        <IconAction label="Sincronizează din FRB" onPress={onSync} disabled={syncing}>
                            {syncing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <RefreshCw size={14} color="var(--c-brand-fg)" />}
                        </IconAction>
                    ) : null}
                    <IconAction label="Editează" onPress={onEdit}><Pencil size={14} color="var(--c-muted)" /></IconAction>
                    <IconAction label="Program" onPress={onSchedule}><Calendar size={14} color="var(--c-muted)" /></IconAction>
                    <IconAction label="Șterge" onPress={onDelete} disabled={deleting} danger>
                        {deleting ? <ActivityIndicator size="small" color="var(--c-danger)" /> : <Trash2 size={14} color="var(--c-danger)" />}
                    </IconAction>
                </View>
            </View>

            <Pressable
                onPress={onOpen}
                accessibilityRole="button"
                className="ui-press flex-row items-center justify-center gap-1.5 mt-3 h-8 rounded-[9px]"
                style={{ backgroundColor: 'var(--c-surface-tint)' } as any}
            >
                <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Deschide echipa</Text>
                <ArrowRight size={13} color="var(--c-brand-fg)" />
            </Pressable>
        </View>
    );
}
