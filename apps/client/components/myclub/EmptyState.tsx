import React from 'react';
import { View, Text, Pressable } from '@/src/web/reactNative';
import { ShieldPlus, FilterX, RefreshCw, Plus } from 'lucide-react';

export function NoTeamsEmptyState({ onImport, onCreate }: { onImport: () => void; onCreate: () => void }) {
    return (
        <View className="items-center justify-center text-center py-20 px-6 bg-white rounded-[24px] border border-dashed border-[#DDE7F5]">
            <View className="w-16 h-16 rounded-full bg-[#F4F8FD] items-center justify-center mb-4">
                <ShieldPlus size={28} color="#94A3B8" />
            </View>
            <Text className="text-[#0E2041] text-[16px] font-black mb-1.5">Niciun club nu are încă echipe</Text>
            <Text className="text-[#64748B] text-[13px] font-semibold max-w-[360px] leading-relaxed mb-5">
                Importă echipele oficiale din FRB împreună cu loturile lor, sau creează prima echipă manual și adaugă jucătorii ulterior.
            </Text>
            <View className="flex-row gap-2.5">
                <Pressable onPress={onImport} className="flex-row items-center gap-2 h-11 px-4 rounded-[14px] border border-[#DDE7F5] bg-white active:bg-[#F4F8FD]">
                    <RefreshCw size={14} color="#1D3E90" />
                    <Text className="text-[#1D3E90] text-[12px] font-black uppercase tracking-widest">Importă din FRB</Text>
                </Pressable>
                <Pressable onPress={onCreate} className="flex-row items-center gap-2 h-11 px-4 rounded-[14px] bg-[#1D3E90] active:bg-[#152e6b]">
                    <Plus size={14} color="#ffffff" />
                    <Text className="text-white text-[12px] font-black uppercase tracking-widest">Creează prima echipă</Text>
                </Pressable>
            </View>
        </View>
    );
}

export function NoResultsEmptyState({ onReset }: { onReset: () => void }) {
    return (
        <View className="items-center justify-center text-center py-16 px-6 bg-white rounded-[24px] border border-dashed border-[#DDE7F5]">
            <View className="w-14 h-14 rounded-full bg-[#F4F8FD] items-center justify-center mb-3.5">
                <FilterX size={24} color="#94A3B8" />
            </View>
            <Text className="text-[#0E2041] text-[15px] font-black mb-1.5">Nicio echipă nu corespunde filtrelor</Text>
            <Text className="text-[#64748B] text-[13px] font-semibold mb-4">Încearcă să resetezi filtrele sau caută alt termen.</Text>
            <Pressable onPress={onReset} className="h-10 px-4 rounded-[12px] border border-[#DDE7F5] bg-white active:bg-[#F4F8FD]">
                <Text className="text-[#1D3E90] text-[12px] font-black uppercase tracking-widest">Resetează filtrele</Text>
            </Pressable>
        </View>
    );
}
