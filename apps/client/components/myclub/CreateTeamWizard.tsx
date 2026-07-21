import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Modal } from '@/src/web/reactNative';
import { RefreshCw, Plus, X, Check, Search } from 'lucide-react';
import { basketballApi } from '../../services/basketballApi';
import { teamsApi, Team, Coach, TeamGender, TeamLevel, Player } from '../../services/teamsApi';
import { LEAGUES_M, LEAGUES_F } from './frbLeagues';

type Item = { id: string; name: string };
type SourceType = 'frb' | 'manual';

const STEP_LABELS = ['Tip echipă', 'Date echipă', 'Jucători', 'Confirmare'];

export default function CreateTeamWizard({
    coaches,
    initialSource,
    onClose,
    onCreated,
}: {
    coaches: Coach[];
    initialSource?: SourceType;
    onClose: () => void;
    onCreated: (team: Team) => void;
}) {
    const [step, setStep] = useState(0);
    const [source, setSource] = useState<SourceType | null>(initialSource ?? null);

    // shared fields
    const [gender, setGender] = useState<TeamGender>('M');
    const [level, setLevel] = useState<TeamLevel | ''>('');
    const [coachId, setCoachId] = useState<number | ''>('');

    // FRB fields
    const [leagueId, setLeagueId] = useState('');
    const [leagueName, setLeagueName] = useState('');
    const [seasonId, setSeasonId] = useState('');
    const [seasonName, setSeasonName] = useState('');
    const [teamId, setTeamId] = useState('');
    const [teamName, setTeamName] = useState('');
    const [seasons, setSeasons] = useState<Item[]>([]);
    const [frbTeams, setFrbTeams] = useState<Item[]>([]);
    const [loadingDrop, setLoadingDrop] = useState(false);

    // manual fields
    const [customName, setCustomName] = useState('');
    const [customCategory, setCustomCategory] = useState('');
    const [customSeason, setCustomSeason] = useState('2025-2026');

    // players step
    const [playerQuery, setPlayerQuery] = useState('');
    const [playerResults, setPlayerResults] = useState<Player[]>([]);
    const [searchingPlayers, setSearchingPlayers] = useState(false);
    const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);

    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (initialSource === 'frb' && step === 0) {
            setSource('frb');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (playerQuery.trim().length < 2) {
                setPlayerResults([]);
                return;
            }
            try {
                setSearchingPlayers(true);
                const results = await teamsApi.searchPlayers(playerQuery.trim());
                setPlayerResults(results.filter((p) => !selectedPlayers.some((sp) => sp.id === p.id)));
            } catch (e) {
                console.error('Player search failed', e);
            } finally {
                setSearchingPlayers(false);
            }
        }, 200);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playerQuery, selectedPlayers]);

    const loadSeasons = async (id: string) => {
        try {
            setLoadingDrop(true);
            setSeasonId(''); setSeasonName('');
            setTeamId(''); setTeamName('');
            setFrbTeams([]);
            const data = await basketballApi.getSeasons(id);
            setSeasons(data.map((d) => ({ id: d.id, name: d.text })));
        } catch (e) {
            console.error(e);
            setSeasons([]);
        } finally {
            setLoadingDrop(false);
        }
    };

    const loadFrbTeams = async (sId: string, lId: string) => {
        try {
            setLoadingDrop(true);
            setTeamId(''); setTeamName('');
            const data = await basketballApi.getTeams(lId, sId);
            setFrbTeams(data.map((d) => ({ id: d.id, name: d.name })));
        } catch (e) {
            console.error(e);
            setFrbTeams([]);
        } finally {
            setLoadingDrop(false);
        }
    };

    const canAdvanceFromStep1 = source !== null;
    const canAdvanceFromStep2 = source === 'frb'
        ? Boolean(leagueId && seasonId && teamId)
        : Boolean(customName.trim() && customCategory.trim() && customSeason.trim());

    const goNext = () => {
        setError(null);
        if (step === 3) {
            void handleCreate();
            return;
        }
        setStep((s) => Math.min(3, s + 1));
    };

    const goBack = () => {
        setError(null);
        setStep((s) => Math.max(0, s - 1));
    };

    const handleCreate = async () => {
        try {
            setCreating(true);
            setError(null);

            const created = source === 'frb'
                ? await teamsApi.addTeam({
                    frbTeamId: teamId,
                    name: teamName,
                    frbLeagueId: leagueId,
                    leagueName: `${gender}: ${leagueName}`,
                    frbSeasonId: seasonId,
                    seasonName,
                    gender,
                    level: level || undefined,
                    coachId: coachId === '' ? null : Number(coachId),
                })
                : await teamsApi.addTeam({
                    name: customName.trim(),
                    leagueName: customCategory.trim(),
                    seasonName: customSeason.trim(),
                    isCustom: true,
                    gender,
                    level: level || undefined,
                    coachId: coachId === '' ? null : Number(coachId),
                });

            if (selectedPlayers.length > 0) {
                await Promise.all(selectedPlayers.map((p) => teamsApi.addPlayerToTeam(p.id, created.id).catch((e) => {
                    console.error(`Failed to attach player ${p.id} to team ${created.id}`, e);
                })));
            }

            onCreated(created);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Nu s-a putut crea echipa.');
        } finally {
            setCreating(false);
        }
    };

    const leagues = gender === 'M' ? LEAGUES_M : LEAGUES_F;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <Pressable className="flex-1 bg-[#0E2041]/40 items-center justify-center px-4" onPress={creating ? undefined : onClose}>
            <Pressable className="bg-white w-full max-w-[600px] rounded-[28px] shadow-2xl overflow-hidden" onPress={(event: any) => event.stopPropagation?.()}>
                <View className="flex-row items-center justify-between px-6 pt-6 pb-1">
                    <Text className="text-[18px] font-black text-[#0E2041]">Creează echipă</Text>
                    <Pressable onPress={onClose} disabled={creating} className="w-9 h-9 rounded-full bg-[#F8FAFC] items-center justify-center border border-gray-100">
                        <X size={16} color="#64748B" />
                    </Pressable>
                </View>

                <View className="flex-row gap-1.5 px-6 pt-4">
                    {STEP_LABELS.map((label, i) => (
                        <View key={label} className="flex-1 gap-1.5">
                            <View className={`h-[3px] rounded-full ${i <= step ? 'bg-[#1D3E90]' : 'bg-gray-200'}`} />
                            <Text className={`text-[10px] font-bold ${i === step ? 'text-[#1D3E90]' : 'text-[#94A3B8]'}`}>{label}</Text>
                        </View>
                    ))}
                </View>

                <View className="px-6 py-5 min-h-[280px]">
                    {step === 0 && (
                        <View className="flex-row gap-3">
                            <Pressable
                                onPress={() => setSource('frb')}
                                className={`flex-1 rounded-[18px] p-4 border-2 items-start ${source === 'frb' ? 'border-[#1D3E90] bg-[#F4F8FD]' : 'border-[#E2E8F0] bg-white'}`}
                            >
                                <View className="w-9 h-9 rounded-[10px] bg-[#EBF1FF] items-center justify-center mb-3">
                                    <RefreshCw size={16} color="#1D3E90" />
                                </View>
                                <Text className="text-[13.5px] font-black text-[#0E2041] mb-1">Import din FRB</Text>
                                <Text className="text-[11.5px] font-semibold text-[#64748B] leading-relaxed text-left">Preia echipa oficială direct din sistemul federației.</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => setSource('manual')}
                                className={`flex-1 rounded-[18px] p-4 border-2 items-start ${source === 'manual' ? 'border-[#1D3E90] bg-[#F4F8FD]' : 'border-[#E2E8F0] bg-white'}`}
                            >
                                <View className="w-9 h-9 rounded-[10px] bg-[#E6F8F1] items-center justify-center mb-3">
                                    <Plus size={16} color="#0B7A55" />
                                </View>
                                <Text className="text-[13.5px] font-black text-[#0E2041] mb-1">Creare manuală</Text>
                                <Text className="text-[11.5px] font-semibold text-[#64748B] leading-relaxed text-left">Definești echipa și alegi jucătorii din baza de date a clubului.</Text>
                            </Pressable>
                        </View>
                    )}

                    {step === 1 && source === 'frb' && (
                        <View className="gap-3.5">
                            <View className="flex-row bg-[#F4F8FD] p-1 rounded-[14px] border border-[#DDE7F5] h-[46px] w-[160px]">
                                {(['M', 'F'] as const).map((g) => (
                                    <Pressable key={g} onPress={() => { setGender(g); setLeagueId(''); setLeagueName(''); setSeasons([]); setFrbTeams([]); }} className={`flex-1 items-center justify-center rounded-[11px] ${gender === g ? 'bg-[#123A97]' : ''}`}>
                                        <Text className={`text-[13px] font-black ${gender === g ? 'text-white' : 'text-[#94A3B8]'}`}>{g}</Text>
                                    </Pressable>
                                ))}
                            </View>

                            <View className="flex-row gap-3">
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Categorie</Text>
                                    <select
                                        value={leagueId}
                                        onChange={(e) => {
                                            const opt = leagues.find((l) => l.id === e.target.value);
                                            setLeagueId(e.target.value);
                                            setLeagueName(opt?.name ?? '');
                                            if (e.target.value) void loadSeasons(e.target.value);
                                        }}
                                        className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]"
                                    >
                                        <option value="">Alege liga</option>
                                        {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Sezon</Text>
                                    <select
                                        value={seasonId}
                                        disabled={seasons.length === 0}
                                        onChange={(e) => {
                                            const opt = seasons.find((s) => s.id === e.target.value);
                                            setSeasonId(e.target.value);
                                            setSeasonName(opt?.name ?? '');
                                            if (e.target.value) void loadFrbTeams(e.target.value, leagueId);
                                        }}
                                        className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC] disabled:opacity-50"
                                    >
                                        <option value="">{loadingDrop ? 'Se încarcă…' : 'Alege sezonul'}</option>
                                        {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </View>
                            </View>

                            <View>
                                <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Echipă FRB</Text>
                                <select
                                    value={teamId}
                                    disabled={frbTeams.length === 0}
                                    onChange={(e) => {
                                        const opt = frbTeams.find((t) => t.id === e.target.value);
                                        setTeamId(e.target.value);
                                        setTeamName(opt?.name ?? '');
                                    }}
                                    className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC] disabled:opacity-50"
                                >
                                    <option value="">{loadingDrop ? 'Se încarcă…' : 'Alege echipa'}</option>
                                    {frbTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </View>

                            <View className="flex-row gap-3">
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Nivel</Text>
                                    <select value={level} onChange={(e) => setLevel(e.target.value as TeamLevel | '')} className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]">
                                        <option value="">Fără nivel</option>
                                        <option value="national">Național</option>
                                        <option value="municipal">Municipal</option>
                                        <option value="initiere">Inițiere</option>
                                    </select>
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Antrenor</Text>
                                    <select value={coachId} onChange={(e) => setCoachId(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]">
                                        <option value="">Fără antrenor</option>
                                        {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </View>
                            </View>
                        </View>
                    )}

                    {step === 1 && source === 'manual' && (
                        <View className="gap-3.5">
                            <View>
                                <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Nume echipă</Text>
                                <TextInput value={customName} onChangeText={setCustomName} placeholder="Ex: Municipal U16 Masculin" placeholderTextColor="#94A3B8" className="w-full h-[48px] rounded-[14px] border border-gray-200 px-4 text-[14px] font-bold text-[#0E2041] bg-[#F8FAFC]" />
                            </View>
                            <View className="flex-row gap-3">
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Categorie</Text>
                                    <TextInput value={customCategory} onChangeText={setCustomCategory} placeholder="Ex: Junior League" placeholderTextColor="#94A3B8" className="w-full h-[48px] rounded-[14px] border border-gray-200 px-4 text-[14px] font-bold text-[#0E2041] bg-[#F8FAFC]" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Sezon</Text>
                                    <TextInput value={customSeason} onChangeText={setCustomSeason} placeholder="2025-2026" placeholderTextColor="#94A3B8" className="w-full h-[48px] rounded-[14px] border border-gray-200 px-4 text-[14px] font-bold text-[#0E2041] bg-[#F8FAFC]" />
                                </View>
                            </View>
                            <View className="flex-row gap-3">
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Sex</Text>
                                    <View className="flex-row bg-[#F4F8FD] p-1 rounded-[14px] border border-[#DDE7F5] h-[46px]">
                                        {(['M', 'F'] as const).map((g) => (
                                            <Pressable key={g} onPress={() => setGender(g)} className={`flex-1 items-center justify-center rounded-[11px] ${gender === g ? 'bg-[#123A97]' : ''}`}>
                                                <Text className={`text-[13px] font-black ${gender === g ? 'text-white' : 'text-[#94A3B8]'}`}>{g === 'M' ? 'Masculin' : 'Feminin'}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </View>
                                <View className="flex-1">
                                    <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Nivel</Text>
                                    <select value={level} onChange={(e) => setLevel(e.target.value as TeamLevel | '')} className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]">
                                        <option value="">Fără nivel</option>
                                        <option value="national">Național</option>
                                        <option value="municipal">Municipal</option>
                                        <option value="initiere">Inițiere</option>
                                    </select>
                                </View>
                            </View>
                            <View>
                                <Text className="text-[10px] font-black text-[#1D3E90] uppercase tracking-widest mb-1.5 ml-1">Antrenor</Text>
                                <select value={coachId} onChange={(e) => setCoachId(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-[46px] rounded-[14px] border border-gray-200 px-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]">
                                    <option value="">Fără antrenor</option>
                                    {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </View>
                        </View>
                    )}

                    {step === 2 && (
                        <View className="gap-3">
                            <Text className="text-[12px] font-semibold text-[#64748B]">Selectează jucători existenți din baza de date a clubului. Poți adăuga alții mai târziu, din pagina echipei.</Text>
                            <View className="relative">
                                <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <Search size={14} color="#94A3B8" />
                                </View>
                                <TextInput
                                    value={playerQuery}
                                    onChangeText={setPlayerQuery}
                                    placeholder="Caută după nume"
                                    placeholderTextColor="#94A3B8"
                                    className="w-full h-[44px] rounded-[14px] border border-gray-200 pl-9 pr-3 text-[13px] font-bold text-[#0E2041] bg-[#F8FAFC]"
                                />
                            </View>

                            {selectedPlayers.length > 0 && (
                                <View className="flex-row flex-wrap gap-1.5">
                                    {selectedPlayers.map((p) => (
                                        <View key={p.id} className="flex-row items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-[#EBF1FF]">
                                            <Text className="text-[11.5px] font-bold text-[#1D3E90]">{p.firstName} {p.lastName}</Text>
                                            <Pressable onPress={() => setSelectedPlayers((prev) => prev.filter((sp) => sp.id !== p.id))} className="w-5 h-5 rounded-full items-center justify-center hover:bg-white/60">
                                                <X size={11} color="#1D3E90" />
                                            </Pressable>
                                        </View>
                                    ))}
                                </View>
                            )}

                            <View className="max-h-[160px] overflow-y-auto gap-1.5">
                                {searchingPlayers && <ActivityIndicator size="small" color="#1D3E90" />}
                                {!searchingPlayers && playerQuery.trim().length >= 2 && playerResults.length === 0 && (
                                    <Text className="text-[12px] font-semibold text-[#94A3B8]">Niciun jucător găsit.</Text>
                                )}
                                {playerResults.map((p) => (
                                    <Pressable
                                        key={p.id}
                                        onPress={() => { setSelectedPlayers((prev) => [...prev, p]); setPlayerResults((prev) => prev.filter((rp) => rp.id !== p.id)); }}
                                        className="flex-row items-center justify-between px-3.5 py-2.5 rounded-[12px] bg-[#F8FAFC] border border-[#F1F5F9] hover:bg-[#F1F5F9]"
                                    >
                                        <Text className="text-[13px] font-bold text-[#0E2041]">{p.firstName} {p.lastName}</Text>
                                        <Plus size={14} color="#1D3E90" />
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    )}

                    {step === 3 && (
                        <View className="gap-3">
                            <View className="bg-[#F4F8FD] rounded-[16px] p-4 border border-[#DDE7F5] gap-2">
                                <SummaryRow label="Echipă" value={source === 'frb' ? teamName : customName} />
                                <SummaryRow label="Sursă" value={source === 'frb' ? 'Import FRB' : 'Creare manuală'} />
                                <SummaryRow label="Sex" value={gender === 'M' ? 'Masculin' : 'Feminin'} />
                                <SummaryRow label="Nivel" value={level ? { national: 'Național', municipal: 'Municipal', initiere: 'Inițiere' }[level] : '—'} />
                                <SummaryRow label="Antrenor" value={coachId ? coaches.find((c) => c.id === coachId)?.name ?? '—' : 'Fără antrenor'} />
                                <SummaryRow label="Jucători selectați" value={String(selectedPlayers.length)} />
                            </View>
                            {error && <Text className="text-[12.5px] font-bold text-red-600">{error}</Text>}
                        </View>
                    )}

                </View>

                <View className="flex-row justify-between items-center px-6 py-4 border-t border-gray-100">
                    <Pressable onPress={goBack} disabled={step === 0 || creating} className={`h-10 px-3 ${step === 0 ? 'opacity-0' : ''}`}>
                        <Text className="text-[#64748B] font-black uppercase tracking-widest text-[12px]">Înapoi</Text>
                    </Pressable>
                    <Pressable
                        onPress={goNext}
                        disabled={creating || (step === 0 && !canAdvanceFromStep1) || (step === 1 && !canAdvanceFromStep2)}
                        className={`h-11 px-5 rounded-[14px] flex-row items-center gap-2 ${
                            creating || (step === 0 && !canAdvanceFromStep1) || (step === 1 && !canAdvanceFromStep2) ? 'bg-gray-200' : 'bg-[#1D3E90]'
                        }`}
                    >
                        {creating ? <ActivityIndicator size="small" color="#ffffff" /> : (
                            <>
                                {step === 3 && <Check size={14} color="#ffffff" />}
                                <Text className="text-white font-black uppercase tracking-widest text-[12px]">{step === 3 ? 'Creează echipa' : 'Continuă'}</Text>
                            </>
                        )}
                    </Pressable>
                </View>
            </Pressable>
        </Pressable>
        </Modal>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <View className="flex-row items-center justify-between">
            <Text className="text-[11.5px] font-bold text-[#64748B]">{label}</Text>
            <Text className="text-[12.5px] font-black text-[#0E2041]">{value}</Text>
        </View>
    );
}
