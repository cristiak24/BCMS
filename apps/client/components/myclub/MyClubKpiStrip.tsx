import React, { useMemo } from 'react';
import { View, Text } from '@/src/web/reactNative';
import type { Team } from '../../services/teamsApi';
import { isFrbTeam } from './teamDisplay';

export default function MyClubKpiStrip({ teams }: { teams: Team[] }) {
    const stats = useMemo(() => {
        const frb = teams.filter(isFrbTeam).length;
        return {
            total: teams.length,
            frb,
            manual: teams.length - frb,
            players: teams.reduce((sum, t) => sum + t.playerCount, 0),
            masculine: teams.filter((t) => t.gender === 'M').length,
            feminine: teams.filter((t) => t.gender === 'F').length,
        };
    }, [teams]);

    const cards: { label: string; value: number; dot: string }[] = [
        { label: 'Total echipe', value: stats.total, dot: 'var(--c-brand-fg)' },
        { label: 'Echipe FRB', value: stats.frb, dot: 'var(--c-danger)' },
        { label: 'Echipe manuale', value: stats.manual, dot: 'var(--c-success)' },
        { label: 'Total jucători', value: stats.players, dot: 'var(--c-muted)' },
        { label: 'Echipe masculine', value: stats.masculine, dot: '#28345E' },
        { label: 'Echipe feminine', value: stats.feminine, dot: '#7C3560' },
    ];

    return (
        <View className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6 w-full">
            {cards.map((card) => (
                <View key={card.label} className="bg-white rounded-[18px] border border-[#DDE7F5] px-4 py-3.5 flex-col gap-1.5">
                    <Text className="text-[#0E2041] text-[22px] font-black leading-none">{card.value}</Text>
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: card.dot }} />
                        <Text className="text-[#64748B] text-[11px] font-bold">{card.label}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
}
