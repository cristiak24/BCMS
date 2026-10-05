import React, { useMemo } from 'react';
import { View } from '@/src/web/reactNative';
import type { Team } from '../../services/teamsApi';
import Button from '../ui/Button';
import PageHero, { GlassStat } from '../admin/PageHero';
import { isFrbTeam } from './teamDisplay';

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
        <PageHero
            eyebrow={clubName ? `Clubul meu · ${clubName}` : 'Clubul meu'}
            title="Echipele clubului"
            subtitle={subtitle}
            actions={
                <>
                    <Button icon="refresh" label="Importă din FRB" onPress={onImport} />
                    <Button variant="primary" icon="add" label="Creează echipă" onPress={onCreate} />
                </>
            }
        >
            {stats.total > 0 ? (
                <View className="grid grid-cols-3 lg:grid-cols-6 gap-2 ui-stagger">
                    <GlassStat value={stats.total} label="Echipe" dot="var(--c-brand-fg)" />
                    <GlassStat value={stats.players} label="Jucători" dot="var(--c-muted)" />
                    <GlassStat value={stats.frb} label="Din FRB" dot="var(--c-danger)" />
                    <GlassStat value={stats.manual} label="Manuale" dot="var(--c-success)" />
                    <GlassStat value={stats.masculine} label="Masculine" dot="var(--c-gender-m)" />
                    <GlassStat value={stats.feminine} label="Feminine" dot="var(--c-gender-f)" />
                </View>
            ) : null}
        </PageHero>
    );
}
