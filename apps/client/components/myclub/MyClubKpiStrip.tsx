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

    // One row of compact stat cells rather than six tall cards. The numbers are
    // reference, not the primary content of the page (the team grid is), so they
    // get a single dense band separated by hairlines instead of six boxes that
    // pushed the actual teams below the fold.
    return (
        <View
            className="grid grid-cols-3 xl:grid-cols-6 rounded-[14px] border overflow-hidden mb-5 w-full"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
        >
            {cards.map((card, i) => (
                <View
                    key={card.label}
                    className="px-3.5 py-3 border-b xl:border-b-0 border-r"
                    style={{
                        borderColor: 'var(--c-border-soft)',
                        // Trim the outer edges so the band reads as one unit.
                        borderRightWidth: (i % 3 === 2 && i >= 3) || i === 2 || i === 5 ? 0 : 1,
                    } as any}
                >
                    <View className="flex-row items-baseline gap-1.5">
                        <View className="w-[7px] h-[7px] rounded-full self-center" style={{ backgroundColor: card.dot }} />
                        <Text className="text-[19px] font-bold leading-none tabular" style={{ color: 'var(--c-ink)' }}>{card.value}</Text>
                    </View>
                    <Text className="text-[11px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{card.label}</Text>
                </View>
            ))}
        </View>
    );
}
