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
        <View className="flex-row flex-wrap items-center gap-2.5 bg-[#EBF1FF] border border-[#BFDBFE] rounded-[16px] px-4 py-3 mb-6">
            <Text className="text-[#1D3E90] text-[13px] font-black">{count} {count === 1 ? 'echipă selectată' : 'echipe selectate'}</Text>
            {busy && <ActivityIndicator size="small" color="#1D3E90" />}
            <View className="flex-1" />

            <Pressable onPress={onExport} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#1D3E90] bg-white">
                <Download size={13} color="#1D3E90" />
                <Text className="text-[#1D3E90] text-[11.5px] font-bold">Export CSV</Text>
            </Pressable>

            <Pressable onPress={onActivate} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#1D3E90] bg-white">
                <ArchiveRestore size={13} color="#1D3E90" />
                <Text className="text-[#1D3E90] text-[11.5px] font-bold">Activează</Text>
            </Pressable>

            <Pressable onPress={onArchive} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#1D3E90] bg-white">
                <Archive size={13} color="#1D3E90" />
                <Text className="text-[#1D3E90] text-[11.5px] font-bold">Arhivează</Text>
            </Pressable>

            {coaches.length > 0 && (
                <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#1D3E90] bg-white">
                    <UserCog size={13} color="#1D3E90" />
                    <select
                        defaultValue=""
                        onChange={(e) => {
                            const id = Number(e.target.value);
                            if (id) onReassignCoach(id);
                            e.target.value = '';
                        }}
                        className="text-[#1D3E90] text-[11.5px] font-bold bg-transparent outline-none"
                    >
                        <option value="" disabled>Schimbă antrenor…</option>
                        {coaches.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </View>
            )}

            <Pressable onPress={onSyncFrb} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#1D3E90] bg-white">
                <RefreshCw size={13} color="#1D3E90" />
                <Text className="text-[#1D3E90] text-[11.5px] font-bold">Sincronizează FRB</Text>
            </Pressable>

            <Pressable onPress={onClear} className="w-7 h-7 rounded-full items-center justify-center hover:bg-white/60">
                <X size={15} color="#1D3E90" />
            </Pressable>
        </View>
    );
}
