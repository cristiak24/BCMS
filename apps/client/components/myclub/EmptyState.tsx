import React from 'react';
import { View, Text } from '@/src/web/reactNative';
import { ShieldPlus, FilterX } from 'lucide-react';
import Button from '../ui/Button';

export function NoTeamsEmptyState({ onImport, onCreate }: { onImport: () => void; onCreate: () => void }) {
    return (
        <View className="items-center justify-center text-center py-20 px-6 rounded-[16px] border border-dashed" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border-strong)' }}>
            <View className="w-16 h-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                <ShieldPlus size={28} color="var(--c-faint)" />
            </View>
            <Text className="f-display text-[16px] font-extrabold mb-1.5" style={{ color: 'var(--c-ink-strong)' }}>Niciun club nu are încă echipe</Text>
            <Text className="text-[13px] max-w-[360px] leading-relaxed mb-5" style={{ color: 'var(--c-muted)' }}>
                Importă echipele oficiale din FRB împreună cu loturile lor, sau creează prima echipă manual și adaugă jucătorii ulterior.
            </Text>
            <View className="flex-row gap-2">
                <Button icon="refresh" label="Importă din FRB" onPress={onImport} />
                <Button variant="primary" icon="add" label="Creează prima echipă" onPress={onCreate} />
            </View>
        </View>
    );
}

export function NoResultsEmptyState({ onReset }: { onReset: () => void }) {
    return (
        <View className="items-center justify-center text-center py-16 px-6 rounded-[16px] border border-dashed" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border-strong)' }}>
            <View className="w-14 h-14 rounded-full items-center justify-center mb-3.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                <FilterX size={24} color="var(--c-faint)" />
            </View>
            <Text className="f-display text-[15px] font-extrabold mb-1.5" style={{ color: 'var(--c-ink-strong)' }}>Nicio echipă nu corespunde filtrelor</Text>
            <Text className="text-[13px] mb-4" style={{ color: 'var(--c-muted)' }}>Încearcă să resetezi filtrele sau caută alt termen.</Text>
            <Button label="Resetează filtrele" onPress={onReset} />
        </View>
    );
}
