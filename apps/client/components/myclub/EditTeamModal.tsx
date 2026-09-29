import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Modal } from '@/src/web/reactNative';
import { X } from 'lucide-react';
import { teamsApi, Team, Coach, TeamGender, TeamLevel } from '../../services/teamsApi';
import { basketballApi, type Season, type Team as FrbTeam } from '../../services/basketballApi';
import { eventsApi } from '../../services/eventsApi';

const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

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

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <Pressable className="flex-1 bg-[#0E2041]/40 items-center justify-center px-4" onPress={onClose}>
            <Pressable className="bg-white w-full max-w-[480px] rounded-[28px] p-6 shadow-2xl" onPress={(event: any) => event.stopPropagation?.()}>
                <View className="flex-row items-center justify-between mb-5">
                    <Text className="text-[18px] font-black text-[#0E2041]">Editează echipa</Text>
                    <Pressable onPress={onClose} className="w-9 h-9 rounded-full bg-[#F8FAFC] items-center justify-center border border-gray-100">
                        <X size={16} color="var(--c-muted)" />
                    </Pressable>
                </View>

                <View className="gap-4">
                    <View>
                        <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Nume echipă</Text>
                        <TextInput
                            value={name}
                            onChangeText={setName}
                            className="w-full h-[48px] rounded-[14px] border border-gray-200 px-4 text-[14px] font-bold text-[#0E2041] bg-[#F8FAFC]"
                        />
                    </View>

                    <View className="flex-row gap-3">
                        <View className="flex-1">
                            <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Sex</Text>
                            <View className="flex-row bg-[#F4F8FD] p-1 rounded-[14px] border border-[#DDE7F5] h-[46px]">
                                {(['M', 'F'] as const).map((g) => (
                                    <Pressable
                                        key={g}
                                        onPress={() => setGender(g)}
                                        className={`flex-1 items-center justify-center rounded-[11px] ${gender === g ? 'bg-[#123A97]' : ''}`}
                                    >
                                        <Text className={`text-[13px] font-black ${gender === g ? 'text-white' : 'text-[#94A3B8]'}`}>{g === 'M' ? 'Masculin' : 'Feminin'}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                        <View className="flex-1">
                            <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Nivel</Text>
                            <select
                                value={level}
                                onChange={(e) => setLevel(e.target.value as TeamLevel | '')}
                                className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]"
                            >
                                <option value="">Fără nivel</option>
                                <option value="national">Național</option>
                                <option value="municipal">Municipal</option>
                                <option value="initiere">Inițiere</option>
                            </select>
                        </View>
                    </View>

                    <View>
                        <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Antrenor</Text>
                        <select
                            value={coachId}
                            onChange={(e) => setCoachId(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]"
                        >
                            <option value="">Fără antrenor</option>
                            {coaches.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </View>

                    {isFrbTeam ? (
                        <View className="rounded-[14px] border p-3.5 gap-3" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
                            <View>
                                <Text className="text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>Sezon FRB</Text>
                                <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }}>
                                    Meciurile din calendar vin din sezonul ales aici. Acum: {team.seasonName || '—'}.
                                </Text>
                            </View>
                            <select
                                value={seasonId}
                                onChange={(e) => changeSeason(e.target.value)}
                                aria-label="Sezon FRB"
                                className="native-field h-11 w-full rounded-[11px] border px-3 text-[14px] font-medium"
                                style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' }}
                            >
                                {!seasons.some((season) => season.id === seasonId) && seasonId ? (
                                    <option value={seasonId}>{team.seasonName || seasonId}</option>
                                ) : null}
                                {seasons.map((season) => (
                                    <option key={season.id} value={season.id}>{season.text}</option>
                                ))}
                            </select>
                            {seasonChanged ? (
                                loadingSeasonTeams ? (
                                    <View className="flex-row items-center gap-2">
                                        <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                                        <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-muted)' }}>Se încarcă echipele sezonului…</Text>
                                    </View>
                                ) : (
                                    <View>
                                        <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Echipa în noul sezon</Text>
                                        <select
                                            value={frbTeamId}
                                            onChange={(e) => setFrbTeamId(e.target.value)}
                                            aria-label="Echipa FRB în noul sezon"
                                            className="native-field h-11 w-full rounded-[11px] border px-3 text-[14px] font-medium"
                                            style={{ backgroundColor: 'var(--c-surface)', borderColor: frbTeamId ? 'var(--c-border)' : 'var(--c-warning)', color: 'var(--c-ink)' }}
                                        >
                                            <option value="">Alege echipa</option>
                                            {seasonTeams.map((frbTeam) => (
                                                <option key={frbTeam.id} value={frbTeam.id}>{frbTeam.name}</option>
                                            ))}
                                        </select>
                                    </View>
                                )
                            ) : null}
                        </View>
                    ) : null}

                    <Pressable onPress={() => setIsActive((v) => !v)} className="flex-row items-center gap-2.5">
                        <View className={`w-5 h-5 rounded-[6px] border-2 items-center justify-center ${isActive ? 'bg-[#1D3E90] border-[#1D3E90]' : 'border-gray-300'}`}>
                            {isActive && <View className="w-2 h-2 rounded-[2px] bg-white" />}
                        </View>
                        <Text className="text-[13px] font-bold text-[#0E2041]">Echipă activă</Text>
                    </Pressable>

                    {error && <Text className="text-[12.5px] font-bold text-red-600">{error}</Text>}
                </View>

                <View className="flex-row gap-3 mt-6">
                    <Pressable onPress={onClose} className="flex-1 h-[50px] rounded-[14px] border border-gray-200 items-center justify-center bg-white">
                        <Text className="text-[#64748B] font-black uppercase tracking-widest text-[12px]">Anulează</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleSave}
                        disabled={saving}
                        className={`flex-1 h-[50px] rounded-[14px] items-center justify-center ${saving ? 'bg-[#93C5FD]' : 'bg-[#1D3E90]'}`}
                    >
                        {saving ? <ActivityIndicator size="small" color="var(--c-surface)" /> : <Text className="text-white font-black uppercase tracking-widest text-[12px]">Salvează</Text>}
                    </Pressable>
                </View>
            </Pressable>
        </Pressable>
        </Modal>
    );
}
