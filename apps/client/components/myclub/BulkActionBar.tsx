import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { X, Archive, ArchiveRestore, UserCog, Download, RefreshCw } from 'lucide-react';
import type { Coach } from '../../services/teamsApi';

export default function BulkActionBar({
    count,
    coaches,
    busy,
    onArchive,
    onActivate,
    onReassignCoach,
    onExport,
    onSyncFrb,
    onClear,
}: {
    count: number;
    coaches: Coach[];
    busy: boolean;
    onArchive: () => void;
    onActivate: () => void;
    onReassignCoach: (coachId: number) => void;
    onExport: () => void;
    onSyncFrb: () => void;
    onClear: () => void;
}) {
    if (count === 0) return null;

    return (
        <View className="ui-rise flex-col sm:flex-row sm:items-center gap-2.5 border rounded-[14px] px-3.5 py-2.5 mb-4" style={{ backgroundColor: 'var(--c-surface-tint)', borderColor: 'var(--c-brand-border)' } as any}>
            <View className="flex-row items-center gap-2 flex-none">
                <Text className="f-display text-[13px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{count} {count === 1 ? 'echipă selectată' : 'echipe selectate'}</Text>
                {busy && <ActivityIndicator size="small" color="var(--c-brand-fg)" />}
                <Pressable onPress={onClear} className="sm:hidden ml-auto w-7 h-7 rounded-full items-center justify-center hover:bg-[var(--c-surface)]">
                    <X size={15} color="var(--c-brand-fg)" />
                </Pressable>
            </View>

            <View className="flex-row items-center gap-2.5 overflow-x-auto sm:ml-auto sm:justify-end pb-1 sm:pb-0">
                <Pressable onPress={onExport} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border flex-none" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-brand-border)' }}>
                    <Download size={13} color="var(--c-brand-fg)" />
                    <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Exportă CSV</Text>
                </Pressable>

                <Pressable onPress={onActivate} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border flex-none" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-brand-border)' }}>
                    <ArchiveRestore size={13} color="var(--c-brand-fg)" />
                    <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Activează</Text>
                </Pressable>

                <Pressable onPress={onArchive} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border flex-none" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-brand-border)' }}>
                    <Archive size={13} color="var(--c-brand-fg)" />
                    <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Arhivează</Text>
                </Pressable>

                {coaches.length > 0 && (
                    <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border flex-none" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-brand-border)' }}>
                        <UserCog size={13} color="var(--c-brand-fg)" />
                        <select
                            defaultValue=""
                            onChange={(e) => {
                                const id = Number(e.target.value);
                                if (id) onReassignCoach(id);
                                e.target.value = '';
                            }}
                            className="text-[11.5px] font-semibold bg-transparent outline-none" style={{ color: 'var(--c-brand-fg)' }}
                        >
                            <option value="" disabled>Schimbă antrenor…</option>
                            {coaches.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </View>
                )}

                <Pressable onPress={onSyncFrb} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border flex-none" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-brand-border)' }}>
                    <RefreshCw size={13} color="var(--c-brand-fg)" />
                    <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Sincronizează FRB</Text>
                </Pressable>

                <Pressable onPress={onClear} className="hidden sm:flex w-7 h-7 rounded-full items-center justify-center hover:bg-[var(--c-surface)] flex-none">
                    <X size={15} color="var(--c-brand-fg)" />
                </Pressable>
            </View>
        </View>
    );
}
