import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, ScrollView } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { teamsApi, Team, Coach, TeamGender, TeamLevel } from '../../services/teamsApi';
import { basketballApi, type Season, type Team as FrbTeam } from '../../services/basketballApi';
import { eventsApi } from '../../services/eventsApi';
import Button from '../ui/Button';
import FilterChips from '../ui/FilterChips';
import SelectField from '../ui/SelectField';
import { FormField } from '../ui/FormField';
import ThemedCheckbox from './ThemedCheckbox';

const normalizeName = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Best guess for "the same club" in another season's FRB team list. */
function findSameTeam(teams: FrbTeam[], name: string) {
    const target = normalizeName(name);
    return teams.find((team) => normalizeName(team.name) === target)
        ?? teams.find((team) => {
            const candidate = normalizeName(team.name);
            return candidate.length >= 4 && (candidate.includes(target) || target.includes(candidate));
        })
        ?? null;
}

const LEVEL_OPTIONS: { key: TeamLevel | ''; label: string }[] = [
    { key: '', label: 'Fără nivel' },
    { key: 'national', label: 'Național' },
    { key: 'municipal', label: 'Municipal' },
    { key: 'initiere', label: 'Inițiere' },
];

/** Visible label over a SelectField (which carries the same text as its accessible name). */
function FieldLabel({ children }: { children: string }) {
    return <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>{children}</Text>;
}

/**
 * Edit a team's name, sex, level, coach, FRB season and active flag.
 * Built on the shared primitives: it was the last pre-overhaul dialog
 * (uppercase labels, 28px radius, shadow-2xl, hardcoded navy that stayed
 * light in dark mode).
 */
