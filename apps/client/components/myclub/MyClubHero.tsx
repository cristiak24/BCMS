import React, { useMemo } from 'react';
import { View } from '@/src/web/reactNative';
import type { Team } from '../../services/teamsApi';
import Button from '../ui/Button';
import PageHero, { GlassStat } from '../admin/PageHero';
import { plural } from '../../utils/plural';

export default function MyClubHero({
    teams,
    loadFailed = false,
    clubName,
    onImport,
    onCreate,
}: {
    teams: Team[];
    /** The teams didn't load: no subtitle (it would say the club has none). */
    loadFailed?: boolean;
    clubName?: string | null;
    onImport: () => void;
    onCreate: () => void;
}) {
    const stats = useMemo(() => ({
        total: teams.length,
        players: teams.reduce((sum, t) => sum + t.playerCount, 0),
    }), [teams]);

    const subtitle = loadFailed ? undefined : stats.total === 0
        ? 'Importă echipele din FRB sau creează prima echipă.'
        : `${plural(stats.total, 'echipă', 'echipe')} și ${plural(stats.players, 'jucător', 'jucători')}, toți într-un singur loc.`;

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
                // Two figures, not six: FRB/manual and the gender split are already the
                // filter counts below (six tiles sat over two teams).
                <View className="grid grid-cols-2 gap-2 ui-stagger sm:max-w-[420px]">
                    <GlassStat value={stats.total} label="Echipe" dot="var(--c-brand-fg)" />
                    <GlassStat value={stats.players} label="Jucători" dot="var(--c-muted)" />
                </View>
            ) : null}
        </PageHero>
    );
}
