import React, { useMemo } from 'react';
import { View, Text } from '@/src/web/reactNative';
import type { Team } from '../../services/teamsApi';
import Button from '../ui/Button';
import { isFrbTeam } from './teamDisplay';

function StatTile({ value, label, dot }: { value: number; label: string; dot: string }) {
    return (
        <View className="glass rounded-[12px] px-3 py-2.5 min-w-0" style={{ boxShadow: 'var(--e-sm)' } as any}>
            <View className="flex-row items-center gap-1.5">
                <View className="w-[6px] h-[6px] rounded-full shrink-0" style={{ backgroundColor: dot }} />
                <Text className="f-display t-num text-[19px] font-extrabold leading-none" style={{ color: 'var(--c-ink-strong)' }}>{value}</Text>
            </View>
            <Text className="text-[11px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
        </View>
    );
}

function CourtLines() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 320 200"
            width="320"
            height="200"
            style={{ position: 'absolute', right: -40, bottom: -60, pointerEvents: 'none', opacity: 0.55 }}
        >
            <g fill="none" stroke="var(--c-border)" strokeWidth="1.5">
                <rect x="10" y="10" width="300" height="240" rx="2" />
                <rect x="110" y="10" width="100" height="110" />
                <circle cx="160" cy="120" r="40" />
                <path d="M40 10v50a120 120 0 0 0 240 0V10" />
                <circle cx="160" cy="34" r="8" />
            </g>
        </svg>
    );
}

export default function MyClubHero({
    teams,
    clubName,
    onImport,
    onCreate,
}: {
    teams: Team[];
    clubName?: string | null;
    onImport: () => void;
    onCreate: () => void;
}) {
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

    const subtitle = stats.total === 0
        ? 'Importă echipele din FRB sau creează prima echipă.'
        : `${stats.total} ${stats.total === 1 ? 'echipă' : 'echipe'} și ${stats.players} ${stats.players === 1 ? 'jucător' : 'jucători'}, toți într-un singur loc.`;

    return (
        <View className="ui-rise relative overflow-hidden rounded-[16px] border mb-4" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
            <View
                pointerEvents="none"
                className="absolute rounded-full"
                style={{ width: 300, height: 300, right: -70, top: -130, backgroundColor: 'var(--c-surface-tint)', opacity: 0.85 }}
            />
            <CourtLines />
            <View className="relative gap-3.5 p-4 md:p-5">
                <View className="flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <View className="min-w-0 flex-1">
                        <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>{clubName ? `Clubul meu · ${clubName}` : 'Clubul meu'}</Text>
                        <Text className="f-display text-[22px] md:text-[26px] font-extrabold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.035em' } as any}>
                            Echipele clubului
                        </Text>
                        <Text className="text-[13px] mt-1" style={{ color: 'var(--c-muted)' }}>{subtitle}</Text>
                    </View>
                    <View className="flex-row gap-2">
                        <Button icon="refresh" label="Importă din FRB" onPress={onImport} />
                        <Button variant="primary" icon="add" label="Creează echipă" onPress={onCreate} />
                    </View>
                </View>

                {stats.total > 0 ? (
                    <View className="grid grid-cols-3 lg:grid-cols-6 gap-2 ui-stagger">
                        <StatTile value={stats.total} label="Echipe" dot="var(--c-brand-fg)" />
                        <StatTile value={stats.players} label="Jucători" dot="var(--c-muted)" />
                        <StatTile value={stats.frb} label="Din FRB" dot="var(--c-danger)" />
                        <StatTile value={stats.manual} label="Manuale" dot="var(--c-success)" />
                        <StatTile value={stats.masculine} label="Masculine" dot="var(--c-gender-m)" />
                        <StatTile value={stats.feminine} label="Feminine" dot="var(--c-gender-f)" />
                    </View>
                ) : null}
            </View>
        </View>
    );
}