export default function EditTeamModal({
    team,
    coaches,
    onClose,
    onSaved,
}: {
    team: Team;
    coaches: Coach[];
    onClose: () => void;
    onSaved: (team: Team) => void;
}) {
    const [name, setName] = useState(team.name);
    const [gender, setGender] = useState<TeamGender>(team.gender ?? 'M');
    const [level, setLevel] = useState<TeamLevel | ''>(team.level ?? '');
    const [coachId, setCoachId] = useState<number | ''>(team.coachId ?? '');
    const [isActive, setIsActive] = useState(team.isActive);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // FRB season. A team used to be locked to the season it was created in, so
    // its calendar could never show the current season's fixtures.
    const isFrbTeam = Boolean(team.frbLeagueId?.trim());
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [seasonId, setSeasonId] = useState(team.frbSeasonId ?? '');
    const [seasonTeams, setSeasonTeams] = useState<FrbTeam[]>([]);
    const [frbTeamId, setFrbTeamId] = useState(team.frbTeamId ?? '');
    const [loadingSeasonTeams, setLoadingSeasonTeams] = useState(false);

    useEffect(() => {
        if (!isFrbTeam) return;
        let active = true;
        basketballApi.getSeasons(team.frbLeagueId)
            .then((rows) => { if (active) setSeasons(rows); })
            .catch(() => { if (active) setSeasons([]); });
        return () => { active = false; };
    }, [isFrbTeam, team.frbLeagueId]);

    const changeSeason = async (nextSeasonId: string) => {
        setSeasonId(nextSeasonId);
        if (!nextSeasonId || nextSeasonId === team.frbSeasonId) {
            setFrbTeamId(team.frbTeamId ?? '');
            setSeasonTeams([]);
            return;
        }
        setLoadingSeasonTeams(true);
        try {
            const rows = await basketballApi.getTeams(team.frbLeagueId, nextSeasonId);
            setSeasonTeams(rows);
            // FRB team ids can change between seasons — pre-pick the same club.
            setFrbTeamId(findSameTeam(rows, team.name)?.id ?? '');
        } catch {
            setSeasonTeams([]);
            setFrbTeamId('');
        } finally {
            setLoadingSeasonTeams(false);
        }
    };

    const seasonChanged = isFrbTeam && seasonId !== '' && seasonId !== team.frbSeasonId;

    useEffect(() => {
        setName(team.name);
        setGender(team.gender ?? 'M');
        setLevel(team.level ?? '');
        setCoachId(team.coachId ?? '');
        setIsActive(team.isActive);
    }, [team]);

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Numele echipei este obligatoriu.');
            return;
        }
        if (seasonChanged && !frbTeamId) {
            setError('Alege echipa corespunzătoare din noul sezon FRB.');
            return;
        }
        try {
            setSaving(true);
            setError(null);
            const updated = await teamsApi.updateTeam(team.id, {
                name: name.trim(),
                gender,
                level: level || undefined,
                coachId: coachId === '' ? null : Number(coachId),
                isActive,
                ...(seasonChanged ? {
                    frbSeasonId: seasonId,
                    seasonName: seasons.find((season) => season.id === seasonId)?.text ?? seasonId,
                    frbTeamId,
                } : {}),
            });
            if (seasonChanged) {
                // Pull the new season's fixtures now instead of waiting for the
                // schedule's periodic sync; clear its timestamp either way.
                try { localStorage.removeItem('bcms.frb-sync-at'); } catch { /* storage unavailable */ }
                void eventsApi.syncFRBMatches().catch(() => undefined);
            }
            onSaved(updated);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Nu s-a putut salva echipa.');
        } finally {
            setSaving(false);
        }
    };

    const close = saving ? () => undefined : onClose;
    const coachOptions = [
        { key: '', label: 'Fără antrenor' },
        ...coaches.map((coach) => ({ key: String(coach.id), label: coach.name })),
    ];
    const seasonOptions = [
        ...(!seasons.some((season) => season.id === seasonId) && seasonId ? [{ key: seasonId, label: team.seasonName || seasonId }] : []),
        ...seasons.map((season) => ({ key: season.id, label: season.text })),
    ];

    return (
        <Modal visible transparent animationType="fade" onRequestClose={close}>
            <View className="flex-1 items-center justify-center p-4">
                {/* The backdrop is a layer behind the card, not its parent: a parent
                    <button> would have put every field and button inside a button. */}
                <Pressable
                    accessibilityLabel="Închide"
                    onPress={close}
                    tabIndex={-1}
                    className="absolute inset-0"
                    style={{ backgroundColor: 'rgba(2, 8, 23, 0.62)' }}
                />
                <View
                    role="dialog"
                    aria-modal="true"
                    aria-label="Editează echipa"
                    className="relative w-full max-w-[480px] max-h-[90vh] rounded-[18px] border flex-col overflow-hidden shadow-[var(--e-lg)]"
                    style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                >
                    <View className="flex-row items-center justify-between gap-3 px-5 pt-5 pb-3">
                        <Text accessibilityRole="header" className="f-display text-[18px] font-bold" style={{ color: 'var(--c-ink)' }}>Editează echipa</Text>
                        <Pressable
                            onPress={close}
                            accessibilityLabel="Închide"
                            className="w-10 h-10 -mr-2 rounded-[10px] items-center justify-center hover:bg-[var(--c-surface-3)]"
                        >
                            <MaterialIcons name="close" size={18} color="var(--c-muted)" />
                        </Pressable>
                    </View>

                    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-5 gap-4">
                        <FormField label="Nume echipă" value={name} onChangeText={setName} maxLength={120} />

                        <View className="flex-row flex-wrap gap-4">
                            <View className="min-w-[180px] flex-1">
                                <FieldLabel>Sex</FieldLabel>
                                <FilterChips
                                    label="Sex"
                                    value={gender}
                                    onChange={setGender}
                                    scrollOnMobile={false}
                                    options={[{ key: 'M', label: 'Masculin' }, { key: 'F', label: 'Feminin' }]}
                                />
                            </View>
                            <View className="min-w-[180px] flex-1">
                                <FieldLabel>Nivel</FieldLabel>
                                <SelectField label="Nivel" value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
                            </View>
                        </View>

                        <View>
                            <FieldLabel>Antrenor</FieldLabel>
                            <SelectField
                                label="Antrenor"
                                value={coachId === '' ? '' : String(coachId)}
                                onChange={(next) => setCoachId(next === '' ? '' : Number(next))}
                                options={coachOptions}
                            />
                        </View>

                        {isFrbTeam ? (
                            <View className="rounded-[12px] border p-3.5 gap-3" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                                <View>
                                    <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }}>Sezon FRB</Text>
                                    <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
                                        Meciurile din calendar vin din sezonul ales aici. Acum: {team.seasonName || '—'}.
                                    </Text>
                                </View>
                                <SelectField label="Sezon FRB" value={seasonId} onChange={(next) => void changeSeason(next)} options={seasonOptions} />
                                {seasonChanged ? (
                                    loadingSeasonTeams ? (
                                        <View className="flex-row items-center gap-2">
                                            <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                                            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Se încarcă echipele sezonului…</Text>
                                        </View>
                                    ) : (
                                        <View>
                                            <FieldLabel>Echipa în noul sezon</FieldLabel>
                                            <SelectField
                                                label="Echipa FRB în noul sezon"
                                                value={frbTeamId}
                                                onChange={setFrbTeamId}
                                                options={[{ key: '', label: 'Alege echipa' }, ...seasonTeams.map((frbTeam) => ({ key: frbTeam.id, label: frbTeam.name }))]}
                                            />
                                        </View>
                                    )
                                ) : null}
                            </View>
                        ) : null}

                        <View className="flex-row items-center gap-2.5">
                            <ThemedCheckbox checked={isActive} onToggle={() => setIsActive((value) => !value)} ariaLabel="Echipă activă" size={18} />
                            <Text className="text-[13px] font-medium" style={{ color: 'var(--c-ink)' }} aria-hidden>Echipă activă</Text>
                        </View>

                        {error ? (
                            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-danger-fg)' }} accessibilityRole="alert">{error}</Text>
                        ) : null}
                    </ScrollView>

                    <View className="flex-row justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--c-border-soft)' }}>
                        <Button label="Anulează" variant="secondary" onPress={close} disabled={saving} />
                        <Button label="Salvează" variant="primary" onPress={() => void handleSave()} loading={saving} />
                    </View>
                </View>
            </View>
        </Modal>
    );
}
